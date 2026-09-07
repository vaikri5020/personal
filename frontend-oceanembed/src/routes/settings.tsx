import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BellRing, Check, Database, Layers, RotateCcw, SlidersHorizontal, Thermometer, Wind, Waves, WavesLadder, Satellite, Fish, Gauge, UserRound, Server } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/ocean/Panel";
import { AppShell } from "@/components/ocean/TopNav";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { STANDARD_DEPTHS } from "@/lib/ocean-model";
import { supabase } from "@/integrations/supabase/client";
import { getDjangoAuthStatus } from "@/lib/django.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Configuration — OceanEmbed" },
      {
        name: "description",
        content:
          "Datasets, grid configuration, display preferences and model settings used by the OceanEmbed subsurface temperature reconstruction framework.",
      },
      { property: "og:title", content: "Configuration — OceanEmbed" },
      {
        property: "og:description",
        content: "Input datasets, target reanalysis, depth levels, display preferences and model architecture options.",
      },
    ],
  }),
  component: SettingsPage,
});

const DATASETS = [
  { name: "Sea Surface Temperature", icon: Thermometer, source: "Satellite L4 analysis", res: "0.25° · daily", status: "Live" },
  { name: "Sea Surface Salinity", icon: Fish, source: "SMAP / SMOS", res: "0.25° · daily (interp.)", status: "Planned" },
  { name: "SSH / Sea Level Anomaly", icon: WavesLadder, source: "Altimetry gridded product", res: "0.25° · daily", status: "Planned" },
  { name: "Surface currents (U, V)", icon: Waves, source: "Altimetry-derived geostrophic + Ekman", res: "0.25° · daily", status: "Live" },
  { name: "Surface winds (U, V)", icon: Wind, source: "Scatterometer / reanalysis blend", res: "0.25° · daily", status: "Live" },
  { name: "Subsurface temperature (target)", icon: Layers, source: "GLORYS reanalysis", res: "0.083° → 0.25°", status: "Planned" },
  { name: "Validation", icon: Gauge, source: "INCOIS LAS gridded ARGO", res: "1° · monthly", status: "Planned" },
] as const;

const MODEL_OPTIONS = [
  { key: "vit", label: "ViT embedding encoder", detail: "16×16 patches, 128-d latent", on: true },
  { key: "cnn", label: "CNN residual branch", detail: "Local mesoscale features", on: true },
  { key: "gnn", label: "Graph attention refinement", detail: "Neighbour grid coupling", on: false },
  { key: "argo", label: "ARGO fine-tuning", detail: "Adapt to in-situ profiles", on: true },
] as const;

const PREFS = [
  { key: "fahrenheit", label: "Show °F alongside °C", detail: "Dual units on dashboard cards and profiles", on: false },
  { key: "animations", label: "Animated charts & 3D motion", detail: "Turn off for a calmer, battery-friendly view", on: true },
  { key: "autorefresh", label: "Auto-refresh live feed", detail: "Re-pull satellite observations every 15 minutes", on: true },
  { key: "compact", label: "Compact tables", detail: "Denser rows on analytics and validation tables", on: false },
] as const;

type PrefKey = (typeof MODEL_OPTIONS)[number]["key"] | (typeof PREFS)[number]["key"];
type PrefState = Record<PrefKey, boolean>;

const STORAGE_KEY = "oceanembed-settings";

const DEFAULT_PREFS: PrefState = {
  ...Object.fromEntries(MODEL_OPTIONS.map((o) => [o.key, o.on])),
  ...Object.fromEntries(PREFS.map((o) => [o.key, o.on])),
} as PrefState;

function loadPrefs(): PrefState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

function StatusBadge({ status }: { status: string }) {  const live = status === "Live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        live
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-amber-400/30 bg-amber-400/10 text-amber-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
      {status}
    </span>
  );
}

