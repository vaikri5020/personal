"""
src/serving/predict.py

The entry points the backend calls:
    predict_profile(artifacts, surface, lat, lon, date_str=None)
        -> one location, one date: 15-depth profile + surface stats + confidence
    predict_timeseries(artifacts, surface, lat, lon, depth_m, start_date=None, end_date=None)
        -> one location, one depth, every available date

Reuses the exact same patch-extraction logic as pairing.py (same channel
order, same "drop if any NaN in the 5x5 window" rule) so a served
prediction is built identically to a training sample.

Loading is split into two steps on purpose:
    artifacts = load_artifacts()          # model + normalization stats - do ONCE at startup
    surface = load_surface_stack()        # regridded surface data - do ONCE at startup
    predict_profile(artifacts, surface, lat, lon)   # do PER REQUEST - cheap
A Django app should load both once (e.g. AppConfig.ready(), or a
module-level singleton) and reuse them across requests - reloading the
.keras model or re-opening the netCDF files per call would make every
request far slower than it needs to be.

Usage (CLI, for testing):
    python src/serving/predict.py --lat 14.2 --lon 68.5
    python src/serving/predict.py --lat 14.2 --lon 68.5 --date 2021-03-15
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
import yaml
from tensorflow import keras

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.preprocessing.pairing import (
    CHANNELS, PATCH_SIZE, PATCH_HALF, open_surface_stack,
)

CONFIG_PATH = PROJECT_ROOT / "config" / "config.yaml"


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


# --------------------------------------------------------------------------
# One-time setup (call once at process/app startup, not per request)
# --------------------------------------------------------------------------

def load_artifacts(models_dir: Path = None) -> dict:
    """Load the trained model plus both normalization files.

    Returns a dict of everything predict_profile() needs, so it's one
    object to hold onto (e.g. as a Django app-level singleton).
    """
    cfg = load_config()
    models_dir = models_dir or Path(cfg["paths"].get("models", PROJECT_ROOT / "models"))

    model_path = models_dir / "oceanembed_final.keras"
    if not model_path.exists():
        raise FileNotFoundError(
            f"Trained model not found at {model_path}. Run 05_cnn_model.ipynb first."
        )
    model = keras.models.load_model(model_path, safe_mode=False)

    input_norm = np.load(models_dir / "oceanembed_normalization.npz", allow_pickle=True)
    target_norm = np.load(models_dir / "oceanembed_target_normalization.npz", allow_pickle=True)

    channel_mean, channel_std = input_norm["mean"], input_norm["std"]
    depth_mean, depth_std = target_norm["mean"], target_norm["std"]
    depths = target_norm["depths"]
    saved_channels = list(input_norm["channels"])

    if saved_channels != CHANNELS:
        raise ValueError(
            f"Channel order mismatch: model was trained on {saved_channels}, "
            f"but pairing.py currently defines CHANNELS={CHANNELS}. These must "
            f"match exactly, in order - do not silently reorder."
        )

    print(f"Loaded model from {model_path.name}")
    print(f"Channels ({len(CHANNELS)}): {CHANNELS}")
    print(f"Depths ({len(depths)}): {list(depths)}")

    return {
        "model": model,
        "channel_mean": channel_mean,
        "channel_std": channel_std,
        "depth_mean": depth_mean,
        "depth_std": depth_std,
        "depths": depths,
    }


def load_surface_stack():
    """Open the regridded surface files once. Returns the same combined
    Dataset that pairing.py builds training samples from."""
    cfg = load_config()
    processed_dir = Path(cfg["paths"]["processed_data"])
    surface = open_surface_stack(processed_dir)
    print(f"Surface stack loaded: {surface.time.size} days available "
          f"({str(surface.time.values[0])[:10]} to {str(surface.time.values[-1])[:10]})")
    if surface.time.size < 30:
        print("[WARNING] Fewer than 30 days available after aligning the surface sources - "
              "a time series over any reasonable date range will repeat the same few days. "
              "See the [WARNING] printed by open_surface_stack() above for the likely cause.")
    return surface


# --------------------------------------------------------------------------
# Per-request prediction
# --------------------------------------------------------------------------

class PredictionError(ValueError):
    """Raised when a query can't be served - land, missing data, out of
    range - so the backend can turn this into a clean 4xx API response
    instead of a raw stack trace."""


def _nearest_available_date(surface: xr.Dataset, date_str: str = None):
    """Pick the surface stack's date closest to the requested one. If no
    date is given, use the most recent day available (the "current
    conditions" default for a live map click)."""
    if date_str is None:
        chosen = surface.time.values[-1]
        return chosen, False

    requested = np.datetime64(date_str)
    times = surface.time.values
    nearest_idx = np.argmin(np.abs(times - requested))
    chosen = times[nearest_idx]
    exact = chosen == requested
    return chosen, exact


def _extract_query_patch(surface: xr.Dataset, lat: float, lon: float, date):
    """Pull the 5x5 multi-channel patch centered on the grid cell nearest
    (lat, lon), for one day. Raises PredictionError with a clear reason if
    the point can't be served (outside the grid, or the patch touches any
    NaN - land or a data gap).

    Returns (patch, actual_lat, actual_lon, center_values) where
    center_values is a plain {channel: raw_value} dict for the center
    pixel - used for the dashboard's SST/SSS/wind/current stat cards,
    which want the real surface reading, not a normalized one.
    """
    day = surface.sel(time=date)

    lat_vals = day.latitude.values
    lon_vals = day.longitude.values

    if not (lat_vals.min() <= lat <= lat_vals.max()) or not (lon_vals.min() <= lon <= lon_vals.max()):
        raise PredictionError(
            f"({lat}, {lon}) is outside the covered region "
            f"(lat {lat_vals.min():.2f}-{lat_vals.max():.2f}, "
            f"lon {lon_vals.min():.2f}-{lon_vals.max():.2f})."
        )

    lat_idx = int(np.argmin(np.abs(lat_vals - lat)))
    lon_idx = int(np.argmin(np.abs(lon_vals - lon)))

    n_lat, n_lon = len(lat_vals), len(lon_vals)
    if not (PATCH_HALF <= lat_idx < n_lat - PATCH_HALF) or not (PATCH_HALF <= lon_idx < n_lon - PATCH_HALF):
        raise PredictionError(
            f"({lat}, {lon}) is too close to the edge of the covered region "
            f"to extract a full {PATCH_SIZE}x{PATCH_SIZE} patch."
        )

    lat_slice = slice(lat_idx - PATCH_HALF, lat_idx + PATCH_HALF + 1)
    lon_slice = slice(lon_idx - PATCH_HALF, lon_idx + PATCH_HALF + 1)

    channel_arrays = []
    for ch in CHANNELS:
        window = day[ch].values[lat_slice, lon_slice]
        if window.shape != (PATCH_SIZE, PATCH_SIZE):
            raise PredictionError(
                f"({lat}, {lon}) is too close to the grid boundary for channel '{ch}'."
            )
        if np.isnan(window).any():
            raise PredictionError(
                f"No prediction available at ({lat}, {lon}) on {str(date)[:10]} - "
                f"the surface patch is incomplete here (likely land, coastline, or "
                f"a satellite data gap on this date)."
            )
        channel_arrays.append(window)

    patch = np.stack(channel_arrays, axis=-1).astype("float32")  # (5, 5, n_channels)
    actual_lat = float(lat_vals[lat_idx])
    actual_lon = float(lon_vals[lon_idx])
    center = PATCH_HALF
    center_values = {ch: float(patch[center, center, i]) for i, ch in enumerate(CHANNELS)}

    return patch, actual_lat, actual_lon, center_values


def _surface_stats_from_center(center_values: dict) -> dict:
    """Turn raw channel values into the stat-card numbers the dashboard shows.

    Current and wind are stored as u/v components - the dashboard wants a
    single speed number, so combine them here (this is the one place that
    logic should live, not duplicated in the frontend).
    """
    current_speed = float(np.hypot(center_values["ugos"], center_values["vgos"]))
    wind_speed = float(np.hypot(center_values["eastward_wind"], center_values["northward_wind"]))
    return {
        "sst": round(center_values["sst"], 2),
        "sss": round(center_values["sss"], 2),
        "sla": round(center_values["sla"], 3),
        "current_speed_ms": round(current_speed, 2),
        "wind_speed_ms": round(wind_speed, 2),
    }


def _mc_dropout_confidence(model, patch_batch, n_passes: int = 30):
    """Run the trained model n_passes times with dropout left ON
    (training=True), and use the spread across those passes as a per-depth
    uncertainty estimate.

    Why this works without retraining anything: oceanembed_model.py's
    decoder already has Dropout layers after every decoder Dense layer.
    Normally dropout is disabled at inference (the Keras default for
    .predict()). Leaving it ON instead turns the same trained weights into
    an ensemble - each pass randomly zeroes a different subset of decoder
    units, so passes disagree more where the model is less confident (e.g.
    the thermocline, or sparsely-sampled areas) and agree more where it's
    confident (e.g. shallow depths with lots of nearby training data).

    This is an approximation (proper Bayesian deep learning is a bigger
    undertaking), but it's a real, defensible uncertainty signal - not a
    fabricated number - and costs only n_passes extra forward passes,
    which are cheap for a model this small.

    IMPORTANT - the floor (40) and scale (60) below are a starting point,
    not a statistical guarantee. Once you have real predictions on your
    validation set, compute std_pred across many samples and check its
    actual distribution (see the calibration snippet in this file's
    docstring-adjacent comment below) - tune these two numbers so that
    "high confidence" and "low confidence" actually mean something for
    YOUR model's real spread, not an arbitrary guess.

    Returns:
        mean_pred_norm (n_depths,) - average prediction, still in the
                       model's normalized/z-score units (caller denormalizes)
        confidence     (n_depths,) - 0-100
    """
    preds = np.stack([
        model(patch_batch, training=True).numpy()[0]
        for _ in range(n_passes)
    ], axis=0)  # (n_passes, n_depths)

    mean_pred = preds.mean(axis=0)
    std_pred = preds.std(axis=0)

    confidence = 100 - np.clip(std_pred * 60, 0, 60)
    return mean_pred, confidence


def predict_profile(artifacts: dict, surface: xr.Dataset, lat: float, lon: float,
                     date_str: str = None, n_mc_passes: int = 30) -> dict:
    """Predict a 15-depth temperature profile for one location and date.

    Returns a plain dict, ready to serialize as JSON:
        {
            "query": {"lat": ..., "lon": ...},
            "resolved": {"lat": ..., "lon": ..., "date": "YYYY-MM-DD",
                         "exact_date_match": bool},
            "depths": [0, 10, ...],
            "temperatures": [29.1, 28.4, ...],
            "confidence": [92.3, 88.1, ...],          # 0-100, per depth
            "confidence_overall": 90.4,                 # mean, for a single stat card
            "surface_stats": {"sst": ..., "sss": ..., "sla": ...,
                               "current_speed_ms": ..., "wind_speed_ms": ...},
        }
    Raises PredictionError (safe to catch and turn into a 400/404 response)
    if the location or date can't be served.
    """
    date, exact = _nearest_available_date(surface, date_str)
    patch, actual_lat, actual_lon, center_values = _extract_query_patch(surface, lat, lon, date)

    patch_norm = (patch - artifacts["channel_mean"][0]) / artifacts["channel_std"][0]
    patch_batch = patch_norm[np.newaxis, ...].astype("float32")

    mean_pred_norm, confidence = _mc_dropout_confidence(
        artifacts["model"], patch_batch, n_passes=n_mc_passes
    )
    temperatures = (mean_pred_norm * artifacts["depth_std"][0] + artifacts["depth_mean"][0]).tolist()

    return {
        "query": {"lat": lat, "lon": lon},
        "resolved": {
            "lat": actual_lat,
            "lon": actual_lon,
            "date": str(date)[:10],
            "exact_date_match": bool(exact),
        },
        "depths": [float(d) for d in artifacts["depths"]],
        "temperatures": [round(t, 2) for t in temperatures],
        "confidence": [round(float(c), 1) for c in confidence],
        "confidence_overall": round(float(confidence.mean()), 1),
        "surface_stats": _surface_stats_from_center(center_values),
    }


def predict_timeseries(artifacts: dict, surface: xr.Dataset, lat: float, lon: float,
                        depth_m: float, start_date: str = None, end_date: str = None) -> dict:
    """Powers the dashboard's "Time series at selected location" chart:
    the predicted temperature at ONE depth, across every available date.

    Loops predict_profile() over each day - there's no batching win here
    the way there is for predict_grid.py, since it's one location (one
    patch) per day, not every pixel per day.

    If every point in the returned series has the same temperature, that
    is NOT this function's bug - it means `surface` itself only has a
    handful of distinct days after alignment. Check the day-count printed
    by load_surface_stack() first.
    """
    all_dates = pd.to_datetime(surface.time.values)
    if start_date:
        all_dates = all_dates[all_dates >= pd.Timestamp(start_date)]
    if end_date:
        all_dates = all_dates[all_dates <= pd.Timestamp(end_date)]

    depth_idx = int(np.argmin(np.abs(np.array(artifacts["depths"]) - depth_m)))
    resolved_depth = float(artifacts["depths"][depth_idx])

    series = []
    for d in all_dates:
        date_str = d.strftime("%Y-%m-%d")
        try:
            result = predict_profile(artifacts, surface, lat, lon, date_str)
            series.append({
                "date": date_str,
                "temperature": result["temperatures"][depth_idx],
                "confidence": result["confidence"][depth_idx],
            })
        except PredictionError:
            # Same location can be valid on some days and not others (e.g.
            # a transient data gap) - skip that day rather than failing the
            # whole series. The frontend will just show a gap in the line.
            continue

    return {"lat": lat, "lon": lon, "depth": resolved_depth, "series": series}


# --------------------------------------------------------------------------
# CLI entry point, for quick manual testing without standing up the backend
# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--date", default=None, help="YYYY-MM-DD (default: latest available)")
    parser.add_argument("--timeseries-depth", type=float, default=None,
                         help="If set, print a time series at this depth (m) instead of one profile")
    args = parser.parse_args()

    print("Loading model + normalization stats...")
    artifacts = load_artifacts()
    print("\nLoading surface data...")
    surface = load_surface_stack()

    if args.timeseries_depth is not None:
        print(f"\nPredicting time series at ({args.lat}, {args.lon}), depth={args.timeseries_depth}m...\n")
        result = predict_timeseries(artifacts, surface, args.lat, args.lon, args.timeseries_depth)
        print(f"Resolved depth: {result['depth']} m, {len(result['series'])} days\n")
        distinct_values = {row["temperature"] for row in result["series"]}
        if len(distinct_values) == 1 and len(result["series"]) > 3:
            print(f"[WARNING] All {len(result['series'])} days returned the exact same "
                  f"temperature ({distinct_values.pop()}) - this means `surface` only has "
                  f"a handful of truly distinct days after alignment. Re-check the day-count "
                  f"printed above by load_surface_stack().\n")
        for row in result["series"][:10]:
            print(f"  {row['date']}  {row['temperature']:>6.2f} C  (confidence {row['confidence']:.0f}%)")
        if len(result["series"]) > 10:
            print(f"  ... and {len(result['series']) - 10} more")
        return

    print(f"\nPredicting for ({args.lat}, {args.lon})"
          f"{f' on {args.date}' if args.date else ' (latest available date)'}...\n")
    try:
        result = predict_profile(artifacts, surface, args.lat, args.lon, args.date)
    except PredictionError as e:
        print(f"[unable to predict] {e}")
        return

    if not result["resolved"]["exact_date_match"]:
        print(f"[note] {args.date} not available - using nearest date "
              f"{result['resolved']['date']} instead\n")

    print(f"Resolved to grid cell ({result['resolved']['lat']}, {result['resolved']['lon']}) "
          f"on {result['resolved']['date']}")
    print(f"Surface stats: {result['surface_stats']}")
    print(f"Overall confidence: {result['confidence_overall']}%\n")
    print(f"{'Depth (m)':>12}  {'Temp (\u00b0C)':>10}  {'Confidence':>10}")
    print("-" * 38)
    for d, t, c in zip(result["depths"], result["temperatures"], result["confidence"]):
        print(f"{d:>12.0f}  {t:>10.2f}  {c:>9.0f}%")


if __name__ == "__main__":
    main()
