"""
src/evaluation/argo_validation.py

Independent ARGO float validation for OceanEmbed v2.
Validates model predictions against real physical in-situ CTD profiles
from autonomous ARGO profiling floats across the North Indian Ocean.

Metrics computed:
    - Overall RMSE, MAE, Mean Bias, Pearson Correlation (r), R²
    - Depth-band summary (Shallow, Thermocline, Deep)
    - Depth-wise skill score table across all 15 target depth levels
"""

import json
import sys
from pathlib import Path
import numpy as np

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.serving.argo_reference import ArgoReferenceIndex
from src.serving.predict import (
    load_artifacts,
    load_surface_stack,
    predict_profile,
)

TARGET_DEPTHS = [
    0, 5, 10, 20, 30,
    50, 75, 100, 125, 150,
    200, 300, 500, 700, 1000,
]

DEPTH_BANDS = [
    ("Shallow (0-100 m)", 0, 100),
    ("Thermocline (100-300 m)", 100, 300),
    ("Deep (300-1000 m)", 300, 1000),
]


def calculate_metrics(pred, obs):
    """Compute standard statistical validation metrics."""
    pred = np.asarray(pred, dtype=float)
    obs = np.asarray(obs, dtype=float)

    valid = np.isfinite(pred) & np.isfinite(obs)
    if valid.sum() < 2:
        return None

    p = pred[valid]
    o = obs[valid]

    diff = p - o
    rmse = float(np.sqrt(np.mean(diff ** 2)))
    mae = float(np.mean(np.abs(diff)))
    bias = float(np.mean(diff))

    # Pearson correlation
    std_p, std_o = np.std(p), np.std(o)
    if std_p > 1e-6 and std_o > 1e-6:
        corr = float(np.corrcoef(p, o)[0, 1])
    else:
        corr = 0.0

    # R-squared
    ss_tot = np.sum((o - np.mean(o)) ** 2)
    ss_res = np.sum(diff ** 2)
    r2 = float(1 - (ss_res / ss_tot)) if ss_tot > 1e-6 else 0.0

    return {
        "n": int(len(p)),
        "rmse": rmse,
        "mae": mae,
        "bias": bias,
        "correlation": corr,
        "r2": r2,
    }