function AccountServicesPanel() {
  const [email, setEmail] = useState<string | null>(null);
  const [django, setDjango] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [djangoEmail, setDjangoEmail] = useState("");
  const [djangoError, setDjangoError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      setEmail(session?.user.email ?? null);
      if (!session) return;
      setDjango("checking");
      try {
        const result = await getDjangoAuthStatus({ data: { accessToken: session.access_token } });
        setDjangoEmail(result.email);
        setDjango("ok");
      } catch (err) {
        setDjangoError(err instanceof Error ? err.message : "Backend unreachable.");
        setDjango("error");
      }
    });
  }, []);

  return (
    <Panel title="Account & connected services" subtitle="Who the app and the API see" bodyClassName="p-4">
      <ul className="space-y-3 text-sm">
        <li className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-accent">
            <UserRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-caps">Supabase session</p>
            {email ? (
              <p className="truncate text-foreground/90">{email}</p>
            ) : (
              <p className="text-muted-foreground">
                Not signed in —{" "}
                <Link to="/auth" className="font-medium text-accent hover:underline">
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-accent">
            <Server className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-caps">Django backend</p>
            {django === "idle" && <p className="text-muted-foreground">Sign in to verify.</p>}
            {django === "checking" && <p className="text-muted-foreground">Verifying session…</p>}
            {django === "ok" && (
              <p className="truncate text-emerald-300">
                Connected{djangoEmail ? ` as ${djangoEmail}` : ""}
              </p>
            )}
            {django === "error" && (
              <p className="text-amber-300">
                Not connected — {djangoError} Run Django with SUPABASE_URL set.
              </p>
            )}
          </div>
        </li>
      </ul>
    </Panel>
  );
}

function SettingsPage() {
  const [prefs, setPrefs] = useState<PrefState>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = (key: PrefKey, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    setPrefs(DEFAULT_PREFS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PREFS));
    toast.success("Settings restored to defaults");
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    toast.success("Preferences saved", { description: "They'll apply across the dashboard on your next visit." });
  };

  const renderToggle = (o: { key: PrefKey; label: string; detail: string }) => (
    <li key={o.key} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/20 px-3.5 py-3 transition-colors hover:bg-secondary/40">
      <div>
        <p className="text-sm font-medium">{o.label}</p>
        <p className="text-xs text-muted-foreground">{o.detail}</p>
      </div>
      <Switch checked={prefs[o.key]} onCheckedChange={(v) => update(o.key, v)} aria-label={o.label} />
    </li>
  );

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Datasets, model architecture and display preferences for the reconstruction framework.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={save}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> Save preferences
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel title="Datasets" subtitle="Harmonised inputs, target and validation sources" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="label-caps">
                    <th className="px-4 py-2 text-left font-semibold">Variable</th>
                    <th className="px-4 py-2 text-left font-semibold">Source</th>
                    <th className="px-4 py-2 text-left font-semibold">Resolution</th>
                    <th className="px-4 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DATASETS.map((d) => (
                    <tr key={d.name} className="border-t border-border hover:bg-secondary/40">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <d.icon className="h-3.5 w-3.5 text-primary" />
                          {d.name}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{d.source}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{d.res}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              “Live” streams feed the dashboard in real time; “Planned” sources need Copernicus / INCOIS access and are
              next on the integration roadmap.
            </p>
          </Panel>

          <Panel title="Output grid" subtitle="Standard depth levels (m)">
            <div className="flex flex-wrap gap-2">
              {STANDARD_DEPTHS.map((d) => (
                <span
                  key={d}
                  className="rounded-md border border-border bg-secondary/50 px-2.5 py-1 font-display text-xs"
                >
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Region 5°N–30°N, 45°E–105°E · 0.25° × 0.25° · daily temporal resolution.
            </p>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <AccountServicesPanel />
          <Panel title="Model options" subtitle="Embedding architecture switches" bodyClassName="p-3">
            <ul className="space-y-2.5">{MODEL_OPTIONS.map(renderToggle)}</ul>
          </Panel>

          <Panel title="Display preferences" subtitle="Saved on this device" bodyClassName="p-3">
            <ul className="space-y-2.5">{PREFS.map(renderToggle)}</ul>
          </Panel>

          <Panel title="Alerts" subtitle="Disaster notifications" bodyClassName="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                  <BellRing className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Hazard email alerts</p>
                  <p className="text-xs text-muted-foreground">Marine heatwaves, cyclone winds, high seas</p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/alerts">Manage</Link>
              </Button>
            </div>
          </Panel>

          <Panel title="System" subtitle="Runtime footprint" bodyClassName="p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { icon: Satellite, k: "6", v: "watch points" },
                { icon: Database, k: "7", v: "datasets" },
                { icon: SlidersHorizontal, k: "15", v: "depth levels" },
              ].map((s) => (
                <div key={s.v} className="rounded-lg border border-border/60 bg-secondary/20 px-2 py-3">
                  <s.icon className="mx-auto mb-1.5 h-4 w-4 text-primary" />
                  <p className="font-display text-lg font-bold">{s.k}</p>
                  <p className="text-[11px] text-muted-foreground">{s.v}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
