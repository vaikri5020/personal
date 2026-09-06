"""
visualize_map.py

Visualizes 2D ocean depth slice predictions:
- Panel 1: Subsurface Temperature (°C)
- Panel 2: Model Confidence (%) via Monte Carlo Dropout
"""

from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

# Path to precomputed map
FILE_PATH = "data/processed/maps/map_2021-06-15_100m.npz"

data = np.load(FILE_PATH, allow_pickle=True)
lat = data["latitude"]
lon = data["longitude"]
temperature = np.ma.masked_invalid(data["temperature"].astype(float))
has_confidence = "confidence" in data and data["confidence"].size > 0

if has_confidence:
    confidence = np.ma.masked_invalid(data["confidence"].astype(float))
    fig, axes = plt.subplots(1, 2, figsize=(18, 6), sharey=True)
else:
    fig, ax = plt.subplots(1, 1, figsize=(10, 6))
    axes = [ax]

# -------------------------------------------------------------
# Panel 1: Temperature (°C)
# -------------------------------------------------------------
mesh1 = axes[0].pcolormesh(
    lon, lat, temperature, shading="auto", cmap="coolwarm"
)
cbar1 = plt.colorbar(mesh1, ax=axes[0], pad=0.02)
cbar1.set_label("Temperature (°C)", fontsize=11)

axes[0].set_title(
    f"OceanEmbed v2 Predicted Temperature\nDepth: {int(data['depth'])} m | Date: {data['date']}",
    fontsize=12,
    fontweight="bold",
)
axes[0].set_xlabel("Longitude (°E)", fontsize=11)
axes[0].set_ylabel("Latitude (°N)", fontsize=11)
axes[0].grid(True, linestyle="--", alpha=0.3)

# -------------------------------------------------------------
# Panel 2: Confidence (%)
# -------------------------------------------------------------
if has_confidence:
    mesh2 = axes[1].pcolormesh(
        lon, lat, confidence, shading="auto", cmap="viridis", vmin=60, vmax=100
    )
    cbar2 = plt.colorbar(mesh2, ax=axes[1], pad=0.02)
    cbar2.set_label("Confidence (%)", fontsize=11)

    axes[1].set_title(
        f"Model Confidence (MC Dropout)\nDepth: {int(data['depth'])} m | Date: {data['date']}",
        fontsize=12,
        fontweight="bold",
    )
    axes[1].set_xlabel("Longitude (°E)", fontsize=11)
    axes[1].grid(True, linestyle="--", alpha=0.3)

plt.tight_layout()
plt.show()
