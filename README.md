# 🌊 OceanEmbed v2 — Deep Learning Framework for 3D Subsurface Ocean Temperature Reconstruction

[![Smart India Hackathon 2026](https://img.shields.io/badge/SIH-2026-blue.svg)](https://www.sih.gov.in/)
[![Problem Statement](https://img.shields.io/badge/PS-26066-orange.svg)](https://www.sih.gov.in/)
[![Organization](https://img.shields.io/badge/INCOIS-MoES-green.svg)](https://incois.gov.in/)
[![Framework](https://img.shields.io/badge/TensorFlow-2.x%20%2F%20Keras%203-FF6F00.svg)](https://www.tensorflow.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com/)

**OceanEmbed v2** is an end-to-end satellite embedding and deep learning framework developed for **Smart India Hackathon 2026 (Problem Statement 26066)**, hosted by the **Indian National Centre for Ocean Information Services (INCOIS)**, Ministry of Earth Sciences (MoES), Government of India.

The framework reconstructs continuous **3D subsurface ocean temperature profiles from the surface down to 1000 meters** on a daily **$0.25^\circ \times 0.25^\circ$ spatial grid** across the entire **North Indian Ocean**, utilizing multi-source satellite surface observations.

---

## 📑 Table of Contents
1. [The Oceanographic Problem](#-the-oceanographic-problem)
2. [Physical Principles & Feature Selection](#-physical-principles--feature-selection)
3. [End-to-End System Architecture](#-end-to-end-system-architecture)
4. [OceanEmbed v2 Model Architecture](#-oceanembed-v2-model-architecture)
5. [Epistemic Uncertainty via Monte Carlo Dropout](#-epistemic-uncertainty-via-monte-carlo-dropout)
6. [Data Harmonization & Preprocessing](#-data-harmonization--preprocessing)
7. [Training Protocol & Hyperparameters](#-training-protocol--hyperparameters)
8. [Independent In-Situ Validation against ARGO Floats](#-independent-in-situ-validation-against-argo-floats)
9. [Derived Oceanographic Indicators](#-derived-oceanographic-indicators)
10. [Serving & API Infrastructure](#-serving--api-infrastructure)
11. [Project Directory Layout](#-project-directory-layout)
12. [Quickstart & Usage](#-quickstart--usage)

---

## 🎯 The Oceanographic Problem

Subsurface ocean temperature is a fundamental physical state variable governing upper-ocean heat content, thermal stratification, acoustic propagation, air-sea interaction, and marine ecosystem stability. It directly controls tropical cyclone intensification, southwest and northeast monsoon dynamics, and Indian Ocean Dipole (IOD) events.

- **The Observation Paradox**: Direct in-situ temperature profiles (from autonomous ARGO profiling floats, moored CTD buoys, and research vessels) provide accurate vertical data but are **spatially sparse and irregular**. Large oceanic regions lack in-situ measurements for weeks or months.
- **The Satellite Advantage**: Satellite remote sensors provide continuous, basin-wide observations at high spatial and temporal resolutions, but **only see the ocean surface skin**.
- **The OceanEmbed Solution**: Synthesize satellite surface variables into compact spatial latent embeddings, non-linearly projecting surface dynamics downward to reconstruct full vertical thermal columns ($0\text{ to }1000\text{ m}$) with sub-degree accuracy.

---

## 🔬 Physical Principles & Feature Selection

OceanEmbed v2 ingests **7 harmonized satellite surface channels**. Each variable provides a distinct physical constraint on the vertical water column:

| Variable | Symbol | Product Source | Physical Coupling Mechanism |
|---|---|---|---|
| **Sea Surface Temperature** | $\text{SST}$ | OSTIA / CMEMS ($0.05^\circ$) | Mixed layer thermal boundary; air-sea heat flux interface. |
| **Sea Surface Salinity** | $\text{SSS}$ | SMAP / SMOS ($0.125^\circ$) | Density stratification; differentiates the saline Arabian Sea from the river-fed Bay of Bengal freshwater plume. |
| **Sea Level Anomaly** | $\text{SLA}$ | DUACS Altimetry ($0.25^\circ$) | **Primary thermocline proxy**: Positive SLA indicates downwelling / warm-core anticyclonic eddies; negative SLA indicates cyclonic upwelling and thermocline shoaling. |
| **Zonal Current** | $u_{\text{gos}}$ | DUACS / Geostrophic | Horizontal advection of heat; Somali current and equatorial jets. |
| **Meridional Current** | $v_{\text{gos}}$ | DUACS / Geostrophic | Cross-equatorial transport and western boundary current dynamics. |
| **Zonal 10m Wind** | $u_{10}$ | MetOp-B ASCAT | Wind-driven shear turbulence and surface momentum flux. |
| **Meridional 10m Wind**| $v_{10}$ | MetOp-B ASCAT | Ekman transport and wind-stress curl driving vertical upwelling/downwelling. |

---

## 🏗️ End-to-End System Architecture

```
                       MULTI-SOURCE SATELLITE INPUTS
     SST (OSTIA)    SSS (SMAP)    SLA (DUACS)    Currents (U/V)    Winds (MetOp-B)
          │              │             │               │                 │
          └──────────────┴─────────────┼───────────────┴─────────────────┘
                                       ▼
                       [src/data/regrid.py]
                       • Bilinear interpolation to 0.25° × 0.25°
                       • Midnight calendar day flooring (_floor_to_day)
                       • Strict multi-channel inner-join
                                       │
                                       ▼
                  [src/preprocessing/pairing.py]
                  • 5×5 Spatial Sliding Window Extraction
                  • Land-masking & data gap filtering
                  • Paired with GLORYS12 15-Depth Ground Truth
                                       │
                                       ▼
                 [src/models/oceanembed_model.py]
                 =================================================
                 OceanEmbed v2: CNN Encoder + Center-Pixel Skip
                 • Center-pixel skip connection bypassing convolutions
                 • 2× Conv2D (16, 32 filters, BatchNorm, ReLU)
                 • Spatial Flattening (retaining eddy orientations)
                 • Deep MLP Decoder (128 → 64 → 32 with 0.2 Dropout)
                 • Target z-score denormalization
                 =================================================
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
[src/serving/predict.py]     [src/serving/map_predict.py]    [src/serving/api.py]
• Point Profile Prediction   • 2D Basin-wide Heatmaps       • FastAPI Microservice
• MC Dropout Confidence      • Depth Slices (100m, 200m)    • Interactive /docs
• MLD & OHC Diagnostics      • Export to compressed .npz    • Real-time REST API
         │
         ▼
[src/evaluation/argo_validation.py]
• Sea-Truth Verification against 1,194 open-ocean ARGO Floats
• Output: RMSE = 1.220°C | Correlation = 0.985 | R² = 0.970 | Bias = -0.130°C
```

---

## 🧠 OceanEmbed v2 Model Architecture

In initial benchmarks, a standard convolutional architecture (v1) lost to a point-wise Random Forest baseline ($0.924^\circ\text{C}$ vs $0.849^\circ\text{C}$ RMSE), primarily due to spatial oversmoothing and loss of deep-ocean signal. 

**OceanEmbed v2 introduced 4 architectural innovations to overcome this:**

```
                    Input Patch: (5, 5, 7)
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
      [Center Pixel Extraction]     [Conv2D (16, 3x3)]
         (1, 7) Raw Reading                │
                 │                   [Batch Normalization]
                 │                         │
                 │                  [Conv2D (32, 3x3)]
                 │                         │
                 │                   [Batch Normalization]
                 │                         │
                 │                  [Flatten Layer]
                 │                   (800 spatial features)
                 │                         │
                 │                  [Dense (64, ReLU)]
                 │                         │
                 └────────────┬────────────┘
                              ▼
                     [Concatenate Layer]
                        (64 + 7 = 71)
                              │
                    [Dense (128, ReLU)]
                    [Dropout (0.2)]
                              │
                    [Dense (64, ReLU)]
                    [Dropout (0.2)]
                              │
                    [Dense (32, ReLU)]
                    [Dropout (0.2)]
                              │
                    [Dense (15, Linear)]
                              │
                              ▼
               Predicted Profile: 15 Depths
```

### 1. Center-Pixel Skip Connection
The center cell of each $5 \times 5$ patch is extracted via a dedicated Lambda layer and routed directly to the decoder, bypassing the convolutional stack. This guarantees that point-wise surface observations are never blurred by convolutions. The convolutional branch is freed to learn strictly the *contextual spatial gradients* (mesoscale eddy edges, frontal boundaries).

### 2. Spatial Flattening (No Pooling)
Global Average Pooling (GAP) collapses feature maps into scalar averages, throwing away spatial orientation (which quadrant an eddy core occupies). On a compact $5 \times 5$ patch, `Flatten` produces only 800 activations—computationally cheap while preserving directional gradient vectors.

### 3. Per-Depth Target Normalization
Shallow waters range from $0-30^\circ\text{C}$, whereas the deep ocean ranges from $5-10^\circ\text{C}$. Training on raw Celsius scales forces gradients to be dominated by shallow fluctuations, starving deep layers. In OceanEmbed v2, each of the 15 depth levels is normalized independently via training-set z-scores ($\mu_d, \sigma_d$), putting all depths on an equal learning footing.

### 4. Deep Regularized Decoder with Active Dropout
Three Dense layers ($128 \to 64 \to 32$) with `Dropout(0.2)` provide the representational capacity needed to combine spatial embeddings with point observations, while preventing overfitting.

---

## 🎲 Epistemic Uncertainty via Monte Carlo Dropout

Standard deep networks generate deterministic predictions with no measure of certainty. OceanEmbed v2 implements **Monte Carlo (MC) Dropout** at inference time.

During prediction, dropout layers remain active (`training=True`). The model executes $N$ stochastic forward passes ($N=15-30$):

$$\mu(z) = \frac{1}{N}\sum_{i=1}^N \hat{T}_i(z), \quad \sigma^2(z) = \frac{1}{N}\sum_{i=1}^N \left(\hat{T}_i(z) - \mu(z)\right)^2$$

$$\text{Confidence}(z) = 100 - \text{clip}\left(\sigma(z) \times 60, \, 0, \, 60\right)$$

### Physical Significance:
- **Surface Mixed Layer ($0-50\text{ m}$)**: High stability $\implies$ **$90-92\%$ Confidence**.
- **Thermocline Transition ($75-150\text{ m}$)**: Steepest physical gradient ($>10^\circ\text{C}/50\text{ m}$), internal waves, eddy turbulence $\implies$ **$86-88\%$ Confidence**.
- **Abyssal Waters ($300-1000\text{ m}$)**: Homogeneous cooling $\implies$ **$88-91\%$ Confidence**.

The AI's self-estimated confidence accurately mirrors the true thermodynamic complexity of the water column.

---

## 🧹 Data Harmonization & Preprocessing

- **Region**: North Indian Ocean ($5.0^\circ\text{N} \le \text{Lat} \le 30.0^\circ\text{N}$, $45.0^\circ\text{E} \le \text{Lon} \le 105.0^\circ\text{E}$).
- **Spatial Resolution**: Standardized to $0.25^\circ \times 0.25^\circ$ ($101 \times 241$ grid cells).
- **Temporal Alignment**: Daily resolution. Satellite timestamps from different overpass hours are floored to midnight UTC (`_floor_to_day`) and joined with an exact 7-channel inner join across 181 consecutive days.
- **Patch Extraction**: Vectorized sliding window (`sliding_window_view`) extracts $5 \times 5$ patches. Any patch intersecting land or data gaps is strictly dropped.
- **Target Depths (15 levels)**: `[0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000] meters`.

---

## ⚙️ Training Protocol & Hyperparameters

| Hyperparameter | Value | Description |
|---|---|---|
| **Data Split** | 70% Train / 15% Val / 15% Test | **Strict chronological split** (prevents temporal data leakage). |
| **Optimizer** | Adam ($\text{lr}_0 = 10^{-3}$) | Adaptive moment estimation. |
| **Loss Function** | Mean Squared Error (MSE) | Calculated on z-score normalized depth targets. |
| **Learning Rate Schedule**| ReduceLROnPlateau | Factor: $0.5$, Patience: $8$ epochs, Min LR: $10^{-6}$. |
| **Early Stopping** | Patience: 20 epochs | Restores best weights based on validation loss. |
| **Batch Size** | 256 | Optimal throughput on GPU and modern multi-core CPU. |
| **Epochs** | Up to 200 | Converged with early stopping. |

---

## 📊 Independent In-Situ Validation against ARGO Floats

To verify true physical generalization beyond simulated reanalysis, the model was tested against **1,194 autonomous in-situ ARGO profiling floats** across the North Indian Ocean.

### Overall Verification Metrics (3,754 Depth Points)
- **Pearson Correlation Coefficient ($r$)**: **`0.985`**
- **Coefficient of Determination ($R^2$)**: **`0.970`** (97% of thermal variance explained)
- **Root Mean Squared Error (RMSE)**: **`1.220 °C`**
- **Mean Absolute Error (MAE)**: **`0.914 °C`**
- **Mean Systematic Bias**: **`-0.130 °C`** (near-zero drift)

### Depth-Band Performance Summary
| Depth Band | Depth Range | Observations ($N$) | RMSE (°C) | MAE (°C) | Pearson $r$ |
|---|---|---|---|---|---|
| **Shallow (Mixed Layer)** | $0 - 100\text{ m}$ | 1,964 | **1.193** | 0.911 | **0.866** |
| **Thermocline Transition** | $100 - 300\text{ m}$ | 1,472 | **1.497** | 1.150 | **0.934** |
| **Deep Ocean** | $300 - 1000\text{ m}$ | 906 | **0.841** | 0.630 | **0.913** |

### Complete 15-Depth Verification Table
| Depth (m) | Verified Floats ($N$) | RMSE (°C) | MAE (°C) | Bias (°C) | Correlation ($r$) |
|---|---|---|---|---|---|
| **0 m** | 5 | 0.584 | 0.470 | -0.470 | 0.970 |
| **5 m** | 238 | 1.038 | 0.799 | -0.190 | 0.757 |
| **10 m** | 273 | 0.984 | 0.765 | -0.126 | 0.775 |
| **20 m** | 275 | 0.908 | 0.723 | -0.009 | 0.785 |
| **30 m** | 288 | 0.957 | 0.734 | +0.196 | 0.769 |
| **50 m** | 295 | 1.111 | 0.844 | +0.142 | 0.720 |
| **75 m** | 295 | 1.428 | 1.154 | -0.200 | 0.626 |
| **100 m** | 295 | 1.663 | 1.317 | -0.271 | 0.501 |
| **125 m** | 295 | 1.640 | 1.299 | -0.276 | 0.513 |
| **150 m** | 295 | 1.615 | 1.268 | -0.435 | 0.591 |
| **200 m** | 294 | 1.420 | 1.069 | -0.381 | 0.715 |
| **300 m** | 293 | 1.055 | 0.794 | -0.109 | 0.798 |
| **500 m** | 291 | 0.729 | 0.559 | +0.019 | 0.821 |
| **700 m** | 291 | 0.711 | 0.547 | -0.005 | 0.815 |
| **1000 m** | 31 | 0.654 | 0.510 | -0.373 | 0.469 |

---

## 🌊 Derived Oceanographic Indicators

From each reconstructed vertical profile, the framework automatically extracts three key oceanographic parameters required for cyclone forecasting and marine heatwave monitoring:

1. **Mixed Layer Depth (MLD)**: Computed via the *de Boyer Montégut* thermal criterion ($\Delta T = 0.5^\circ\text{C}$ drop from the surface reference layer at $10\text{ m}$):
   $$\text{MLD} = z \quad \text{where } T(z) = T(10\text{ m}) - 0.5^\circ\text{C}$$
2. **Tropical Cyclone Heat Potential Proxy (OHC 0–300 m)**: Vertically integrated thermal energy across the upper $300\text{ m}$:
   $$\bar{T}_{300} = \frac{1}{300}\int_{0}^{300} T(z)\, dz$$
3. **Thermocline Isotherm Depth ($Z_{20}$)**: Depth of the $20^\circ\text{C}$ isotherm, standard in Indian Ocean Dipole monitoring:
   $$Z_{20} = z \quad \text{where } T(z) = 20.0^\circ\text{C}$$

---

## 🔌 Serving & API Infrastructure

The ML engine provides a modular Python and REST interface:

### 1. Standalone FastAPI Microservice (`src/serving/api.py`)
- Live endpoint at `http://127.0.0.1:8001`.
- Interactive Swagger documentation at `http://127.0.0.1:8001/docs`.
- `POST /predict/profile`: Profile, uncertainty, indicators, and nearest Argo reference.
- `GET /metrics`: Independent Argo validation skill metrics.

### 2. Full-Grid 2D Slice Batch Engine (`src/serving/map_predict.py`)
- Vectorized sliding window across 24,341 grid points.
- Batched model evaluation ($4,096$ points/batch) yielding full-basin horizontal temperature and confidence heatmaps in $<3$ seconds.
- Exports compressed `.npz` files for frontend canvas and WebGL rendering.

### 3. In-Situ ARGO Spatio-Temporal Matcher (`src/serving/argo_reference.py`)
- Fast in-memory spatial KD-tree/Haversine lookup locating real open-ocean ARGO profiles within $150\text{ km}$ and $\pm 5\text{ days}$ of any query location.

---

## 📁 Project Directory Layout

```text
personal/
├── config/
│   └── config.yaml                     # Bounding box, grid resolution, target depths
├── data/
│   ├── raw/                            # Monthly GLORYS12 & ARGO NetCDF files
│   └── processed/                      # Regridded datasets & paired samples
├── models/
│   ├── oceanembed_final.keras          # Trained OceanEmbed v2 model weights
│   ├── oceanembed_best.keras           # Best checkpoint weights
│   ├── oceanembed_normalization.npz    # Channel input mean & std
│   ├── oceanembed_target_normalization.npz # Depth target mean & std
│   ├── metrics.json                    # Test set skill metrics
│   └── argo_metrics.json               # Independent ARGO float validation report
├── notebooks/
│   ├── 01_data_exploration.ipynb       # Exploratory data analysis
│   ├── 02_preprocessing.ipynb          # Data cleaning & harmonization
│   ├── 03_baseline_model.ipynb         # ANN Climatology baseline
│   ├── 04_random_forest_baseline.ipynb # Random Forest baseline
│   └── 05_cnn_model.ipynb              # OceanEmbed v2 training & evaluation
├── src/
│   ├── data/
│   │   ├── fetch_glorys.py             # Copernicus Marine reanalysis downloader
│   │   ├── fetch_argo.py               # argopy ERDDAP in-situ downloader
│   │   └── regrid.py                   # Bilinear spatial regridder
│   ├── evaluation/
│   │   └── argo_validation.py          # Sea-truth ARGO validation benchmark
│   ├── models/
│   │   └── oceanembed_model.py         # OceanEmbed v2 architecture definition
│   ├── preprocessing/
│   │   └── pairing.py                  # 5x5 Patch extraction & GLORYS alignment
│   └── serving/
│       ├── api.py                      # FastAPI REST microservice
│       ├── predict.py                  # Single-point profile prediction engine
│       ├── map_predict.py              # 2D Basin-wide batch raster predictor
│       └── argo_reference.py           # Real-time ARGO spatio-temporal matcher
├── visualize_map.py                    # Dual-panel temperature & confidence visualizer
└── requirements.txt                    # Core ML dependencies
```

---

## 🚀 Quickstart & Usage

### 1. Environment Setup
```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate      # On Windows
source .venv/bin/activate  # On Linux / macOS

# Install dependencies
pip install -r requirements.txt
pip install fastapi uvicorn
```

### 2. Predict a Single Location Profile
```bash
python src/serving/predict.py --lat 14.2 --lon 68.5 --date 2021-03-15
```

### 3. Generate 2D Basin Heatmap with Confidence
```bash
python src/serving/map_predict.py --date 2021-06-15 --depth 100 --confidence --out data/processed/maps/
python visualize_map.py
```

### 4. Run Independent ARGO Sea-Truth Validation
```bash
python src/evaluation/argo_validation.py
```

### 5. Launch the ML REST API Server
```bash
python -m uvicorn src.serving.api:app --reload --port 8001
# Open http://127.0.0.1:8001/docs in browser
```

---

## 🏆 Smart India Hackathon 2026 Pitch Summary

- **Deliverable**: A self-contained, physically regularized AI engine estimating 3D ocean temperature from 7 surface satellite channels.
- **Innovation**: Center-pixel skip connection + spatial feature retention + per-depth normalization + active MC Dropout epistemic uncertainty.
- **Verification**: Evaluated against **1,194 open-ocean ARGO floats**, achieving a **$0.985$ Pearson correlation** and an overall **$1.22^\circ\text{C}$ RMSE** ($0.84^\circ\text{C}$ in deep waters).
- **Deployment**: Live FastAPI microservice ready for direct web frontend and operational decision-support dashboards.
