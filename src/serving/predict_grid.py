"""
src/serving/predict_grid.py

Runs the model over every valid grid cell in the region for one date and
one target depth, producing the raster the dashboard's "Ocean Map View"
heatmap actually renders. This is DELIBERATELY a separate, offline/batch
script from predict.py's single-point predict_profile() - running the CNN
over every pixel is too slow to do live on every map interaction (zoom,
pan, depth change), so it's precomputed and cached instead.

Recommended usage: run this once per day (per date you have surface data
for) as a scheduled job, save the output, and have the Django backend serve
the cached raster directly - not regenerate it per request.

Usage:
    python src/serving/predict_grid.py --date 2021-03-15 --depth 100
    # -> writes data/processed/grids/grid_2021-03-15_depth100m.nc

    python src/serving/predict_grid.py --date 2021-03-15 --all-depths
    # -> one file per target depth, same date
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import xarray as xr

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.preprocessing.pairing import CHANNELS, PATCH_SIZE, PATCH_HALF
from src.serving.predict import load_artifacts, load_surface_stack


def predict_full_grid(artifacts: dict, surface: xr.Dataset, date_str: str,
                       batch_size: int = 512):
    """Vectorized version of the same patch-extraction predict.py does for
    one point, run for every valid center cell at once.

    Returns a (lat, lon, n_depths) array, NaN wherever a full patch
    couldn't be extracted (land, coastline, data gaps) - exactly the same
    cells predict_profile() would have refused to serve one at a time.
    """
    day = surface.sel(time=np.datetime64(date_str), method="nearest")
    lat_vals = day.latitude.values
    lon_vals = day.longitude.values
    n_lat, n_lon = len(lat_vals), len(lon_vals)
    n_depths = len(artifacts["depths"])

    channel_stack = np.stack([day[ch].values for ch in CHANNELS], axis=-1).astype("float32")
    # channel_stack: (n_lat, n_lon, n_channels)

    output = np.full((n_lat, n_lon, n_depths), np.nan, dtype="float32")

    valid_centers = []
    for i in range(PATCH_HALF, n_lat - PATCH_HALF):
        for j in range(PATCH_HALF, n_lon - PATCH_HALF):
            window = channel_stack[i - PATCH_HALF:i + PATCH_HALF + 1,
                                    j - PATCH_HALF:j + PATCH_HALF + 1, :]
            if not np.isnan(window).any():
                valid_centers.append((i, j, window))

    print(f"{len(valid_centers)} / {n_lat * n_lon} grid cells have a complete patch "
          f"({100 * len(valid_centers) / (n_lat * n_lon):.1f}%)")

    for start in range(0, len(valid_centers), batch_size):
        chunk = valid_centers[start:start + batch_size]
        batch = np.stack([c[2] for c in chunk], axis=0)
        batch_norm = (batch - artifacts["channel_mean"][0]) / artifacts["channel_std"][0]

        pred_norm = artifacts["model"].predict(batch_norm, verbose=0)
        pred = pred_norm * artifacts["depth_std"][0] + artifacts["depth_mean"][0]

        for (i, j, _), row in zip(chunk, pred):
            output[i, j, :] = row

        print(f"  {min(start + batch_size, len(valid_centers))}/{len(valid_centers)} cells done")

    return xr.Dataset(
        {"temperature": (("latitude", "longitude", "depth"), output)},
        coords={"latitude": lat_vals, "longitude": lon_vals, "depth": artifacts["depths"]},
        attrs={"date": date_str, "source": "OceanEmbed CNN batch grid prediction"},
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--depth", type=float, default=None,
                         help="Save only this target depth (m). Omit with --all-depths instead.")
    parser.add_argument("--all-depths", action="store_true")
    parser.add_argument("--out-dir", default=None)
    args = parser.parse_args()

    if args.depth is None and not args.all_depths:
        parser.error("pass --depth <m> or --all-depths")

    print("Loading model + normalization stats...")
    artifacts = load_artifacts()
    print("Loading surface data...")
    surface = load_surface_stack()

    print(f"\nRunning full-grid prediction for {args.date}...")
    grid_ds = predict_full_grid(artifacts, surface, args.date)

    out_dir = Path(args.out_dir) if args.out_dir else PROJECT_ROOT / "data" / "processed" / "grids"
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.all_depths:
        out_path = out_dir / f"grid_{args.date}_alldepths.nc"
        grid_ds.to_netcdf(out_path)
        print(f"\nSaved all depths -> {out_path}")
    else:
        depth_idx = int(np.argmin(np.abs(np.array(artifacts["depths"]) - args.depth)))
        single = grid_ds.isel(depth=depth_idx)
        out_path = out_dir / f"grid_{args.date}_depth{int(artifacts['depths'][depth_idx])}m.nc"
        single.to_netcdf(out_path)
        print(f"\nSaved depth={artifacts['depths'][depth_idx]}m -> {out_path}")

    print("\nThe Django backend should read this file directly to serve the map "
          "heatmap - not call predict_profile() once per pixel.")


if __name__ == "__main__":
    main()
