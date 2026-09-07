import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DiveScene } from "../components/DiveScene";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Slider } from "../components/ui/slider";

export const Route = createFileRoute("/dive")({
  ssr: false,
  component: DivePage,
});

const API_BASE = "http://127.0.0.1:8000";

const ZONES = [
  { name: "Sunlight Zone", sub: "0 \u2013 200 m", color: "#ffe566", icon: "\u2600\uFE0F" },
  { name: "Twilight Zone", sub: "200 \u2013 1000 m", color: "#4dc9f6", icon: "\uD83C\uDF19" },
  { name: "Deep Ocean", sub: "1000 m +", color: "#7a8fd4", icon: "\u2B50" },
];

const PRESETS = [
  { label: "Surface", depth: 0 },
  { label: "Thermocline", depth: 100 },
  { label: "Mesopelagic", depth: 500 },
  { label: "Abyss", depth: 1000 },
];

const STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

function tempColor(temp: number) {
  if (temp >= 26) return "#ff6b6b";
  if (temp >= 22) return "#ff9f43";
  if (temp >= 18) return "#ffe566";
  if (temp >= 12) return "#4dc9f6";
  if (temp >= 8) return "#1a8ab5";
  return "#1a237e";
}

function currentZone(depth: number) {
  if (depth <= 200) return ZONES[0]!;
  if (depth <= 1000) return ZONES[1]!;
  return ZONES[2]!;
}

const FALLBACK_TEMPS: Record<number, number> = {
  0: 28.4, 5: 28.2, 10: 27.9, 20: 27.2, 30: 26.5, 50: 25.1,
  75: 23.0, 100: 21.0, 125: 19.2, 150: 17.5, 200: 14.0,
  300: 10.0, 500: 6.0, 700: 4.2, 1000: 3.8,
};

function fallbackTemp(d: number) {
  const keys = Object.keys(FALLBACK_TEMPS).map(Number).sort((a, b) => a - b);
  if (d <= keys[0]!) return FALLBACK_TEMPS[keys[0]!]!;
  if (d >= keys[keys.length - 1]!) return FALLBACK_TEMPS[keys[keys.length - 1]!]!;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (d >= a && d <= b) {
      const t = (d - a) / (b - a);
      return FALLBACK_TEMPS[a]! * (1 - t) + FALLBACK_TEMPS[b]! * t;
    }
  }
  return 4.0;
}

