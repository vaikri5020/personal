"""
src/data/fetch_glorys.py

Fetches GLORYS12 reanalysis (CMEMS) data as monthly .nc chunks, using bounds
defined in config/config.yaml. Downloading month-by-month means a failed
download only costs you one file, it's easy to resume, and each file is
small enough to inspect/process independently.

Setup (one-time):
    pip install copernicusmarine
    copernicusmarine login

Usage:
    # Fetch every month from Jan 2021 to Jun 2021 (inclusive)
    python src/data/fetch_glorys.py --start 2021-01-01 --end 2021-06-30

    # Re-run any time — already-downloaded months are skipped automatically
    python src/data/fetch_glorys.py --start 2021-01-01 --end 2021-06-30

    # Force re-download even if files already exist
    python src/data/fetch_glorys.py --start 2021-01-01 --end 2021-06-30 --overwrite

Output:
    data/raw/glorys_2021_01.nc
    data/raw/glorys_2021_02.nc
    ...
"""

import argparse
import calendar
from datetime import date
from pathlib import Path

import copernicusmarine
import yaml

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "config.yaml"

# GLORYS12 reanalysis, daily mean, physics (temperature + salinity)
DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1D-m"

# Download slightly deeper than the deepest target depth (1000 m)
# so that 1000 m can be interpolated from native GLORYS levels.
DOWNLOAD_MAX_DEPTH = 1100

def load_config():
    with open(CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def month_ranges(start_date: str, end_date: str):
    """
    Split a start/end date range into a list of (month_start, month_end, label)
    tuples, one per calendar month. Clips the first/last month to the
    requested start/end dates.

    e.g. month_ranges("2021-01-15", "2021-03-10") ->
        [("2021-01-15", "2021-01-31", "2021_01"),
         ("2021-02-01", "2021-02-28", "2021_02"),
         ("2021-03-01", "2021-03-10", "2021_03")]
    """
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    if start > end:
        raise ValueError(f"start_date {start} is after end_date {end}")

    ranges = []
    year, month = start.year, start.month

    while (year, month) <= (end.year, end.month):
        _, last_day = calendar.monthrange(year, month)
        month_first = date(year, month, 1)
        month_last = date(year, month, last_day)

        chunk_start = max(month_first, start)
        chunk_end = min(month_last, end)
        label = f"{year}_{month:02d}"

        ranges.append((chunk_start.isoformat(), chunk_end.isoformat(), label))

        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1

    return ranges


def fetch_glorys_month(region, depths, raw_dir, chunk_start, chunk_end, label,
                        variables, overwrite=False, max_retries=2):
    out_name = f"glorys_{label}_deep.nc"
    out_path = raw_dir / out_name

    if out_path.exists() and not overwrite:
        print(f"  [skip] {out_name} already exists")
        return True

    for attempt in range(1, max_retries + 1):
        try:
            print(f"  [fetch] {label}: {chunk_start} to {chunk_end} "
                  f"(attempt {attempt}/{max_retries})")

            copernicusmarine.subset(
                dataset_id=DATASET_ID,
                variables=variables,
                minimum_longitude=region["longitude_min"],
                maximum_longitude=region["longitude_max"],
                minimum_latitude=region["latitude_min"],
                maximum_latitude=region["latitude_max"],
                minimum_depth=min(depths),
                maximum_depth=DOWNLOAD_MAX_DEPTH,
                start_datetime=f"{chunk_start}T00:00:00",
                end_datetime=f"{chunk_end}T23:59:59",
                output_filename=out_name,
                output_directory=str(raw_dir),
            )
            print(f"  [done] {out_name}")
            return True

        except Exception as e:
            print(f"  [error] {label} attempt {attempt} failed: {e}")
            if attempt == max_retries:
                print(f"  [FAILED] {label} — giving up after {max_retries} attempts")
                return False

    return False


def fetch_glorys(start_date: str, end_date: str, variables=None, overwrite=False):
    cfg = load_config()
    region = cfg["region"]
    depths = cfg["target_depths"]
    raw_dir = Path(cfg["paths"]["raw_data"])
    raw_dir.mkdir(parents=True, exist_ok=True)

    if variables is None:
        variables = ["thetao"]  # sea water potential temperature; add "so" for salinity

    chunks = month_ranges(start_date, end_date)
    print(f"Fetching GLORYS in {len(chunks)} monthly chunk(s): "
          f"{chunks[0][2]} to {chunks[-1][2]}")
    print(f"Region: {region}, download depths 0-{DOWNLOAD_MAX_DEPTH}m, "
      f"target depths 0-{max(depths)}m, vars={variables}\n")
    succeeded, failed = [], []

    for chunk_start, chunk_end, label in chunks:
        ok = fetch_glorys_month(
            region, depths, raw_dir, chunk_start, chunk_end, label,
            variables, overwrite=overwrite,
        )
        (succeeded if ok else failed).append(label)

    print("\n--- Summary ---")
    print(f"Succeeded: {len(succeeded)}/{len(chunks)}")
    if failed:
        print(f"Failed: {failed}")
        print("Re-run the same command to retry only the missing months "
              "(already-downloaded ones are skipped).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="YYYY-MM-DD")
    parser.add_argument("--vars", nargs="+", default=["thetao"])
    parser.add_argument("--overwrite", action="store_true",
                         help="Re-download months even if the file already exists")
    args = parser.parse_args()

    fetch_glorys(args.start, args.end, variables=args.vars, overwrite=args.overwrite)
