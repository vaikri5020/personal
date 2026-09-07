# 🌊 OceanDepth AI

### AI-Based Subsurface Ocean Temperature Reconstruction

OceanDepth AI uses **satellite surface observations and AI/ML** to reconstruct ocean temperature profiles from the surface down to **1000 m**.

### 🎯 Problem

Estimate subsurface ocean temperature using:

* SST
* SSS
* SSH/SLA
* Surface currents (U/V)
* Surface winds (U/V)

### 🌡️ Output

Temperature predictions at depths from **0 m to 1000 m** on a daily **0.25° × 0.25°** grid over the **North Indian Ocean**.

### 🧠 Approach

```text
Satellite Data
      ↓
Preprocessing
      ↓
AI/ML Model
      ↓
Temperature Profile
      ↓
Visualization
```

### 🛠️ Tech Stack

**Python • PyTorch • Django • React • NumPy • Xarray**

### 🔌 Backend

The Django backend is available in this repository and exposes stable JSON APIs for frontend and AI/ML integration.

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Backend docs: [`BACKEND_API.md`](BACKEND_API.md)

After starting Django, open this test page to try the backend without a separate frontend setup:

```text
http://127.0.0.1:8000/test/
```

### 📊 Evaluation

* RMSE
* Correlation
* Bias

### 🌊 Key Feature

An interactive **"Dive into the Ocean"** interface that lets users select a location and explore predicted temperatures at different depths.

> **Explore the Surface. Dive Beneath. Discover the Ocean.**
