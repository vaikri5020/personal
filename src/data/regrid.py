"""
src/data/regrid.py

Puts every dataset onto the exact same lat/lon grid - the 0.25 deg target
grid defined in config/config.yaml - so surface patches and depth profiles
line up cell-for-cell later in the pairing step.

Why this is needed: the EDA notebook showed every raw dataset (GLORYS
included) sits on its own native grid. GLORYS is 0.083 deg; the surface
products (SST, SSS, SLA/currents, winds) are each on whatever grid their
source product ships with. Nothing downstream - patch extraction, pairing
surface data with Argo/GLORYS depth profiles - is valid until all of them
share one grid.

Method: bilinear interpolation via xarray's `.interp()`. This is a
reasonable, dependency-light choice for a 0.083 deg -> 0.25 deg downgrid
(no new information is being invented, just resampled onto coarser points).
It is not a conservative-area regridder (that would need `xesmf`, which is
awkward to install on Windows) - if a stricter physical average is ever
needed, that's the upgrade path, but bilinear is standard practice for this
kind of resolution change.

Caveat: linear interpolation blends whatever values are in neighbouring
cells, including NaN "land" cells near the coast. That can smear a few
coastal ocean cells toward NaN, or pull a fraction of a coastal value from
a land cell that's technically NaN (xarray's interp propagates NaN, so a
target cell adjacent to any NaN source cell becomes NaN too). That's the
safe direction to err in - it never invents ocean temperature over land -
but it does mean coastal cells are more likely to end up NaN after
regridding than before. This is expected and is handled downstream by the
same "permanent land mask" logic used in the cleaning notebook, not
something to fix here.

Usage:
    python src/data/regrid.py                       # regrid everything (glorys_raw + all surface products)
    python src/data/regrid.py --only glorys_raw       # just the raw GLORYS files, before cleaning
    python src/data/regrid.py --only sst sss          # just these surface products
"""

import argparse
from pathlib import Path

import numpy as np
import xarray as xr
import yaml

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "config.yaml"


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def build_target_grid(region: dict, resolution: dict):
    """Build the target lat/lon coordinate arrays from config.yaml bounds."""
    lat = np.arange(
        region["latitude_min"],
        region["latitude_max"] + resolution["latitude"] / 2,
        resolution["latitude"],
    )
    lon = np.arange(
        region["longitude_min"],
        region["longitude_max"] + resolution["longitude"] / 2,
        resolution["longitude"],
    )
    return lat, lon


def find_coord_names(ds: xr.Dataset):
    """Different sources name their coordinates differently - find them."""
    lat_name = next((c for c in ds.coords if c.lower() in ("lat", "latitude")), None)
    lon_name = next((c for c in ds.coords if c.lower() in ("lon", "longitude")), None)
    if lat_name is None or lon_name is None:
        raise KeyError(f"Could not find lat/lon coordinates in dataset: {list(ds.coords)}")
    return lat_name, lon_name


def regrid_dataset(ds: xr.Dataset, target_lat: np.ndarray, target_lon: np.ndarray) -> xr.Dataset:
    """Interpolate every data variable in ds onto the target lat/lon grid.

    Preserves all other dimensions (time, depth, ...) untouched - only
    latitude/longitude are resampled.
    """
    lat_name, lon_name = find_coord_names(ds)

    rename_map = {}
    if lat_name != "latitude":
        rename_map[lat_name] = "latitude"
    if lon_name != "longitude":
        rename_map[lon_name] = "longitude"
    if rename_map:
        ds = ds.rename(rename_map)

    regridded = ds.interp(
        latitude=target_lat,
        longitude=target_lon,
        method="linear",
    )
    return regridded


def regrid_glorys_raw(raw_dir: Path, processed_dir: Path, target_lat, target_lon,
                       overwrite: bool = False) -> Path:
    """Regrid the raw, native-resolution (0.083 deg), 36-depth GLORYS monthly
    files to the 0.25 deg target grid BEFORE any gap-filling/cleaning happens.

    Doing this first - instead of cleaning at native 0.083 deg and regridding
    afterward - cuts the expensive gap-filling step (interpolate_na) down to
    about 1/9th the grid points, since that step's cost scales with grid
    size.

    Processed ONE MONTH AT A TIME, loaded fully into memory before
    interpolating (not left as a dask array). This matters because
    xarray's .interp() over multi-dimensional (lat+lon) coordinates does not
    parallelize well with dask - it tends to silently materialize huge
    chunks internally, the same class of problem the depth=1 chunking fixed
    for interpolate_na. One month at native resolution is ~1 GB, which
    comfortably fits in memory, and plain in-memory (numpy) interpolation is
    fast and predictable - unlike the dask-lazy path, which can appear to
    hang with no progress output at all.
    """
    out_path = processed_dir / "glorys_2021_01_06_native_36depth_025deg.nc"
    if out_path.exists() and not overwrite:
        print(f"  [skip] {out_path.name} already exists")
        return out_path

    files = sorted(raw_dir.glob("glorys_*_deep.nc"))
    if not files:
        raise FileNotFoundError(f"No raw GLORYS files found in {raw_dir}")

    monthly_outputs = []
    for i, file in enumerate(files, 1):
        month_out = processed_dir / f"{file.stem}_025deg.nc"
        monthly_outputs.append(month_out)

        if month_out.exists() and not overwrite:
            print(f"  [{i}/{len(files)}] [skip] {month_out.name} already exists")
            continue

        print(f"  [{i}/{len(files)}] loading {file.name} into memory...")
        with xr.open_dataset(file) as ds_month:
            ds_month = ds_month[["thetao"]].astype("float32")
            ds_month = ds_month.load()  # force numpy, not dask - see docstring
            print(f"      loaded ({ds_month.nbytes / 1e6:.0f} MB) - regridding to 0.25 deg...")
            regridded = regrid_dataset(ds_month, target_lat, target_lon)
            encoding = {"thetao": {"zlib": True, "complevel": 4, "dtype": "float32"}}
            regridded.to_netcdf(month_out, encoding=encoding)
        print(f"      [done] -> {month_out.name}")

    print("  combining the 6 regridded monthly files into one...")
    with xr.open_mfdataset(
        monthly_outputs, combine="by_coords", engine="netcdf4",
        chunks={"time": 16, "depth": 1},
    ) as combined:
        encoding = {"thetao": {"zlib": True, "complevel": 4, "dtype": "float32"}}
        combined.to_netcdf(out_path, encoding=encoding)

    print(f"  [done] saved {out_path}")
    return out_path


