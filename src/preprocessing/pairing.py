"""
src/preprocessing/pairing.py

Builds the actual CNN training set. For a thinned selection of days (every
--every-n-days), extracts a 5x5 multi-channel surface patch around every
valid ocean grid cell and pairs it with the matching 15-depth GLORYS
temperature profile at that same time and location.

ASSUMPTIONS TO VERIFY (variable names inside your regridded files depend on
exactly which CMEMS dataset IDs you fetched - these are best-guess defaults
for the standard products; if a channel comes back wrong, this script will
print the variable names it found so you can fix the mapping below):

    CHANNEL_VAR_HINTS = {
        "sst": ["analysed_sst", "sst", "thetao"],
        "sss": ["sos", "sss"],
        "sla": ["sla", "zos"],
        "ugos": ["ugos", "uo"],
        "vgos": ["vgos", "vo"],
        "eastward_wind": ["eastward_wind", "u10", "uwnd"],
        "northward_wind": ["northward_wind", "v10", "vwnd"],
    }

Output: one file per selected day, in data/processed/pairs/pairs_YYYY-MM-DD.nc
    patch:      (sample, channel, 5, 5)  float32   - channel order = CHANNELS below
    profile:    (sample, depth)          float32   - the 15 target depths
    valid_mask: (sample, depth)          bool      - True where profile value is real
                                                      (some deep levels are legitimately
                                                      missing over shallow shelf areas -
                                                      this is bathymetry, not a bug)
    latitude, longitude: (sample,)                 - so every sample traces back to a location
    time:       scalar attribute on the file

A sample is only kept if:
  - every surface channel has a real (non-NaN) value across the full 5x5 patch
    (a patch touching land/NaN anywhere is dropped, not filled in), and
  - the target profile has at most --max-missing-depths missing depths.

Usage:
    python src/preprocessing/pairing.py --every-n-days 5
    python src/preprocessing/pairing.py --every-n-days 5 --max-missing-depths 3
"""

import argparse
from pathlib import Path

import numpy as np
import xarray as xr
import yaml
from numpy.lib.stride_tricks import sliding_window_view

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "config.yaml"

PATCH_SIZE = 5
PATCH_HALF = PATCH_SIZE // 2

# Fixed channel order - the model must always receive channels in this order.
CHANNELS = ["sst", "sss", "sla", "ugos", "vgos", "eastward_wind", "northward_wind"]

CHANNEL_VAR_HINTS = {
    "sst": ["analysed_sst", "sst", "thetao"],
    "sss": ["sos", "sss"],
    "sla": ["sla", "zos"],
    "ugos": ["ugos", "uo"],
    "vgos": ["vgos", "vo"],
    "eastward_wind": ["eastward_wind", "u10", "uwnd"],
    "northward_wind": ["northward_wind", "v10", "vwnd"],
}


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def find_var(ds: xr.Dataset, hints, label: str) -> str:
    for name in hints:
        if name in ds.data_vars:
            return name
    available = list(ds.data_vars)
    if len(available) == 1:
        print(f"  [note] '{label}' not found by name, using the only variable present: {available[0]}")
        return available[0]
    raise KeyError(
        f"Could not find a variable for channel '{label}' in {available}. "
        f"Edit CHANNEL_VAR_HINTS in this script to match your file."
    )


def standardize_coords(ds: xr.Dataset) -> xr.Dataset:
    lat_name = next((c for c in ds.coords if c.lower() in ("lat", "latitude")), None)
    lon_name = next((c for c in ds.coords if c.lower() in ("lon", "longitude")), None)
    rename = {}
    if lat_name and lat_name != "latitude":
        rename[lat_name] = "latitude"
    if lon_name and lon_name != "longitude":
        rename[lon_name] = "longitude"
    return ds.rename(rename) if rename else ds


def _floor_to_day(ds: xr.Dataset) -> xr.Dataset:
    """Normalize the time coordinate to midnight of its calendar day.

    Different CMEMS/ASCAT products can stamp daily files at different
    times of day (00:00, 12:00, or an exact satellite overpass time).
    Combining datasets whose time coordinates don't match EXACTLY causes
    xarray to silently outer-join on assignment (ds["var"] = other_da),
    filling any non-matching day with NaN for that variable - or, if the
    mismatch is systematic across every day (not just a few edge cases),
    can collapse the usable overlap down to almost nothing. This is the
    most likely cause of a served time series returning the same value
    for every requested date: if only a handful of days truly line up
    across all four sources, every nearby date snaps to one of them.
    Flooring every source's time coordinate to the day before combining
    fixes this regardless of each product's own time-of-day convention.
    """
    day_values = ds["time"].values.astype("datetime64[D]").astype("datetime64[ns]")
    return ds.assign_coords(time=day_values)


