"""
src/serving/argo_reference.py

Finds the nearest REAL Argo float profile to a query point/date, so the
dashboard's "Predicted vs Reference (Argo, if available)" chart is an
honest comparison against ground truth - not two model outputs plotted
against each other.

This deliberately returns None (not an error) when no float is close
enough, since Argo coverage is genuinely sparse - most clicks will NOT
have a nearby float, and the dashboard already labels this line
"if available" for exactly that reason. A missing reference is normal,
not a bug.

Usage:
    from src.serving.argo_reference import ArgoReferenceIndex

    argo_index = ArgoReferenceIndex.load()          # once, at startup
    ref = argo_index.find_nearest(lat, lon, date_str, target_depths)
    # ref is None, or {"lat":.., "lon":.., "date":.., "distance_km":..,
    #                   "days_apart":.., "temperatures": [...]}
"""

from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
import yaml

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "config.yaml"

# How close counts as "close enough to show as a reference". Both need to
# hold - a float 2000km away on the right day is not a meaningful check,
# and neither is a float next door from three months ago.
MAX_DISTANCE_KM = 150
MAX_DAYS_APART = 5


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlambda / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


class ArgoReferenceIndex:
    """Loads every fetched Argo file once and holds all profiles in memory
    as a flat table (one row per float/cycle), so a lookup at request time
    is just arithmetic over an in-memory DataFrame - no file I/O per
    request. Argo data for a 6-month regional pull is small (thousands of
    profiles, not millions), so this comfortably fits in memory.
    """

    def __init__(self, profiles: pd.DataFrame):
        # profiles: one row per (float, cycle) with columns
        # lat, lon, time, pres (array), temp (array)
        self.profiles = profiles

    @classmethod
    def load(cls, raw_dir: Path = None):
        cfg = load_config()
        raw_dir = raw_dir or Path(cfg["paths"]["raw_data"])
        files = sorted(raw_dir.glob("argo_*.nc"))
        if not files:
            print(f"[warn] no Argo files found in {raw_dir} - "
                  f"reference overlay will always return None")
            return cls(pd.DataFrame(columns=["lat", "lon", "time", "pres", "temp"]))

        rows = []
        for f in files:
            with xr.open_dataset(f) as ds:
                # argopy's standard column names (uppercase) - see fetch_argo.py
                lat = ds["LATITUDE"].values
                lon = ds["LONGITUDE"].values
                time = ds["TIME"].values
                pres = ds["PRES"].values
                temp = ds["TEMP"].values
                platform = ds["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in ds else np.zeros(len(lat))

            df = pd.DataFrame({
                "platform": platform, "lat": lat, "lon": lon,
                "time": time, "pres": pres, "temp": temp,
            })
            # Group into one profile per (platform, time) - a single Argo
            # cycle reports many (pres, temp) pairs sharing the same
            # lat/lon/time.
            for (platform_id, t), group in df.groupby(["platform", "time"]):
                group = group.dropna(subset=["pres", "temp"]).sort_values("pres")
                if len(group) < 3:
                    continue  # too few points to be a useful reference profile
                rows.append({
                    "lat": group["lat"].iloc[0],
                    "lon": group["lon"].iloc[0],
                    "time": t,
                    "pres": group["pres"].values,
                    "temp": group["temp"].values,
                })

        profiles = pd.DataFrame(rows)
        print(f"Loaded {len(profiles)} Argo profiles from {len(files)} file(s)")
        return cls(profiles)

    def find_nearest(self, lat: float, lon: float, date_str: str, target_depths):
        if len(self.profiles) == 0:
            return None

        query_time = np.datetime64(date_str)
        distance_km = _haversine_km(lat, lon, self.profiles["lat"].values, self.profiles["lon"].values)
        days_apart = np.abs((self.profiles["time"].values - query_time) / np.timedelta64(1, "D"))

        candidates = self.profiles[(distance_km <= MAX_DISTANCE_KM) & (days_apart <= MAX_DAYS_APART)]
        if len(candidates) == 0:
            return None

        # Among candidates, pick the closest in space+time combined
        # (normalized so neither axis dominates just from unit scale).
        cand_idx = candidates.index
        combined_score = (distance_km[cand_idx] / MAX_DISTANCE_KM) + (days_apart[cand_idx] / MAX_DAYS_APART)
        best = candidates.iloc[np.argmin(combined_score)]

        # Argo's PRES (dbar) is treated as an approximation of depth (m) here,
        # same simplifying assumption flagged in fetch_argo.py's docstring -
        # fine for a "does the shape roughly match" overlay, not precise
        # enough for anything that reports pressure-vs-depth error itself.
        temps_at_target = np.interp(
            target_depths, best["pres"], best["temp"],
            left=np.nan, right=np.nan,  # never extrapolate beyond the float's own range
        )

        return {
            "lat": round(float(best["lat"]), 2),
            "lon": round(float(best["lon"]), 2),
            "date": str(best["time"])[:10],
            "distance_km": round(float(distance_km[best.name]), 1),
            "days_apart": round(float(days_apart[best.name]), 1),
            "temperatures": [None if np.isnan(t) else round(float(t), 2) for t in temps_at_target],
        }
