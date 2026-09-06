"""
src/serving/map_predict.py

Powers the dashboard's "Ocean map view" heatmap: predicted temperature at
ONE depth, across the ENTIRE grid, for one date. Same trained OceanEmbed
model as predict.py - this file does not train or load a second model, it
just runs the existing one over every valid grid cell instead of one.

predict.py answers "what's the profile at this point". This file answers
"what's the temperature at this depth, everywhere". Both end at the same
model - see load_artifacts()/load_surface_stack(), imported from predict.py
rather than duplicated here.

WHY THIS IS BATCHED, NOT A PYTHON LOOP OVER 24,341 POINTS:
Calling model.predict() once per grid cell would mean 24,341 separate Keras
calls - each with its own Python/TensorFlow call overhead, on top of the
actual math. Extracting every patch first with one vectorized
sliding_window_view pass (same technique pairing.py uses for training data),
then handing the WHOLE stack to the model as a handful of large batches, is
the same computation done as tensor ops instead of a Python for-loop - this
is the difference between a query taking a few seconds and taking minutes.

CONFIDENCE IS OPTIONAL AND OFF BY DEFAULT HERE. predict.py's MC-dropout
confidence runs the model n_passes (default 30) times per query - fine for
one point, but 30x the cost across 24,341 points turns a few-second map
query into a genuinely slow one. Pass --confidence to compute it anyway
(reduced default passes for the grid case), but for the dashboard's live
map view, temperature-only is the right default; confidence is naturally
available per-point already via predict.py when the user clicks a location.

Usage:
    python src/serving/map_predict.py --date 2021-06-15 --depth 100
    python src/serving/map_predict.py --date 2021-06-15 --depth 100 --confidence
    python src/serving/map_predict.py --date 2021-06-15 --depth 100 --out data/processed/maps/
"""

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import xarray as xr
from numpy.lib.stride_tricks import sliding_window_view

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.preprocessing.pairing import CHANNELS, PATCH_SIZE, PATCH_HALF
from src.serving.predict import (
    load_artifacts, load_surface_stack, _nearest_available_date, PredictionError,
)

DEFAULT_MAP_MC_PASSES = 8  # cheaper than predict.py's default 30 - see docstring


def _extract_grid_patches(surface_day: xr.Dataset):
    """Vectorized patch extraction for every interior grid cell on one day -
    the same sliding_window_view approach as pairing.py's extract_day_pairs,
    but keeping every cell (valid or not) so the output stays a full,
    regularly-shaped grid. Invalid cells are masked afterward, not dropped,
    since a heatmap needs to know WHERE data is missing (land, gaps), not
    just skip silently over it.

    Returns:
        patches   : (n_lat_valid, n_lon_valid, patch, patch, channels) float32
        valid_mask: (n_lat_valid, n_lon_valid) bool - True where the patch
                     has no NaN in any channel
        grid_lat, grid_lon : the interior lat/lon coordinate arrays
                     (edges are dropped - see PATCH_HALF margin, same as training)
    """
    lat = surface_day.latitude.values
    lon = surface_day.longitude.values
    n_lat, n_lon = len(lat), len(lon)

    if n_lat <= PATCH_SIZE or n_lon <= PATCH_SIZE:
        raise PredictionError(
            f"Grid ({n_lat} x {n_lon}) is too small for a {PATCH_SIZE}x{PATCH_SIZE} patch."
        )

    channel_stack = np.stack(
        [surface_day[ch].values.astype("float32") for ch in CHANNELS], axis=0
    )  # (channel, lat, lon)

    # (channel, n_lat-4, n_lon-4, patch, patch)
    windows = sliding_window_view(channel_stack, (PATCH_SIZE, PATCH_SIZE), axis=(1, 2))

    valid_mask = ~np.isnan(windows).any(axis=(0, 3, 4))  # (n_lat-4, n_lon-4)

    # channel-last, matching the (patch, patch, channels) shape the model expects
    patches = np.moveaxis(windows, 0, -1)  # (n_lat-4, n_lon-4, patch, patch, channel)

    grid_lat = lat[PATCH_HALF: n_lat - PATCH_HALF]
    grid_lon = lon[PATCH_HALF: n_lon - PATCH_HALF]

    return patches, valid_mask, grid_lat, grid_lon