def open_surface_stack(processed_dir: Path) -> xr.Dataset:
    """Open every regridded surface file, pick out the right variable for
    each channel, and combine them into one Dataset on the shared grid."""
    sst_ds = _floor_to_day(standardize_coords(xr.open_dataset(processed_dir / "sst_2021_01_06_regridded.nc")))
    sss_ds = _floor_to_day(standardize_coords(xr.open_dataset(processed_dir / "sss_2021_01_06_regridded.nc")))
    ssh_ds = _floor_to_day(standardize_coords(xr.open_dataset(processed_dir / "ssh_currents_2021_01_06_regridded.nc")))
    wind_ds = _floor_to_day(standardize_coords(xr.open_dataset(processed_dir / "wind_metopb_2021_01_06_regridded.nc")))

    print("Variables found in each regridded file (verify CHANNEL_VAR_HINTS matches these):")
    print("  sst_ds:", list(sst_ds.data_vars))
    print("  sss_ds:", list(sss_ds.data_vars))
    print("  ssh_ds:", list(ssh_ds.data_vars))
    print("  wind_ds:", list(wind_ds.data_vars))

    sst_var = sst_ds[find_var(sst_ds, CHANNEL_VAR_HINTS["sst"], "sst")]
    sss_var = sss_ds[find_var(sss_ds, CHANNEL_VAR_HINTS["sss"], "sss")].squeeze("depth", drop=True)
    sla_var = ssh_ds[find_var(ssh_ds, CHANNEL_VAR_HINTS["sla"], "sla")]
    ugos_var = ssh_ds[find_var(ssh_ds, CHANNEL_VAR_HINTS["ugos"], "ugos")]
    vgos_var = ssh_ds[find_var(ssh_ds, CHANNEL_VAR_HINTS["vgos"], "vgos")]
    east_wind_var = wind_ds[find_var(wind_ds, CHANNEL_VAR_HINTS["eastward_wind"], "eastward_wind")]
    north_wind_var = wind_ds[find_var(wind_ds, CHANNEL_VAR_HINTS["northward_wind"], "northward_wind")]

    # THE ACTUAL FIX: align all seven DataArrays against each other with an
    # explicit inner join, in one call, BEFORE they're combined into a
    # single Dataset - not an outer-join-by-assignment followed by a
    # meaningless single-argument xr.align() call afterward (which is what
    # was here before and did nothing).
    (sst_var, sss_var, sla_var, ugos_var, vgos_var,
     east_wind_var, north_wind_var) = xr.align(
        sst_var, sss_var, sla_var, ugos_var, vgos_var, east_wind_var, north_wind_var,
        join="inner",
    )

    n_days = sst_var.sizes["time"]
    print(f"\nAfter aligning all 4 sources on calendar day: {n_days} common days remain.")
    if n_days < 30:
        print("  [WARNING] That's suspiciously few for a 6-month dataset - check whether "
              "one source has a genuinely shorter date range, or a differently-encoded "
              "time coordinate that _floor_to_day() isn't fully normalizing.")

    surface = xr.Dataset({
        "sst": sst_var,
        "sss": sss_var,
        "sla": sla_var,
        "ugos": ugos_var,
        "vgos": vgos_var,
        "eastward_wind": east_wind_var,
        "northward_wind": north_wind_var,
    })
    return surface


def open_glorys_target(processed_dir: Path) -> xr.DataArray:
    glorys = standardize_coords(xr.open_dataset(processed_dir / "glorys_2021_01_06_regridded_15depth.nc"))
    return glorys["thetao"]


