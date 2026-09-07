import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OceanWater, MAX_DEPTH_METERS } from "../components/OceanWater";

export const Route = createFileRoute("/ocean")({
  ssr: false,
  component: OceanPage,
});

function OceanPage() {
  const [depth, setDepth] = useState(0);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <OceanWater scrollProgress={depth / MAX_DEPTH_METERS} />

      {/* depth gauge */}
      <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-right text-cyan-50">
        <div className="text-5xl font-bold tabular-nums drop-shadow-lg md:text-6xl">
          {Math.round(depth)}
          <span className="text-2xl"> m</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-cyan-200/80">
          Ocean Depth
        </div>
      </div>

      {/* slider */}
      <div className="absolute bottom-10 left-1/2 w-64 -translate-x-1/2">
        <input
          type="range"
          min={0}
          max={MAX_DEPTH_METERS}
          step={1}
          value={depth}
          onChange={(e) => setDepth(Number(e.target.value))}
          className="w-full accent-cyan-300"
        />
        <div className="mt-2 text-center text-xs text-cyan-200/70">
          Drag to explore depth
        </div>
      </div>

      {/* label */}
      <div className="pointer-events-none absolute left-8 top-8 text-cyan-50">
        <h1 className="text-3xl font-bold drop-shadow-lg">Ocean Depth</h1>
        <p className="text-sm text-cyan-200/80">Just the water — no submarine.</p>
      </div>
    </div>
  );
}
