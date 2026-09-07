"""
model/infer.py

Enhanced OceanEmbed v2 inference engine for Django & React frontend.
Provides:
1. Subsurface temperature profile prediction (standard 15 depths or arbitrary depths)
2. Derived ocean indicators: Mixed Layer Depth (MLD), Heat Content (0-300m), Z20
3. Real-time response to synthetic "What-If" slider overrides from frontend
"""

from pathlib import Path
import numpy as np
from tensorflow import keras

MODEL_NAME = "OceanEmbed v2 (CNN + Center Skip)"

MODEL_DIR = Path(__file__).resolve().parent
MODEL_PATH = MODEL_DIR / "oceanembed_final.keras"
INPUT_NORM_PATH = MODEL_DIR / "oceanembed_normalization.npz"
TARGET_NORM_PATH = MODEL_DIR / "oceanembed_target_normalization.npz"

_model = None
_channel_mean = None
_channel_std = None
_depth_mean = None
_depth_std = None
_model_depths = None


def _ensure_loaded():
    global _model, _channel_mean, _channel_std, _depth_mean, _depth_std, _model_depths
    if _model is not None:
        return

    _model = keras.models.load_model(MODEL_PATH, safe_mode=False)
    in_norm = np.load(INPUT_NORM_PATH, allow_pickle=True)
    out_norm = np.load(TARGET_NORM_PATH, allow_pickle=True)

    _channel_mean = in_norm["mean"]
    _channel_std = in_norm["std"]
    _depth_mean = out_norm["mean"]
    _depth_std = out_norm["std"]
    _model_depths = np.array([int(d) for d in out_norm["depths"]], dtype=float)


def compute_derived_ocean_metrics(depths: np.ndarray, temps: np.ndarray) -> dict:
    """Computes physical oceanographic indicators requested by frontend cards."""
    # 1. Mixed Layer Depth (MLD): depth where temp drops by 0.5 °C from surface (10m)
    surf_idx = np.argmin(np.abs(depths - 10.0))
    t_surf = temps[surf_idx]
    mld_thresh = t_surf - 0.5

    below_mld = np.where(temps <= mld_thresh)[0]
    if len(below_mld) > 0 and below_mld[0] > 0:
        idx = below_mld[0]
        mld = float(np.interp(mld_thresh, [temps[idx], temps[idx - 1]], [depths[idx], depths[idx - 1]]))
    else:
        mld = float(depths[0] if len(below_mld) > 0 else depths[-1])

    # 2. Ocean Heat Content proxy (Mean Temperature in upper 300 m)
    upper_300 = np.where(depths <= 300.0)[0]
    mean_temp_300 = float(np.mean(temps[upper_300]))

    # 3. Z20: Depth of the 20°C isotherm (thermocline indicator)
    below_20 = np.where(temps <= 20.0)[0]
    if len(below_20) > 0 and below_20[0] > 0:
        idx = below_20[0]
        z20 = float(np.interp(20.0, [temps[idx], temps[idx - 1]], [depths[idx], depths[idx - 1]]))
    else:
        z20 = float(depths[0] if len(below_20) > 0 else depths[-1])

    return {
        "mld_m": round(mld, 1),
        "heat_content_c": round(mean_temp_300, 2),
        "z20_m": round(z20, 1),
    }


def predict(
    latitude: float,
    longitude: float,
    date: str,
    depths: list[int],
    surface: dict,
) -> list[dict]:
    """Inference endpoint called by Django's run_inference()."""
    _ensure_loaded()

    # Extract 7 surface channels (handles Celsius & Kelvin)
    sst = float(surface.get("sst", 28.5))
    if sst < 100.0:
        sst += 273.15  # Convert Celsius → Kelvin to match training normalization

    sss = float(surface.get("sss", 35.0))
    sla = float(surface.get("ssh_or_sla", surface.get("sla", 0.0)))
    ugos = float(surface.get("current_u", surface.get("ugos", 0.0)))
    vgos = float(surface.get("current_v", surface.get("vgos", 0.0)))
    wind_u = float(surface.get("wind_u", surface.get("eastward_wind", 0.0)))
    wind_v = float(surface.get("wind_v", surface.get("northward_wind", 0.0)))

    # Construct input patch (1, 5, 5, 7)
    vec = np.array([sst, sss, sla, ugos, vgos, wind_u, wind_v], dtype="float32")
    patch = np.tile(vec, (1, 5, 5, 1))

    # Normalize & Predict
    patch_norm = (patch - _channel_mean) / _channel_std
    pred_norm = _model.predict(patch_norm, verbose=0)
    pred_temps = (pred_norm * _depth_std + _depth_mean).flatten()

    # Derived ocean diagnostics
    diagnostics = compute_derived_ocean_metrics(_model_depths, pred_temps)

    # Return depths requested by frontend
    depth_temp_map = dict(zip(_model_depths, pred_temps))
    results = []
    for d in depths:
        d_val = float(d)
        if d_val in depth_temp_map:
            t = float(depth_temp_map[d_val])
        else:
            # Smooth interpolation for 3D submarine dive
            t = float(np.interp(d_val, _model_depths, pred_temps))

        results.append({
            "depth_m": int(d_val),
            "temperature_c": round(t, 2),
            "mld_m": diagnostics["mld_m"],
            "heat_content_c": diagnostics["heat_content_c"],
        })

    return results