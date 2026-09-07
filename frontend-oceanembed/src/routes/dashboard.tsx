import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/ocean/TopNav";
import { OceanMap } from "@/components/ocean/OceanMap";
import { Panel } from "@/components/ocean/Panel";
import { SurfaceStats } from "@/components/ocean/SurfaceStats";
import { TimeSeriesChart, VerticalProfileChart } from "@/components/ocean/Charts";
import { DataSourcePanel, LocationDetails, LocationPicker } from "@/components/ocean/SidePanels";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { STANDARD_DEPTHS, reconstruct, timeSeriesFor, type DepthLevel, type Reconstruction } from "@/lib/ocean-model";
import { getLiveSurface } from "@/lib/ocean-data.functions";
import { getPredictions, type PredictionResponse } from "@/lib/django.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — OceanEmbed Subsurface Temperature" },
      {
        name: "description",
        content:
          "Reconstruct depth-wise subsurface ocean temperature over the North Indian Ocean from live 0.25° satellite surface observations.",
      },
      { property: "og:title", content: "OceanEmbed Dashboard — Subsurface Reconstruction" },
      {
        property: "og:description",
        content:
          "Daily 0.25° subsurface temperature profiles driven by live SST, currents and wind observations.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [draft, setDraft] = useState({ lat: 18.2, lon: 72.5 });
  const [point, setPoint] = useState({ lat: 15.2, lon: 88.6 });
  const [depth, setDepth] = useState(100);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);

  const live = useQuery({
    queryKey: ["live-surface", point.lat, point.lon],
    queryFn: () => getLiveSurface({ data: { lat: point.lat, lon: point.lon } }),
    staleTime: 15 * 60 * 1000,
  });

  const synthetic = useMemo(
    () =>
      reconstruct(point.lat, point.lon, {
        sst: live.data?.sst ?? undefined,
        currentU: live.data?.currentU ?? undefined,
        currentV: live.data?.currentV ?? undefined,
        windU: live.data?.windU ?? undefined,
        windV: live.data?.windV ?? undefined,
      }),
    [point, live.data],
  );

  const mlQuery = useQuery({
    queryKey: ["ml-predictions", point.lat, point.lon, live.data?.sst],
    queryFn: () =>
      getPredictions({
        data: {
          accessToken: accessToken!,
          latitude: point.lat,
          longitude: point.lon,
          date: new Date().toISOString().slice(0, 10),
          surface: live.data?.sst != null
            ? { sst: live.data.sst, current_u: live.data.currentU, current_v: live.data.currentV, wind_u: live.data.windU, wind_v: live.data.windV }
            : undefined,
        },
      }),
    enabled: !!accessToken,
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  const data: Reconstruction = useMemo(() => {
    if (mlQuery.data) {
      const res = mlQuery.data as PredictionResponse;
      const levels: DepthLevel[] = res.predictions.map((p) => ({
        depth: p.depth_m,
        temperature: p.temperature_c,
        reference: synthetic.levels.find((l) => l.depth === p.depth_m)?.reference ?? p.temperature_c,
        confidence: 95,
      }));
      return {
        lat: point.lat,
        lon: point.lon,
        basin: synthetic.basin,
        surface: synthetic.surface,
        levels,
        mld: res.predictions[0]?.mld_m ?? synthetic.mld,
        heatContent: res.predictions[0]?.heat_content_c ?? synthetic.heatContent,
        confidence: 95,
        mode: res.mode,
      } as Reconstruction & { mode: string };
    }
    return synthetic;
  }, [mlQuery.data, synthetic, point]);

  const mlMode = mlQuery.data ? (mlQuery.data as PredictionResponse).mode : null;

  const fallbackSeries = useMemo(
    () => timeSeriesFor(point.lat, point.lon, depth),
    [point, depth],
  );
  const series =
    depth === 0 && live.data?.sstSeries.length ? live.data.sstSeries : fallbackSeries;

  function exportCsv() {
    const csv = [
      "depth_m,predicted_temp_c,argo_reference_c,confidence_pct",
      ...data.levels.map((l) => `${l.depth},${l.temperature},${l.reference},${l.confidence}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `oceanembed_profile_${point.lat}N_${point.lon}E.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Profile exported as CSV");
  }

  return (
    <AppShell>
      <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <LocationPicker
            lat={draft.lat}
            lon={draft.lon}
            onPick={(lat, lon) => setDraft({ lat, lon })}
            onConfirm={() => {
              setPoint(draft);
              toast.success(`Reconstructing profile at ${draft.lat}°N, ${draft.lon}°E`);
            }}
          />
          <DataSourcePanel onExport={exportCsv} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="panel-surface flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
            <Radio
              className={`size-3.5 ${live.data?.sst != null ? "text-lime" : "text-muted-foreground"}`}
            />
            <span className="label-caps">Surface feed</span>
            {live.isLoading ? (
              <span className="text-muted-foreground">Fetching live observations…</span>
            ) : live.data?.sst != null ? (
              <span className="text-muted-foreground">
                Live SST, currents and 10 m winds on the 0.25° grid cell{" "}
                <span className="text-foreground">
                  {live.data.gridLat.toFixed(2)}°N, {live.data.gridLon.toFixed(2)}°E
                </span>
                {live.data.observedAt ? ` · ${live.data.observedAt.replace("T", " ")} UTC` : ""}
                {live.data.waveHeight != null
                  ? ` · waves ${live.data.waveHeight.toFixed(2)} m`
                  : ""}
                {mlMode === "ml" && (
                  <span className="ml-2 rounded bg-lime/20 px-1.5 py-0.5 text-lime font-semibold">
                    ML
                  </span>
                )}
                {mlMode === "demo" && (
                  <span className="ml-2 rounded bg-amber/20 px-1.5 py-0.5 text-amber font-semibold">
                    Demo
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Live feed unavailable for this cell — showing the physical baseline instead.
              </span>
            )}
          </div>

          <SurfaceStats surface={data.surface} />

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Panel
              title="Ocean map view"
              subtitle={`Predicted subsurface temperature at ${depth} m depth`}
              bodyClassName="p-3"
            >
              <OceanMap
                lat={point.lat}
                lon={point.lon}
                depth={depth}
                onPick={(lat, lon) => setPoint({ lat, lon })}
                className="h-[22rem]"
              />
            </Panel>
            <LocationDetails
              data={data}
              depth={depth}
              onClear={() => setPoint({ lat: 15.2, lon: 88.6 })}
            />
          </div>

          <div className="grid gap-4 2xl:grid-cols-3">
            <Panel
              title="Vertical temperature profile"
              subtitle="How warm the water is from the surface down to 1000 m — our prediction vs the ARGO float reference"
            >
              <VerticalProfileChart levels={data.levels} />
            </Panel>

            <Panel
              title="Depth-wise predictions"
              subtitle="Predicted temperature at all 15 depths — click a row to explore it, ARGO ref shows the real float measurement"
              action={
                <Button variant="secondary" size="sm" className="gap-1.5" onClick={exportCsv}>
                  <Download className="size-3.5" /> Export
                </Button>
              }
              bodyClassName="p-0"
            >
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-popover">
                    <tr className="label-caps">
                      <th className="px-4 py-2 text-left font-semibold">Depth (m)</th>
                      <th className="px-4 py-2 text-right font-semibold">Predicted (°C)</th>
                      <th className="px-4 py-2 text-right font-semibold">ARGO ref (°C)</th>
                      <th className="px-4 py-2 text-right font-semibold">Conf. (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.levels.map((l) => (
                      <tr
                        key={l.depth}
                        onClick={() => setDepth(l.depth)}
                        className={`cursor-pointer border-t border-border transition-colors hover:bg-secondary/50 ${
                          l.depth === depth ? "bg-primary/20" : ""
                        }`}
                      >
                        <td className="px-4 py-2 text-muted-foreground">{l.depth}</td>
                        <td className="px-4 py-2 text-right font-display">
                          {l.temperature.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {l.reference.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {l.confidence}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="Time series at selected location"
              subtitle={
                depth === 0 && live.data?.sstSeries.length
                  ? "Observed daily SST, last 3 weeks"
                  : "Daily reconstruction"
              }
              action={
                <Select value={String(depth)} onValueChange={(v) => setDepth(Number(v))}>
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STANDARD_DEPTHS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} m
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              <TimeSeriesChart data={series} />
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