def predict_grid(artifacts: dict, surface: xr.Dataset, date_str: str = None,
                  depth_m: float = 100, compute_confidence: bool = False,
                  n_mc_passes: int = DEFAULT_MAP_MC_PASSES, batch_size: int = 4096) -> dict:
    """Predict temperature at one depth, across the whole grid, for one date.

    Returns a dict shaped for the dashboard's heatmap:
        {
            "date": "2021-06-15", "exact_date_match": True,
            "depth": 100.0,
            "latitude": [...], "longitude": [...],   # grid_lat (M,), grid_lon (N,)
            "temperature": [[...], ...],               # (M, N), NaN where masked
            "confidence": [[...], ...] or None,        # (M, N), only if requested
        }
    """
    date, exact = _nearest_available_date(surface, date_str)
    surface_day = surface.sel(time=date)

    depths = np.asarray(artifacts["depths"])
    depth_idx = int(np.argmin(np.abs(depths - depth_m)))
    resolved_depth = float(depths[depth_idx])

    print(f"Extracting patches for every grid cell on {str(date)[:10]}...")
    t0 = time.time()
    patches, valid_mask, grid_lat, grid_lon = _extract_grid_patches(surface_day)
    n_lat_g, n_lon_g = valid_mask.shape
    print(f"  grid: {n_lat_g} lat x {n_lon_g} lon = {n_lat_g * n_lon_g:,} cells "
          f"({valid_mask.sum():,} valid, {(~valid_mask).sum():,} masked - land/gaps) "
          f"[{time.time() - t0:.1f}s]")

    flat_patches = patches.reshape(-1, PATCH_SIZE, PATCH_SIZE, len(CHANNELS))
    flat_valid = valid_mask.reshape(-1)
    valid_idx = np.nonzero(flat_valid)[0]

    if len(valid_idx) == 0:
        raise PredictionError(
            f"No valid grid cells on {str(date)[:10]} - every patch touches land or a data gap."
        )

    valid_patches = flat_patches[valid_idx]
    valid_patches_norm = (valid_patches - artifacts["channel_mean"][0]) / artifacts["channel_std"][0]
    valid_patches_norm = valid_patches_norm.astype("float32")

    print(f"Running model over {len(valid_idx):,} valid cells in batches of {batch_size}...")
    t0 = time.time()
    model = artifacts["model"]

    if compute_confidence:
        # MC-dropout: n_mc_passes forward passes with dropout left on (see
        # predict.py's _mc_dropout_confidence for why this gives a real
        # per-cell uncertainty signal instead of a fabricated number).
        sum_pred = np.zeros((len(valid_idx),), dtype="float64")
        sum_sq = np.zeros((len(valid_idx),), dtype="float64")
        for _ in range(n_mc_passes):
            pass_preds = np.empty((len(valid_idx),), dtype="float32")
            for start in range(0, len(valid_idx), batch_size):
                end = min(start + batch_size, len(valid_idx))
                batch_out = model(valid_patches_norm[start:end], training=True).numpy()
                pass_preds[start:end] = batch_out[:, depth_idx]
            sum_pred += pass_preds
            sum_sq += pass_preds ** 2
        mean_norm = sum_pred / n_mc_passes
        var_norm = np.clip(sum_sq / n_mc_passes - mean_norm ** 2, 0, None)
        std_norm = np.sqrt(var_norm)
        valid_confidence = 100 - np.clip(std_norm * 60, 0, 60)
    else:
        preds = np.empty((len(valid_idx),), dtype="float32")
        for start in range(0, len(valid_idx), batch_size):
            end = min(start + batch_size, len(valid_idx))
            batch_out = model.predict(valid_patches_norm[start:end], verbose=0)
            preds[start:end] = batch_out[:, depth_idx]
        mean_norm = preds
        valid_confidence = None

    print(f"  done [{time.time() - t0:.1f}s]")

    depth_mean = artifacts["depth_mean"][0][depth_idx]
    depth_std = artifacts["depth_std"][0][depth_idx]
    valid_temps = mean_norm * depth_std + depth_mean

    temperature_flat = np.full((n_lat_g * n_lon_g,), np.nan, dtype="float32")
    temperature_flat[valid_idx] = valid_temps
    temperature_grid = temperature_flat.reshape(n_lat_g, n_lon_g)

    confidence_grid = None
    if compute_confidence:
        confidence_flat = np.full((n_lat_g * n_lon_g,), np.nan, dtype="float32")
        confidence_flat[valid_idx] = valid_confidence
        confidence_grid = confidence_flat.reshape(n_lat_g, n_lon_g)

    return {
        "date": str(date)[:10],
        "exact_date_match": bool(exact),
        "depth": resolved_depth,
        "latitude": grid_lat.tolist(),
        "longitude": grid_lon.tolist(),
        "temperature": np.round(temperature_grid, 2).tolist(),
        "confidence": np.round(confidence_grid, 1).tolist() if confidence_grid is not None else None,
    }


