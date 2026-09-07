"""
Model service — the single seam between the Django API and the trained
OceanEmbed model.

The AIML teammate drops artifacts into the `model/` directory (see
MODEL_INTEGRATION.md) and everything switches from demo mode to live mode
automatically:

    model/infer.py        inference entry point (see contract below)
    model/*.pt|*.pth|*.h5  trained weights (optional but expected)
    model/metrics.json     per-depth skill metrics from the validation run

Paths can be overridden via OCEAN_MODEL_PATH and OCEAN_METRICS_PATH.
"""

import importlib.util
import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_DIR = BASE_DIR / "model"

MODEL_DIR = Path(os.getenv("OCEAN_MODEL_PATH", str(DEFAULT_MODEL_DIR)))
METRICS_FILE = Path(os.getenv("OCEAN_METRICS_PATH", BASE_DIR / "model" / "metrics.json"))

_WEIGHT_SUFFIXES = (".pt", ".pth", ".ckpt", ".h5", ".keras", ".tflite", ".onnx")


def model_dir() -> Path:
    return MODEL_DIR


def metrics_file() -> Path:
    return METRICS_FILE


def entrypoint() -> Path | None:
    """infer.py in the model directory, if present."""
    candidate = MODEL_DIR / "infer.py"
    if candidate.is_file():
        return candidate
    return None


def weights_present() -> bool:
    if not MODEL_DIR.is_dir():
        return False
    return any(path.suffix in _WEIGHT_SUFFIXES for path in MODEL_DIR.iterdir())


def model_info() -> dict:
    """Advertise what the backend found (or did not find)."""
    entry = entrypoint()
    model_name = None
    if entry is not None:
        module = _load_inference_module()
        model_name = getattr(module, "MODEL_NAME", None) if module is not None else None
        loaded = module is not None and weights_present()
    else:
        loaded = False

    return {
        "mode": "ready" if (entry is not None and model_name is not None) else "demo",
        "model_name": model_name,
        "weights_loaded": bool(loaded),
        "inference_module": str(entry) if entry is not None else None,
        "metrics_available": metrics_file().is_file(),
        "model_dir": str(MODEL_DIR),
    }


def load_skill_metrics() -> dict | None:
    """Return metrics.json (overall + per-depth skill scores), or None."""
    if not metrics_file().is_file():
        return None
    try:
        with metrics_file().open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None


def _load_inference_module():
    entry = entrypoint()
    if entry is None:
        return None
    spec = importlib.util.spec_from_file_location("oceandepth_infer", entry)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        return None
    return module


def run_inference(latitude, longitude, date_iso, depths, surface):
    """
    Produce a depth-wise temperature profile for one location.

    Returns {"mode", "message", "predictions": [{"depth_m", "temperature_c"}]}.
    Uses the trained model when available, otherwise the demo predictor, so
    the API never breaks before or after the model is delivered.
    """
    module = _load_inference_module()
    if module is not None and getattr(module, "predict", None) is not None:
        try:
            raw = module.predict(
                latitude=float(latitude),
                longitude=float(longitude),
                date=str(date_iso),
                depths=[int(depth) for depth in depths],
                surface=dict(surface or {}),
            )
            normalized = _normalize_predictions(raw)
            if normalized is not None:
                return {
                    "mode": "ml",
                    "message": "Predictions from the trained OceanEmbed model.",
                    "predictions": normalized,
                }
        except Exception:
            # Never crash the API on a model bug; fall through to the demo.
            pass
    return _demo_result(latitude, longitude, depths, surface)


def _demo_result(latitude, longitude, depths, surface):
    from .views import _demo_temperature

    return {
        "mode": "demo",
        "message": "No trained model loaded from {} — using deterministic demo predictions.".format(
            MODEL_DIR
        ),
        "predictions": [
            {"depth_m": int(depth), "temperature_c": _demo_temperature(latitude, longitude, int(depth), surface)}
            for depth in depths
        ],
    }


def _normalize_predictions(raw):
    """Accept list[dict] or depth->temp mapping; return a clean list or None."""
    try:
        if isinstance(raw, dict):
            items = raw.items()
        elif isinstance(raw, (list, tuple)):
            items = raw
        else:
            return None

        normalized = []
        for item in items:
            if isinstance(item, dict) and "depth_m" in item and "temperature_c" in item:
                entry = {
                    "depth_m": int(float(item["depth_m"])),
                    "temperature_c": round(float(item["temperature_c"]), 2),
                }
                for extra in ("mld_m", "heat_content_c", "z20_m"):
                    if extra in item:
                        entry[extra] = item[extra]
            elif isinstance(item, tuple) and len(item) == 2:
                depth, temperature = item
                entry = {
                    "depth_m": int(float(depth)),
                    "temperature_c": round(float(temperature), 2),
                }
            else:
                return None
            normalized.append(entry)
        return normalized if normalized else None
    except (TypeError, ValueError):
        return None