"""
src/serving/api.py

FastAPI serving engine for OceanEmbed v2.
Exposes high-performance REST endpoints for frontend and backend integration:
    - POST /predict/profile   -> Depth temperature profile + confidence + MLD + ARGO reference
    - GET  /metrics           -> Independent ARGO validation skill scores (RMSE, Corr, Bias)
    - GET  /health            -> Service health & loaded model info
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.serving.argo_reference import ArgoReferenceIndex
from src.serving.predict import (
    PredictionError,
    load_artifacts,
    load_surface_stack,
    predict_profile,
)

app = FastAPI(
    title="OceanEmbed AI API",
    description="Subsurface Ocean Temperature Reconstruction (0-1000m) for North Indian Ocean (PS 26066)",
    version="2.0.0",
)

# Enable CORS so React / Vite frontend can make direct requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory singletons (loaded once on startup)
artifacts = None
surface_stack = None
argo_index = None


@app.on_event("startup")
def startup_event():
    """Load model, satellite stack, and ARGO reference index into memory once."""
    global artifacts, surface_stack, argo_index
    print("\n[API] Initializing OceanEmbed v2 artifacts...")
    artifacts = load_artifacts()
    print("[API] Loading surface satellite stack...")
    surface_stack = load_surface_stack()
    print("[API] Loading in-situ ARGO float reference index...")
    argo_index = ArgoReferenceIndex.load()
    print("[API] Ready to serve requests.\n")


# --------------------------------------------------------------------------
# Request & Response Schemas
# --------------------------------------------------------------------------

class ProfileRequest(BaseModel):
    latitude: float = Field(..., ge=5.0, le=30.0, description="Latitude (5°N - 30°N)")
    longitude: float = Field(..., ge=45.0, le=105.0, description="Longitude (45°E - 105°E)")
    date: Optional[str] = Field(None, description="YYYY-MM-DD (defaults to latest available)")
    mc_passes: Optional[int] = Field(15, ge=1, le=50, description="Monte Carlo passes for confidence")


def compute_derived_ocean_indicators(depths: list, temps: list) -> dict:
    """Computes Mixed Layer Depth (MLD), Heat Content (0-300m), and Z20."""
    d = np.array(depths, dtype=float)
    t = np.array(temps, dtype=float)

    # 1. Mixed Layer Depth (MLD): de Boyer Montégut criterion (ΔT = 0.5°C from surface)
    surf_idx = np.argmin(np.abs(d - 10.0))
    t_surf = t[surf_idx]
    mld_thresh = t_surf - 0.5
    below = np.where(t <= mld_thresh)[0]
    if len(below) > 0 and below[0] > 0:
        idx = below[0]
        mld = float(np.interp(mld_thresh, [t[idx], t[idx - 1]], [d[idx], d[idx - 1]]))
    else:
        mld = float(d[0] if len(below) > 0 else d[-1])

    # 2. Upper 300m Mean Temperature (OHC cyclone fuel gauge)
    upper_300 = np.where(d <= 300.0)[0]
    heat_content = float(np.mean(t[upper_300]))

    # 3. Z20: Depth of 20°C Isotherm
    below_20 = np.where(t <= 20.0)[0]
    if len(below_20) > 0 and below_20[0] > 0:
        idx = below_20[0]
        z20 = float(np.interp(20.0, [t[idx], t[idx - 1]], [d[idx], d[idx - 1]]))
    else:
        z20 = float(d[0] if len(below_20) > 0 else d[-1])

    return {
        "mld_m": round(mld, 1),
        "heat_content_c": round(heat_content, 2),
        "z20_m": round(z20, 1),
    }


# --------------------------------------------------------------------------
# API Endpoints
# --------------------------------------------------------------------------

@app.get("/health")
def health():
    """Health check and model status."""
    return {
        "status": "ready",
        "model": "OceanEmbed v2 (CNN + Center Skip)",
        "region": "North Indian Ocean (5N-30N, 45E-105E)",
        "resolution": "0.25 degree daily",
        "depths_covered": [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000],
    }


@app.post("/predict/profile")
def predict_vertical_profile(req: ProfileRequest):
    """
    Predict full vertical profile from surface down to 1000m.
    Returns:
        - Temperatures (°C)
        - Active MC-Dropout Confidence (%)
        - Physical indicators: MLD, Heat Content, Z20
        - Nearest in-situ ARGO ground truth observation for dual plotting
    """
    try:
        res = predict_profile(
            artifacts=artifacts,
            surface=surface_stack,
            lat=req.latitude,
            lon=req.longitude,
            date_str=req.date,
            n_mc_passes=req.mc_passes,
        )
    except PredictionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

    depths = res["depths"]
    temps = res["temperatures"]
    conf = res["confidence"]

    # Compute physical ocean indicators for frontend cards
    indicators = compute_derived_ocean_indicators(depths, temps)

    # Find nearest real ARGO float for dual-line graph in frontend
    argo_ref = argo_index.find_nearest(
        lat=res["resolved"]["lat"],
        lon=res["resolved"]["lon"],
        date_str=res["resolved"]["date"],
        target_depths=depths,
    )

    # Structure combined levels format matching frontend Charts.tsx
    levels = []
    for i, d in enumerate(depths):
        ref_t = argo_ref["temperatures"][i] if argo_ref else None
        levels.append({
            "depth": d,
            "temperature": temps[i],
            "reference": ref_t,
            "confidence": conf[i],
        })

    return {
        "location": res["resolved"],
        "surface_stats": res["surface_stats"],
        "confidence_overall": res["confidence_overall"],
        "indicators": indicators,
        "argo_reference": argo_ref,
        "levels": levels,
    }


@app.get("/metrics")
def get_validation_metrics():
    """Returns independent ARGO float validation skill metrics."""
    metrics_path = PROJECT_ROOT / "models" / "argo_metrics.json"
    if not metrics_path.is_file():
        metrics_path = PROJECT_ROOT / "models" / "metrics.json"

    if not metrics_path.is_file():
        raise HTTPException(status_code=404, detail="Validation metrics not found.")

    with open(metrics_path, "r") as f:
        return json.load(f)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.serving.api:app", host="127.0.0.1", port=8001, reload=True)
