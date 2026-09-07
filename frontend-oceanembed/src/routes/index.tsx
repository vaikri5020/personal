import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Fish,
  Layers,
  Leaf,
  Satellite,
  Sparkles,
  Users,
  Waves,
} from "lucide-react";
import { AppShell } from "@/components/ocean/TopNav";
import { Button } from "@/components/ui/button";
import heatmap from "@/assets/ocean-heatmap.jpg";
import bg from "@/assets/deep-ocean-bg.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OceanEmbed — From Surface Observations to Deeper Understanding" },
      {
        name: "description",
        content:
          "OceanEmbed reconstructs depth-wise subsurface ocean temperature for the North Indian Ocean from live satellite surface observations at 0.25° daily resolution.",
      },
      { property: "og:title", content: "OceanEmbed — AI for a Healthier Ocean" },
      {
        property: "og:description",
        content:
          "Turn SST, SSS, sea level anomaly, currents and winds into 15-level subsurface temperature profiles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const PILLARS = [
  {
    icon: Satellite,
    title: "Satellite-driven observations",
    detail: "Live SST, currents and winds harmonised to a 0.25° daily grid",
  },
  {
    icon: Brain,
    title: "Embedding-based reconstruction",
    detail: "Compact latent ocean state decoded to depth",
  },
  {
    icon: BarChart3,
    title: "Spatially continuous insight",
    detail: "Basin-wide profiles where floats are sparse",
  },
  {
    icon: Leaf,
    title: "Real-world impact",
    detail: "Climate research, fisheries and ocean policy",
  },
];

const STEPS = [
  {
    icon: Satellite,
    title: "Collect surface data",
    detail: "SST, SSS, sea level anomaly, currents and winds",
  },
  { icon: Layers, title: "Harmonise & patch", detail: "Regridded to 0.25° × 0.25°, daily composites" },
  { icon: Sparkles, title: "Embed & reconstruct", detail: "Latent ocean state to 15 depth levels" },
  { icon: BarChart3, title: "Validate & explore", detail: "Skill scores against ARGO profiles" },
];

const MISSION = [
  { icon: Waves, title: "Climate resilience", detail: "Better insight into a changing ocean" },
  { icon: Fish, title: "Sustainable fisheries", detail: "Data-driven decision support" },
  { icon: Layers, title: "Ocean research", detail: "High-resolution subsurface structure" },
  { icon: Users, title: "People & communities", detail: "Accessible ocean intelligence" },
];

const STATS = [
  { value: "0.25°", label: "Daily grid resolution" },
  { value: "0 – 1000 m", label: "Depth coverage" },
  { value: "15", label: "Standard depth levels" },
  { value: "5–30°N, 45–105°E", label: "North Indian Ocean" },
];

function Home() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <section className="relative overflow-hidden rounded-2xl border border-border">
          <img
            src={bg.url}
            alt="Sunlight filtering through deep ocean water"
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
          <div className="relative grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:p-12">
            <div>
              <p className="label-caps">AI for a healthier ocean</p>
              <h1 className="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl">
                From Surface Observations to{" "}
                <span className="text-accent">Deeper Understanding</span>
              </h1>
              <p className="mt-4 max-w-xl text-muted-foreground">
                OceanEmbed reconstructs subsurface ocean temperature profiles from satellite surface
                observations, giving continuous three-dimensional insight where in-situ floats cannot
                reach.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild className="gap-2">
                  <Link to="/dashboard">
                    Get started <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/analytics">See validation</Link>
                </Button>
              </div>
            </div>

            <div className="panel-surface p-5">
              <p className="label-caps">Depth levels</p>
              <ul className="mt-3 space-y-3">
                {["Surface", "100 m", "300 m", "500 m", "1000 m"].map((d, i) => (
                  <li key={d} className="flex items-center gap-3 text-sm">
                    <span className="size-2.5 rounded-full bg-accent" />
                    <span className="text-foreground">{d}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      level {i * 3 + 1}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Fifteen standard levels from 0 m to 1000 m, refreshed daily.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PILLARS.map(({ icon: Icon, title, detail }) => (
            <div key={title} className="panel-surface p-5">
              <Icon className="size-6 text-accent" />
              <p className="mt-3 font-display text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="panel-surface p-4">
            <p className="label-caps">Surface temperature field</p>
            <img
              src={heatmap}
              alt="Sea surface temperature heatmap over the North Indian Ocean"
              width={1200}
              height={912}
              className="mt-3 w-full rounded-lg border border-border object-cover"
            />
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="temp-scale h-2 flex-1 rounded-full" />
              <span>16 °C → 32 °C</span>
            </div>
          </div>

          <div className="panel-surface p-6">
            <p className="label-caps">How it works</p>
            <h2 className="mt-2 font-display text-2xl font-semibold">From Data to Depth</h2>
            <ol className="mt-5 space-y-4">
              {STEPS.map(({ icon: Icon, title, detail }, i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/25 text-accent">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-semibold">
                      {i + 1}. {title}
                    </p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="panel-surface p-6">
            <p className="label-caps">Our mission</p>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              A deeper ocean for a <span className="text-accent">brighter tomorrow</span>
            </h2>
            <p className="mt-4 text-sm text-muted-foreground">
              We combine openly available ocean data with representation learning to bridge the gap
              between what satellites see at the surface and what happens below it.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {MISSION.map(({ icon: Icon, title, detail }) => (
              <div key={title} className="panel-surface p-5">
                <Icon className="size-5 text-accent" />
                <p className="mt-2 font-display text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-surface grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-2xl font-semibold text-accent">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-border p-10 text-center">
          <img src={bg.url} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-background/70" />
          <div className="relative">
            <h2 className="font-display text-2xl font-semibold">Ready to explore the ocean beneath?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Turn surface observations into depth-resolved insight.
            </p>
            <Button asChild className="mt-5 gap-2">
              <Link to="/dashboard">
                Open the dashboard <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
          <Waves className="size-4 text-accent" />
          <span className="font-display font-semibold text-foreground">OceanEmbed</span>
          <span>Deeper insights. Cleaner oceans.</span>
          <span className="ml-auto">North Indian Ocean · 0.25° daily</span>
        </footer>
      </div>
    </AppShell>
  );
}