def main():
    print("=" * 65)
    print("OceanEmbed v2 — Independent In-Situ ARGO Float Validation")
    print("=" * 65)

    # 1. Load trained model & normalization stats
    print("\n[1/3] Loading OceanEmbed v2 model artifacts...")
    artifacts = load_artifacts()

    # 2. Load satellite surface stack
    print("\n[2/3] Loading satellite surface observations...")
    surface = load_surface_stack()

    # 3. Load in-situ ARGO profiles
    print("\n[3/3] Loading in-situ ARGO float profiles...")
    argo_index = ArgoReferenceIndex.load()
    profiles = argo_index.profiles
    total_profiles = len(profiles)
    print(f"Loaded {total_profiles:,} total ARGO profiles across the region.")

    if total_profiles == 0:
        print("[Error] No ARGO profiles found in data/raw/. Please check dataset path.")
        return

    # Storage arrays
    all_predictions = []
    all_observations = []

    depth_predictions = [[] for _ in TARGET_DEPTHS]
    depth_observations = [[] for _ in TARGET_DEPTHS]

    successful_profiles = 0
    skipped_profiles = 0

    print("\nRunning validation against ARGO observations (fast single-pass mode)...")
    print("-" * 65)

    for idx, (_, row) in enumerate(profiles.iterrows(), 1):
        lat = float(row["lat"])
        lon = float(row["lon"])
        date_str = str(row["time"])[:10]

        pres = np.asarray(row["pres"], dtype=float)
        temp = np.asarray(row["temp"], dtype=float)

        valid_argo = np.isfinite(pres) & np.isfinite(temp)
        if valid_argo.sum() < 3:
            skipped_profiles += 1
            continue

        pres = pres[valid_argo]
        temp = temp[valid_argo]

        # Deduplicate pressure levels
        unique_pres, unique_idx = np.unique(pres, return_index=True)
        pres = unique_pres
        temp = temp[unique_idx]

        # Interpolate float CTD data strictly to target depths without extrapolation
        obs = np.interp(
            TARGET_DEPTHS,
            pres,
            temp,
            left=np.nan,
            right=np.nan,
        )

        # Query OceanEmbed prediction at exact (lat, lon, date)
        # n_mc_passes=1 enables fast evaluation across all profiles
        try:
            prediction = predict_profile(
                artifacts,
                surface,
                lat=lat,
                lon=lon,
                date_str=date_str,
                n_mc_passes=1,
            )
        except Exception:
            skipped_profiles += 1
            continue

        pred = np.asarray(prediction["temperatures"], dtype=float)
        valid = np.isfinite(pred) & np.isfinite(obs)

        if valid.sum() < 2:
            skipped_profiles += 1
            continue

        successful_profiles += 1
        all_predictions.extend(pred[valid])
        all_observations.extend(obs[valid])

        for depth_idx in range(len(TARGET_DEPTHS)):
            if valid[depth_idx]:
                depth_predictions[depth_idx].append(pred[depth_idx])
                depth_observations[depth_idx].append(obs[depth_idx])

        if successful_profiles % 50 == 0:
            print(f"  Processed {idx}/{total_profiles} floats | Validated: {successful_profiles}...")

    # -------------------------------------------------------------------------
    # Overall Validation Summary
    # -------------------------------------------------------------------------
    print("\n" + "=" * 65)
    print("INDEPENDENT ARGO VALIDATION SUMMARY")
    print("=" * 65)
    print(f"Total ARGO profiles checked:  {total_profiles:,}")
    print(f"Successfully matched & tested:{successful_profiles:,}")
    print(f"Skipped (out of grid/clouds): {skipped_profiles:,}")
    print(f"Total evaluated depth points: {len(all_predictions):,}")

    overall = calculate_metrics(all_predictions, all_observations)
    if overall is None:
        print("\n[Error] Not enough overlapping observation points to compute metrics.")
        return

    print("\n" + "-" * 35)
    print("OVERALL METRICS (Across All Depths)")
    print("-" * 35)
    print(f"RMSE:        {overall['rmse']:.3f} °C")
    print(f"MAE:         {overall['mae']:.3f} °C")
    print(f"Mean Bias:   {overall['bias']:.3f} °C")
    print(f"Correlation: {overall['correlation']:.3f}")
    print(f"R² Score:    {overall['r2']:.3f}")

    # -------------------------------------------------------------------------
    # Depth Bands
    # -------------------------------------------------------------------------
    print("\n" + "-" * 65)
    print(f"{'Depth Band':<26}{'N Points':>10}{'RMSE (°C)':>12}{'MAE (°C)':>10}{'Corr':>7}")
    print("-" * 65)

    for label, lo, hi in DEPTH_BANDS:
        band_preds, band_obs = [], []
        for i, d in enumerate(TARGET_DEPTHS):
            if lo <= d <= hi:
                band_preds.extend(depth_predictions[i])
                band_obs.extend(depth_observations[i])
        m = calculate_metrics(band_preds, band_obs)
        if m:
            print(f"{label:<26}{m['n']:>10,}{m['rmse']:>12.3f}{m['mae']:>10.3f}{m['correlation']:>7.3f}")

    # -------------------------------------------------------------------------
    # Depth-Wise Breakdown Table
    # -------------------------------------------------------------------------
    print("\n" + "=" * 65)
    print("DEPTH-WISE DETAILED VALIDATION TABLE")
    print("=" * 65)
    print(f"{'Depth':>8} | {'N':>6} | {'RMSE':>8} | {'MAE':>8} | {'Bias':>8} | {'Corr':>7}")
    print("-" * 65)

    per_depth_results = []
    for i, depth in enumerate(TARGET_DEPTHS):
        m = calculate_metrics(depth_predictions[i], depth_observations[i])
        if m is None:
            print(f"{depth:>6} m | {0:>6} | {'--':>8} | {'--':>8} | {'--':>8} | {'--':>7}")
            continue

        per_depth_results.append({"depth_m": depth, **m})
        print(
            f"{depth:>6} m | {m['n']:>6} | {m['rmse']:>8.3f} | {m['mae']:>8.3f} | "
            f"{m['bias']:>8.3f} | {m['correlation']:>7.3f}"
        )

    # -------------------------------------------------------------------------
    # Save Validation Results to models/argo_metrics.json
    # -------------------------------------------------------------------------
    out_file = PROJECT_ROOT / "models" / "argo_metrics.json"
    argo_summary = {
        "overall": overall,
        "per_depth": per_depth_results,
    }
    with open(out_file, "w") as f:
        json.dump(argo_summary, f, indent=2)
    print(f"\n[Saved] Detailed validation metrics exported to {out_file}")
    print("Validation run complete.")


if __name__ == "__main__":
    main()