def regrid_file(input_path: Path, output_path: Path, target_lat, target_lon,
                 depth_chunk: int = 1, overwrite: bool = False):
    if output_path.exists() and not overwrite:
        print(f"  [skip] {output_path.name} already exists")
        return

    print(f"  [regrid] {input_path.name} -> {output_path.name}")

    # depth_chunk=1 mirrors the fix from the preprocessing notebook: if a
    # dataset has a depth dimension, keep it chunked to one level at a time
    # so this never re-triggers the same kind of memory blowup.
    open_kwargs = {"chunks": {}}
    with xr.open_dataset(input_path, **open_kwargs) as ds:
        if "depth" in ds.dims:
            ds = ds.chunk({"depth": depth_chunk})

        regridded = regrid_dataset(ds, target_lat, target_lon)

        encoding = {
            var: {"zlib": True, "complevel": 4, "dtype": "float32"}
            for var in regridded.data_vars
        }
        regridded.to_netcdf(output_path, encoding=encoding)

    print(f"  [done] saved {output_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--only", nargs="+", default=None,
        help="Regrid only these datasets by key (glorys_raw, sst, sss, ssh_currents, wind_metopb). "
             "Default: all of them.",
    )
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    cfg = load_config()
    region = cfg["region"]
    resolution = cfg["resolution"]
    raw_dir = Path(cfg["paths"]["raw_data"])
    processed_dir = Path(cfg["paths"]["processed_data"])
    processed_dir.mkdir(parents=True, exist_ok=True)

    target_lat, target_lon = build_target_grid(region, resolution)
    print(f"Target grid: {len(target_lat)} lat x {len(target_lon)} lon points "
          f"({resolution['latitude']} deg resolution)")
    print(f"Lat range: {target_lat[0]:.3f} to {target_lat[-1]:.3f}")
    print(f"Lon range: {target_lon[0]:.3f} to {target_lon[-1]:.3f}\n")

    # Registry of every dataset that needs regridding: key -> (input, output)
    # NOTE: GLORYS is regridded BEFORE cleaning now (see regrid_glorys_raw
    # above), not after - the old post-cleaning "glorys" step is gone since
    # the cleaning notebook now outputs the final regridded+cleaned file
    # directly, already under the filename pairing.py expects.
    surface_datasets = {
        "sst": (
            raw_dir / "sst_2021_01_06.nc",
            processed_dir / "sst_2021_01_06_regridded.nc",
        ),
        "sss": (
            raw_dir / "sss_2021_01_06.nc",
            processed_dir / "sss_2021_01_06_regridded.nc",
        ),
        "ssh_currents": (
            raw_dir / "ssh_currents_2021_01_06.nc",
            processed_dir / "ssh_currents_2021_01_06_regridded.nc",
        ),
        "wind_metopb": (
            raw_dir / "wind_metopb_asc_2021_01_06.nc",
            processed_dir / "wind_metopb_2021_01_06_regridded.nc",
        ),
    }

    all_keys = ["glorys_raw"] + list(surface_datasets.keys())
    keys_to_run = args.only if args.only else all_keys

    for key in keys_to_run:
        if key not in all_keys:
            print(f"[warn] unknown dataset key '{key}', skipping. Known keys: {all_keys}")
            continue

        print(f"--- {key} ---")

        if key == "glorys_raw":
            regrid_glorys_raw(raw_dir, processed_dir, target_lat, target_lon, overwrite=args.overwrite)
            continue

        input_path, output_path = surface_datasets[key]
        if not input_path.exists():
            print(f"  [warn] input file not found: {input_path} - skipping")
            continue

        regrid_file(input_path, output_path, target_lat, target_lon, overwrite=args.overwrite)

    print("\nDone.")
    print("Next: run 02_preprocessing.ipynb - it now reads")
    print("  data/processed/glorys_2021_01_06_native_36depth_025deg.nc")
    print("and does gap-filling + 15-depth interpolation on the already-regridded")
    print("(much smaller) grid, saving the final file pairing.py expects directly.")


if __name__ == "__main__":
    main()