function DivePage() {
  const [depth, setDepth] = useState(50);
  const [inspect, setInspect] = useState(false);
  const [lat, setLat] = useState("15.5");
  const [lon, setLon] = useState("72.8");
  const [profile, setProfile] = useState<number[]>(STANDARD_DEPTHS.map((d) => fallbackTemp(d)));
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [apiStatus, setApiStatus] = useState<"checking" | "connected" | "offline">("checking");

  // fetch temperature profile from Django backend
  const fetchPrediction = useCallback(async (latVal: string, lonVal: string) => {
    setApiStatus("checking");
    try {
      const csrfRes = await fetch(`${API_BASE}/api/auth/csrf/`, { credentials: "include" });
      const csrfToken = csrfRes.headers.get("X-CSRFToken") || "";

      const res = await fetch(`${API_BASE}/api/predict/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
        body: JSON.stringify({
          latitude: parseFloat(latVal) || 15.5,
          longitude: parseFloat(lonVal) || 72.8,
          depths: STANDARD_DEPTHS,
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);

      const data = await res.json();
      if (data.temperature) {
        const temps = STANDARD_DEPTHS.map((d) => data.temperature[d] ?? fallbackTemp(d));
        setProfile(temps);
        setSource("live");
        setApiStatus("connected");
      } else {
        throw new Error("No temperature data");
      }
    } catch {
      setProfile(STANDARD_DEPTHS.map((d) => fallbackTemp(d)));
      setSource("demo");
      setApiStatus("offline");
    }
  }, []);

  // check API health on mount
  useEffect(() => {
    fetch(API_BASE + "/api/health/", { credentials: "include" })
      .then((r) => r.json())
      .then(() => setApiStatus("connected"))
      .catch(() => setApiStatus("offline"));
  }, []);

  // fetch profile on location change (debounced)
  useEffect(() => {
    const id = setTimeout(() => fetchPrediction(lat, lon), 600);
    return () => clearTimeout(id);
  }, [lat, lon, fetchPrediction]);

  const tempAt = useCallback(
    (d: number) => {
      const idx = STANDARD_DEPTHS.indexOf(d);
      if (idx >= 0) return profile[idx] ?? fallbackTemp(d);
      return fallbackTemp(d);
    },
    [profile],
  );

  const temp = tempAt(depth);
  const zone = currentZone(depth);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <DiveScene depthMeters={depth} inspect={inspect} onInspectChange={setInspect} />

      {/* inspect-mode banner — click water or this button to return to follow-cam */}
      {inspect && (
        <div className="absolute left-1/2 top-5 z-40 -translate-x-1/2">
          <button
            onClick={() => setInspect(false)}
            className="rounded-full border border-cyan-400/50 bg-black/60 px-5 py-2 text-xs font-bold uppercase tracking-widest text-cyan-200 backdrop-blur-md transition-all hover:bg-cyan-900/60"
          >
            ✕ Exit submarine inspect
          </button>
        </div>
      )}

      {/* TOP BAR — logo + location + API status */}
      <div className="pointer-events-none absolute left-5 top-5 z-20 flex flex-col gap-1">
        <h1 className="text-2xl font-black tracking-tight drop-shadow-lg">
          OceanDepth <span className="text-cyan-300">Dive</span>
        </h1>
        <div className="flex items-center gap-2 text-xs text-foreground/70">
          <span>Location</span>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="pointer-events-auto w-16 rounded bg-black/30 px-1 text-center"
            placeholder="Lat"
          />
          <span>,</span>
          <input
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            className="pointer-events-auto w-16 rounded bg-black/30 px-1 text-center"
            placeholder="Lon"
          />
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-foreground/50">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background:
                apiStatus === "connected" ? "#4ade80" : apiStatus === "checking" ? "#facc15" : "#f87171",
            }}
          />
          {apiStatus === "connected"
            ? source === "live"
              ? "Live data"
              : "Connected"
            : apiStatus === "checking"
              ? "Connecting..."
              : "Demo mode"}
        </div>
      </div>

      {/* RIGHT PANEL — depth readout + zone + animated temperature gauge */}
      <div className="pointer-events-none absolute right-6 top-1/2 z-20 -translate-y-1/2 text-right">
        <div className="text-6xl font-black tabular-nums drop-shadow-lg transition-colors duration-500">
          {depth}
        </div>
        <div className="mt-1 text-lg font-semibold text-cyan-300">meters</div>
        <div
          className="mt-2 text-sm font-bold uppercase tracking-widest transition-colors duration-500"
          style={{ color: zone.color }}
        >
          {zone.icon} {zone.name}
        </div>
        <div className="text-xs text-foreground/60">{zone.sub}</div>

        {/* animated temperature gauge */}
        <div className="ml-auto mt-4 flex items-center gap-2">
          <div
            className="text-2xl font-bold tabular-nums transition-colors duration-500"
            style={{ color: tempColor(temp) }}
          >
            {temp.toFixed(1)}\u00B0C
          </div>
        </div>
        <div className="ml-auto mt-1 h-2 w-32 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${((temp - 3) / (30 - 3)) * 100}%`,
              background: `linear-gradient(90deg, ${tempColor(temp)}, ${tempColor(temp)}cc)`,
            }}
          />
        </div>

        {/* depth zone markers on a vertical track */}
        <div className="mt-6 flex flex-col gap-1 text-[9px] text-foreground/50">
          {ZONES.map((z) => {
            const active = currentZone(depth).name === z.name;
            return (
              <div
                key={z.name}
                className="flex items-center gap-1 transition-all duration-300"
                style={{ opacity: active ? 1 : 0.35, color: z.color }}
              >
                <span className="inline-block h-1 w-1 rounded-full" style={{ background: z.color }} />
                {z.name}
              </div>
            );
          })}
        </div>
      </div>

      {/* LEFT PANEL — floating data bubbles */}
      <div className="pointer-events-none absolute left-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 md:flex">
        <DataBubble label="SST" value={`${tempAt(0).toFixed(1)}\u00B0C`} color="#4dc9f6" />
        <DataBubble label="SSS" value="34.7 PSU" color="#79e29d" />
        <DataBubble label="SSH" value="0.12 m" color="#ffe566" />
        <DataBubble label="Wind" value="4.1 m/s" color="#ff9f43" />
        <DataBubble label="Depth" value={`${depth} m`} color="#c86bfa" />
      </div>

      {/* BOTTOM PANEL — slider, zone jumps, depth presets, chart */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-wrap items-end gap-4 border-t border-border/40 bg-background/60 p-4 backdrop-blur-md md:flex-nowrap md:justify-between">
        {/* depth slider + zone legend */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-end justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-foreground/60">
              Depth
            </span>
            <span className="text-xl font-black text-cyan-300 tabular-nums">{depth} m</span>
          </div>
          <Slider
            min={0}
            max={1000}
            step={1}
            value={[depth]}
            onValueChange={(v) => setDepth(v[0] ?? 0)}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-foreground/40">
            {ZONES.map((z) => (
              <span key={z.name} style={{ color: z.color }}>
                {z.name}
              </span>
            ))}
          </div>

          {/* zone jump buttons + depth presets */}
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.depth}
                onClick={() => setDepth(p.depth)}
                className="pointer-events-auto rounded-full border border-cyan-500/30 bg-black/30 px-3 py-1 text-[10px] font-semibold text-cyan-300 backdrop-blur-sm transition-all hover:border-cyan-400 hover:bg-cyan-900/40 hover:text-cyan-100"
              >
                {p.label} ({p.depth}m)
              </button>
            ))}
          </div>
        </div>

        {/* temperature profile chart */}
        <Card className="w-full shrink-0 md:w-72">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest">
              Temperature Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex h-28 items-end gap-[3px]">
              {STANDARD_DEPTHS.map((d, i) => (
                <div
                  key={d}
                  className="group flex-1 rounded-t-sm transition-all duration-300"
                  style={{
                    height: `${((profile[i]! - 3) / 27) * 100}%`,
                    background: tempColor(profile[i]!),
                    opacity: Math.abs(d - depth) < 100 ? 1 : 0.4,
                  }}
                  title={`${d}m: ${profile[i]!.toFixed(1)}\u00B0C`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-foreground/40">
              <span>0m</span>
              <span>500m</span>
              <span>1000m</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DataBubble({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-full border px-4 py-2 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105"
      style={{ borderColor: `${color}66`, background: "rgba(6,24,38,0.55)" }}
    >
      <div className="text-[9px] uppercase tracking-widest" style={{ color }}>
        {label}
      </div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}