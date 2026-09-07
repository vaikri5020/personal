import { useEffect, useRef, useState } from "react";
import { oceanState, MAX_DEPTH_METERS } from "../lib/ocean-state";

const ZONES = [
  { at: 0, name: "Sunlight Zone", sub: "0 – 200 m" },
  { at: 0.32, name: "Twilight Zone", sub: "200 – 1000 m" },
  { at: 0.68, name: "Midnight Zone", sub: "1000 m +" },
  { at: 0.92, name: "The Seafloor", sub: "2000 m" },
];

export function OceanHUD() {
  const [depth, setDepth] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const tick = () => {
      setDepth((d) => {
        const next = Math.round(oceanState.progress * MAX_DEPTH_METERS);
        return next === d ? d : next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const zone = ([...ZONES].reverse().find((z) => oceanState.progress >= z.at) ?? ZONES[0])!;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-sans">
      {/* title */}
      <div className="absolute left-1/2 top-8 -translate-x-1/2 text-center">
        <h1
          className="text-4xl font-bold tracking-tight text-cyan-50 drop-shadow-lg md:text-6xl"
          style={{ opacity: Math.max(0, 1 - oceanState.progress * 6) }}
        >
          DESCENT
        </h1>
        <p
          className="mt-2 text-sm tracking-widest text-cyan-100/80 uppercase"
          style={{ opacity: Math.max(0, 1 - oceanState.progress * 6) }}
        >
          Scroll to dive 2,000 meters
        </p>
      </div>

      {/* depth gauge */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 text-right md:right-10">
        <div className="text-5xl font-bold tabular-nums text-cyan-50 drop-shadow-md md:text-7xl">
          {depth}
          <span className="text-2xl text-cyan-200/80 md:text-3xl"> m</span>
        </div>
        <div className="mt-1 text-xs font-medium tracking-[0.3em] text-cyan-200/90 uppercase">
          {zone.name}
        </div>
        <div className="text-[10px] text-cyan-200/60">{zone.sub}</div>
        {/* progress rail */}
        <div className="ml-auto mt-4 h-40 w-1 overflow-hidden rounded bg-cyan-100/20">
          <div
            className="w-full rounded bg-cyan-300"
            style={{ height: `${oceanState.progress * 100}%` }}
          />
        </div>
      </div>

      {/* scroll hint */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-cyan-100/90"
        style={{ opacity: Math.max(0, 1 - oceanState.progress * 8) }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>

      {/* bottom message */}
      <div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-center"
        style={{ opacity: Math.max(0, (oceanState.progress - 0.9) * 10) }}
      >
        <p className="text-lg font-semibold text-cyan-100">You reached the seafloor.</p>
        <p className="text-sm text-cyan-200/70">Scroll up to resurface.</p>
      </div>
    </div>
  );
}
