# OceanEmbed — Model Integration Contract (AIML Team)

Read this first. The Django backend (and frontend) are done and waiting for the
trained model. Drop the artifacts described below into the `model/` directory
and the entire app switches from **demo mode** to **live mode** automatically —
no Django code changes needed.

## Where to put your artifacts

Both files live in this repo at the root `model/` folder:

```
model/
├── infer.py              <- REQUIRED inference entry point
├── model.pt (or .pth / .h5 / .onnx)   <- trained weights
└── metrics.json          <- REQUIRED after you run validation
```

- The backend looks at `model/infer.py` on every request. If it's missing, the
  API serves deterministic **demo** predictions so the site never breaks.
- Weights are detected by suffix (`.pt`, `.pth`, `.ckpt`, `.h5`, `.tflite`,
  `.onnx`) but are **not** required for demo fallback.
- Paths are overridable with env vars: `OCEAN_MODEL_PATH`, `OCEAN_METRICS_PATH`.
- Do **not** commit large weight files to git. Use Git LFS or keep them local /
  on the deployment machine, then set `OCEAN_MODEL_PATH` to their location.

## `infer.py` contract

Expose a module-level callable. This is the only thing the backend uses:

```python
MODEL_NAME = "OceanEmbed-ViT v1"          # optional, used in /api/model/status/

def predict(latitude: float, longitude: float, date: str,
            depths: list[int], surface: dict) -> list[dict]:
    """Return a temperature profile for one location."""
    ...
    return [{"depth_m": 0, "temperature_c": 28.4}, ...]
```

### Arguments

| param | type | meaning |
|---|---|---|
| `latitude` | float | 5.0 to 30.0 (North Indian Ocean) |
| `longitude` | float | 45.0 to 105.0 |
| `date` | str | `YYYY-MM-DD` |
| `depths` | list[int] | requested subset of the 15 standard depths |
| `surface` | dict | surface observations (see below) |

### `surface` input keys (all expected)

```python
surface = {
    "sst": 28.4,          # Sea Surface Temperature (°C)
    "sss": 34.7,          # Sea Surface Salinity (PSU)
    "ssh_or_sla": 0.12,   # Sea Surface Height / SLA (m)
    "current_u": 0.2,     # surface current zonal (m/s)
    "current_v": -0.1,    # surface current meridional (m/s)
    "wind_u": 4.1,        # wind zonal (m/s)
    "wind_v": 1.3,        # wind meridional (m/s)
}
```

### Return value

Accept either a `list[dict]`:

```python
[{"depth_m": 0, "temperature_c": 28.4}, {"depth_m": 50, "temperature_c": 24.1}]
```

or a mapping `{depth_m: temperature_c}`. Any other shape (or an exception)
makes the backend fall back to demo mode — it will never 500 the API.

### Standard depth levels

Mandatory set: `[0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]`.
The API validates requested depths against this set, so train your model on
exactly these levels.

## `metrics.json` contract

Equal to `model/metrics.example.json`. Fields used by `GET /api/metrics/`:

```json
{
  "model": { "name": "OceanEmbed-ViT v1" },
  "overall": { "rmse_c": 1.23, "correlation": 0.92, "bias_c": -0.08, "n_profiles": 4521 },
  "per_depth": [
    { "depth_m": 0, "rmse_c": 0.72, "correlation": 0.99, "bias_c": 0.05, "n": 4521 }
  ],
  "validation": {
    "dataset": "INCOIS LAS Gridded ARGO",
    "period": "2018-01-01 to 2023-12-31",
    "region": "5N-30N, 45E-105E"
  }
}
```

`per_depth` must contain one entry per evaluated depth (`depth_m` in meters).

## Suggested workflow for the AIML team

1. Preprocess + regrid inputs (SST/SSS/SSH/currents/winds) and GLORYS target to
   0.25° daily for the study region; keep a held-out period.
2. Train the embedding encoder + reconstruction head; dump weights into `model/`.
3. Write `model/infer.py` per the contract.
4. Run your validation framework against gridded ARGO, write `model/metrics.json`.
5. Notify the backend team: `GET /api/model/status/` will then read
   `"status": "ready"` and `GET /api/predict/` will respond with `"mode": "ml"`.

## Quick local test

```bash
python manage.py runserver
curl http://127.0.0.1:8000/api/model/status/
# GET /api/metrics/        -> {"available": true, ...}
# POST /api/predict/       -> requires login
```

## Existing demo predictor

`api/views.py::_demo_temperature` is only used until `model/infer.py` exists.
Keep the request/response shape of `/api/predict/` unchanged — the frontend
depends on it.