import { createFileRoute, Link } from "@tanstack/react-router";
import { Waves, Satellite, Brain, BarChart3, Mail, Globe } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — OceanEmbed" },
      {
        name: "description",
        content:
          "Learn about OceanEmbed, an AI-powered research project reconstructing subsurface ocean temperature across the North Indian Ocean.",
      },
      { property: "og:title", content: "About OceanEmbed" },
      {
        property: "og:description",
        content: "AI-powered subsurface ocean temperature reconstruction for the North Indian Ocean.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <Link to="/" className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Waves className="size-4" /> Back to home
        </Link>

        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          About <span className="text-accent">OceanEmbed</span>
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground">
          OceanEmbed is a research Proof-of-Concept that uses deep learning to reconstruct subsurface ocean
          temperature from daily satellite observations. Our goal is to help scientists, researchers, and
          decision-makers better understand the ocean state across the North Indian Ocean.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            icon={Satellite}
            title="Satellite Inputs"
            text="SST, SSS, SSH, surface currents, and winds are harmonized to a 0.25° daily grid."
          />
          <Card
            icon={Brain}
            title="AI Reconstruction"
            text="CNN, Vision Transformer, and attention-based embeddings learn the surface-to-depth relationship."
          />
          <Card
            icon={BarChart3}
            title="Validation"
            text="Outputs are compared against GLORYS reanalysis and independent ARGO observations."
          />
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-card/50 p-8">
          <h2 className="font-display text-2xl font-semibold">Research scope</h2>
          <ul className="mt-4 space-y-2 text-muted-foreground">
            <li>Region: North Indian Ocean (5°N–30°N, 45°E–105°E)</li>
            <li>Spatial resolution: 0.25° × 0.25°</li>
            <li>Temporal resolution: Daily</li>
            <li>Depth levels: 0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000 m</li>
          </ul>
        </div>

        <div className="mt-16 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Get in touch</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Questions, feedback, or collaboration ideas are welcome.
            </p>
          </div>
          <a
            href="mailto:contact@oceanembed.example"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Mail className="size-4" /> contact@oceanembed.example
          </a>
        </div>

        <p className="mt-16 text-xs text-muted-foreground">
          <Globe className="mb-0.5 inline size-3" /> OceanEmbed is a research Proof-of-Concept. No real
          operational forecast is issued.
        </p>
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Icon className="size-6 text-accent" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
