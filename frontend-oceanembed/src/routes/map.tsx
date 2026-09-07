import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OceanMap } from "@/components/ocean/OceanMap";
import { Panel } from "@/components/ocean/Panel";
import { SurfaceStats } from "@/components/ocean/SurfaceStats";
import { AppShell } from "@/components/ocean/TopNav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STANDARD_DEPTHS, reconstruct } from "@/lib/ocean-model";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Basin Map — OceanEmbed" },
      {
        name: "description",
        content:
          "Full-basin view of reconstructed subsurface temperature across the North Indian Ocean at any standard depth level.",
      },
      { property: "og:title", content: "Basin Map — OceanEmbed" },
      {
        property: "og:description",
        content: "Explore reconstructed temperature fields from 0 m down to 1000 m depth.",
      },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  const [point, setPoint] = useState({ lat: 15.2, lon: 88.6 });
  const [depth, setDepth] = useState(100);
  const data = useMemo(() => reconstruct(point.lat, point.lon), [point]);

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <SurfaceStats surface={data.surface} />
        <Panel
          title="Basin-scale reconstruction"
          subtitle="Region 5°N–30°N, 45°E–105°E · 0.25° × 0.25° · daily"
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
          bodyClassName="p-3"
        >
          <OceanMap
            lat={point.lat}
            lon={point.lon}
            depth={depth}
            onPick={(lat, lon) => setPoint({ lat, lon })}
            className="h-[34rem]"
          />
        </Panel>
      </div>
    </AppShell>
  );
}