def save_grid(result: dict, out_dir: Path) -> Path:
    """Save a predict_grid() result as a compressed .npz - cheap to load
    for repeated dashboard requests without recomputing the whole grid.
    A Django endpoint should serve from this cache, refreshing it on the
    same schedule as the surface data fetch, rather than calling
    predict_grid() directly on every map request."""
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"map_{result['date']}_{int(result['depth'])}m.npz"
    np.savez_compressed(
        out_path,
        latitude=np.array(result["latitude"], dtype="float32"),
        longitude=np.array(result["longitude"], dtype="float32"),
        temperature=np.array(result["temperature"], dtype="float32"),
        confidence=(np.array(result["confidence"], dtype="float32")
                    if result["confidence"] is not None else np.array([])),
        date=result["date"],
        depth=result["depth"],
    )
    return out_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=None, help="YYYY-MM-DD (default: latest available)")
    parser.add_argument("--depth", type=float, default=100, help="Target depth in meters (default: 100)")
    parser.add_argument("--confidence", action="store_true",
                         help="Also compute per-cell MC-dropout confidence (slower - see docstring)")
    parser.add_argument("--mc-passes", type=int, default=DEFAULT_MAP_MC_PASSES)
    parser.add_argument("--batch-size", type=int, default=4096)
    parser.add_argument("--out", default=None,
                         help="Directory to save the result as .npz (default: print summary only)")
    args = parser.parse_args()

    print("Loading model + normalization stats...")
    artifacts = load_artifacts()
    print("\nLoading surface data...")
    surface = load_surface_stack()

    print(f"\nBuilding map for depth={args.depth}m"
          f"{f', date={args.date}' if args.date else ' (latest available date)'}...\n")
    result = predict_grid(
        artifacts, surface, date_str=args.date, depth_m=args.depth,
        compute_confidence=args.confidence, n_mc_passes=args.mc_passes,
        batch_size=args.batch_size,
    )

    if not result["exact_date_match"]:
        print(f"\n[note] {args.date} not available - used nearest date {result['date']} instead")

    temp_arr = np.array(result["temperature"], dtype="float32")
    valid = ~np.isnan(temp_arr)
    print(f"\nResolved depth: {result['depth']} m, date: {result['date']}")
    print(f"Grid: {temp_arr.shape[0]} x {temp_arr.shape[1]}, {valid.sum():,} valid cells")
    print(f"Temperature range: {np.nanmin(temp_arr):.2f} to {np.nanmax(temp_arr):.2f} C "
          f"(mean {np.nanmean(temp_arr):.2f} C)")
    if result["confidence"] is not None:
        conf_arr = np.array(result["confidence"], dtype="float32")
        print(f"Confidence range: {np.nanmin(conf_arr):.0f}% to {np.nanmax(conf_arr):.0f}%")

    if args.out:
        out_path = save_grid(result, Path(args.out))
        print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
