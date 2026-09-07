import { useEffect, useRef } from "react";
import { REGION, temperatureAt } from "@/lib/ocean-model";
import { cn } from "@/lib/utils";

/**
 * Live temperature heatmap rendered from the model — no static image.
 * Samples `temperatureAt` on a coarse grid over REGION, colors each cell,
 * then upscales with smoothing so the field looks continuous. Repaints
 * whenever `depth` changes, so the map follows the depth selector.
 */

const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [40, 20, 160]],
  [0.25, [0, 120, 255]],
  [0.45, [0, 200, 200]],
  [0.62, [40, 220, 90]],
  [0.78, [240, 210, 40]],
  [0.9, [250, 130, 20]],
  [1.0, [205, 20, 20]],
];

function heatColor(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [t0, c0] = HEAT_STOPS[i - 1]!;
    const [t1, c1] = HEAT_STOPS[i]!;
    if (clamped <= t1) {
      const f = (clamped - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1]![1];
}

const GRID_W = 120;
const GRID_H = 50;
const SMOOTH_PASSES = 3;

function smoothField(src: Float32Array, w: number, h: number, passes: number): Float32Array {
  let cur = src;
  for (let n = 0; n < passes; n++) {
    const dst = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = Math.min(h - 1, Math.max(0, j + dj));
          for (let di = -1; di <= 1; di++) {
            const ii = Math.min(w - 1, Math.max(0, i + di));
            sum += cur[jj * w + ii]!;
            count++;
          }
        }
        dst[j * w + i] = sum / count;
      }
    }
    cur = dst;
  }
  return cur;
}

export function HeatmapCanvas({ depth, className }: { depth: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const temps = new Float32Array(GRID_W * GRID_H);
    for (let j = 0; j < GRID_H; j++) {
      const lat = REGION.latMax - (j / (GRID_H - 1)) * (REGION.latMax - REGION.latMin);
      for (let i = 0; i < GRID_W; i++) {
        const lon = REGION.lonMin + (i / (GRID_W - 1)) * (REGION.lonMax - REGION.lonMin);
        temps[j * GRID_W + i] = temperatureAt(lat, lon, depth);
      }
    }

    const field = smoothField(temps, GRID_W, GRID_H, SMOOTH_PASSES);
    let smin = Infinity;
    let smax = -Infinity;
    for (let k = 0; k < field.length; k++) {
      const v = field[k]!;
      if (v < smin) smin = v;
      if (v > smax) smax = v;
    }
    const srange = smax - smin || 1;
    const off = document.createElement("canvas");
    off.width = GRID_W;
    off.height = GRID_H;
    const octx = off.getContext("2d");
    if (!octx) return;
    const img = octx.createImageData(GRID_W, GRID_H);
    for (let k = 0; k < field.length; k++) {
      const [r, g, b] = heatColor((field[k]! - smin) / srange);
      img.data[k * 4] = r;
      img.data[k * 4 + 1] = g;
      img.data[k * 4 + 2] = b;
      img.data[k * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [depth]);

  return (
    <canvas
      ref={ref}
      width={600}
      height={252}
      role="img"
      aria-label={`Reconstructed temperature field at ${depth} m depth over the North Indian Ocean`}
      className={cn("size-full", className)}
    />
  );
}