def extract_day_pairs(surface_day: xr.Dataset, profile_day: xr.DataArray, max_missing_depths: int):
    """Vectorized patch extraction for a single day.

    Returns patches (n, channel, 5, 5), profiles (n, depth), valid_mask
    (n, depth), center_lat (n,), center_lon (n,).
    """
    lat = surface_day.latitude.values
    lon = surface_day.longitude.values
    n_depth = profile_day.sizes["depth"]

    # Stack channels into one array: (channel, lat, lon)
    channel_stack = np.stack(
        [surface_day[ch].values.astype("float32") for ch in CHANNELS], axis=0
    )
    profile_arr = profile_day.transpose("latitude", "longitude", "depth").values.astype("float32")

    # --- candidate centers: interior points only (need a full 5x5 margin) ---
    n_lat, n_lon = len(lat), len(lon)
    valid_lat_range = range(PATCH_HALF, n_lat - PATCH_HALF)
    valid_lon_range = range(PATCH_HALF, n_lon - PATCH_HALF)
    if not valid_lat_range or not valid_lon_range:
        return (np.empty((0, len(CHANNELS), PATCH_SIZE, PATCH_SIZE), "float32"),
                np.empty((0, n_depth), "float32"),
                np.empty((0, n_depth), bool),
                np.empty((0,), "float32"), np.empty((0,), "float32"))

    # Sliding windows over the spatial dims for every channel at once.
    # Shape: (channel, n_lat-4, n_lon-4, 5, 5)
    windows = sliding_window_view(channel_stack, (PATCH_SIZE, PATCH_SIZE), axis=(1, 2))

    # A patch is usable only if NO channel has any NaN anywhere in the window.
    patch_has_nan = np.isnan(windows).any(axis=(0, 3, 4))  # (n_lat-4, n_lon-4)

    # Profile validity: how many of the 15 depths are missing at the center cell.
    center_profile = profile_arr[PATCH_HALF:n_lat - PATCH_HALF, PATCH_HALF:n_lon - PATCH_HALF, :]
    missing_depth_count = np.isnan(center_profile).sum(axis=-1)  # (n_lat-4, n_lon-4)
    profile_ok = missing_depth_count <= max_missing_depths

    center_valid = (~patch_has_nan) & profile_ok
    center_i, center_j = np.nonzero(center_valid)

    if len(center_i) == 0:
        return (np.empty((0, len(CHANNELS), PATCH_SIZE, PATCH_SIZE), "float32"),
                np.empty((0, n_depth), "float32"),
                np.empty((0, n_depth), bool),
                np.empty((0,), "float32"), np.empty((0,), "float32"))

    patches = windows[:, center_i, center_j, :, :].transpose(1, 0, 2, 3)  # (n, channel, 5, 5)
    profiles = center_profile[center_i, center_j, :]                      # (n, depth)
    valid_mask = ~np.isnan(profiles)
    profiles = np.nan_to_num(profiles, nan=0.0)  # masked entries filled with 0, use valid_mask to ignore them

    center_lat = lat[center_i + PATCH_HALF]
    center_lon = lon[center_j + PATCH_HALF]

    return patches, profiles, valid_mask, center_lat, center_lon


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--every-n-days", type=int, default=5,
                         help="Only build pairs for every Nth day (default: 5)")
    parser.add_argument("--max-missing-depths", type=int, default=0,
                         help="Max number of the 15 target depths allowed to be missing "
                              "at a sample's center cell before it's dropped (default: 0, "
                              "i.e. require a complete profile)")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    cfg = load_config()
    processed_dir = Path(cfg["paths"]["processed_data"])
    out_dir = processed_dir / "pairs"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Opening regridded surface data...")
    surface = open_surface_stack(processed_dir)
    print("\nOpening regridded GLORYS 15-depth target...")
    profile = open_glorys_target(processed_dir)

    all_times = surface.time.values
    selected_times = all_times[:: args.every_n_days]
    print(f"\n{len(all_times)} total days available, "
          f"selecting every {args.every_n_days} -> {len(selected_times)} days to process\n")

    total_samples = 0
    for t in selected_times:
        date_str = str(np.datetime_as_string(t, unit="D"))
        out_path = out_dir / f"pairs_{date_str}.nc"

        if out_path.exists() and not args.overwrite:
            print(f"[skip] {out_path.name} already exists")
            continue

        surface_day = surface.sel(time=t)
        profile_day = profile.sel(time=t)

        patches, profiles, valid_mask, center_lat, center_lon = extract_day_pairs(
            surface_day, profile_day, args.max_missing_depths
        )

        n = patches.shape[0]
        total_samples += n
        print(f"[{date_str}] {n:,} valid samples")

        if n == 0:
            continue

        ds_out = xr.Dataset(
            data_vars={
                "patch": (("sample", "channel", "py", "px"), patches),
                "profile": (("sample", "depth"), profiles),
                "valid_mask": (("sample", "depth"), valid_mask),
            },
            coords={
                "sample": np.arange(n),
                "channel": CHANNELS,
                "depth": profile.depth.values,
                "latitude": ("sample", center_lat),
                "longitude": ("sample", center_lon),
            },
            attrs={"date": date_str, "patch_size": PATCH_SIZE},
        )

        encoding = {
            "patch": {"zlib": True, "complevel": 4, "dtype": "float32"},
            "profile": {"zlib": True, "complevel": 4, "dtype": "float32"},
            "valid_mask": {"zlib": True, "complevel": 4},
        }
        ds_out.to_netcdf(out_path, encoding=encoding)

    print(f"\nTotal samples written across all selected days: {total_samples:,}")
    print(f"Output directory: {out_dir}")


if __name__ == "__main__":
    main()
