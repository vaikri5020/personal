import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { Fish, Rocket, Sparkles, Thermometer, Waves } from "lucide-react";
import { AppShell } from "@/components/ocean/TopNav";
import { Panel } from "@/components/ocean/Panel";
import { Button } from "@/components/ui/button";
import { ZONES } from "@/components/learn/zones";

const OceanScene = lazy(() => import("@/components/learn/OceanScene"));

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Ocean School for Kids — OceanEmbed" },
      {
        name: "description",
        content:
          "A playful 3D ocean classroom: dive through the sunlight, twilight and midnight zones, meet Argo floats and satellites, and learn how the sea gets colder with depth.",
      },
      { property: "og:title", content: "Ocean School for Kids — OceanEmbed" },
      {
        property: "og:description",
        content:
          "Spin a cute 3D ocean, meet friendly sea buddies and discover how scientists measure the deep sea.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LearnPage,
});

const HOW_IT_WORKS = [
  {
    icon: Rocket,
    title: "1. Satellites watch the top",
    body: "From space, satellites see how warm the sea skin is, how high the water sits and which way the wind and currents blow.",
  },
  {
    icon: Sparkles,
    title: "2. The computer finds clues",
    body: "A smart computer squeezes all those pictures into tiny number-clues called embeddings — like a summary of the ocean's mood.",
  },
  {
    icon: Thermometer,
    title: "3. It guesses the deep",
    body: "Using the clues, it draws the temperature all the way down — 0 m, 100 m, 1000 m — even where nobody has been today.",
  },
  {
    icon: Fish,
    title: "4. Robots check the answer",
    body: "Floating robots called Argo dive down and send real measurements back up, so we can see how close the guess was.",
  },
];

const QUIZ = [
  {
    q: "Does the ocean get warmer or colder as you go deeper?",
    options: ["Warmer", "Colder", "Stays the same"],
    answer: 1,
    why: "Sunlight only warms the top, so the deeper you go, the colder it gets — down to about 4 °C!",
  },
  {
    q: "Which robot dives down to measure temperature?",
    options: ["Argo float", "Satellite", "Submarine train"],
    answer: 0,
    why: "Argo floats sink, measure, and pop back up to send their data by satellite.",
  },
  {
    q: "What do we call a long stretch of super-hot sea water?",
    options: ["Sea fever", "Marine heatwave", "Ocean sunburn"],
    answer: 1,
    why: "A marine heatwave! It can hurt coral reefs and fish, and can make storms stronger.",
  },
];

function Quiz() {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const item = QUIZ[step]!;
  const done = step >= QUIZ.length;

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="text-5xl">{score === QUIZ.length ? "🏆" : "🐠"}</span>
        <p className="font-display text-2xl">
          {score} / {QUIZ.length} correct!
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {score === QUIZ.length
            ? "Amazing — you are an official Junior Ocean Scientist!"
            : "Great try! Read the fun facts again and give it another go."}
        </p>
        <Button
          onClick={() => {
            setStep(0);
            setScore(0);
            setPicked(null);
          }}
        >
          Play again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Question {step + 1} of {QUIZ.length}
      </p>
      <p className="font-display text-lg">{item.q}</p>
      <div className="grid gap-2">
        {item.options.map((o, i) => {
          const state =
            picked == null
              ? "idle"
              : i === item.answer
                ? "right"
                : i === picked
                  ? "wrong"
                  : "idle";
          return (
            <button
              key={o}
              type="button"
              disabled={picked != null}
              onClick={() => {
                setPicked(i);
                if (i === item.answer) setScore((s) => s + 1);
              }}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                state === "right"
                  ? "border-lime/60 bg-lime/20 text-foreground"
                  : state === "wrong"
                    ? "border-destructive/60 bg-destructive/20 text-foreground"
                    : "border-border bg-secondary/40 hover:bg-secondary/70"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {picked != null && (
        <div className="flex flex-col gap-3 rounded-xl bg-primary/15 p-3 text-sm">
          <p>{item.why}</p>
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              setPicked(null);
              setStep((s) => s + 1);
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function LearnPage() {
  const [zoneId, setZoneId] = useState("sunlight");
  const zone = ZONES.find((z) => z.id === zoneId) ?? ZONES[0]!;

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <div className="panel-surface flex flex-wrap items-center gap-3 px-5 py-4">
          <span className="text-3xl">🐢</span>
          <div>
            <h1 className="font-display text-2xl font-bold">Ocean School</h1>
            <p className="text-sm text-muted-foreground">
              Spin the ocean, tap a layer and meet the sea buddies who live there.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel
            title="Dive into the 3D ocean"
            subtitle="Drag to spin · scroll to zoom · tap a layer"
            bodyClassName="p-0"
          >
            <div className="h-[26rem] w-full overflow-hidden rounded-b-2xl">
              <ClientOnly
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Warming up the ocean…
                  </div>
                }
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Filling the tank with water 🌊
                    </div>
                  }
                >
                  <OceanScene activeZone={zoneId} onSelectZone={setZoneId} />
                </Suspense>
              </ClientOnly>
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel title="Layer explorer" subtitle="Pick a zone to learn about it">
              <div className="mb-3 flex flex-wrap gap-2">
                {ZONES.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setZoneId(z.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      z.id === zoneId
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {z.emoji} {z.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 rounded-xl bg-secondary/40 p-4">
                <p className="font-display text-xl">
                  {zone.emoji} {zone.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Depth {zone.from}–{zone.to} m · water is {zone.temp}
                </p>
                <p className="text-sm">{zone.fact}</p>
                <p className="text-sm text-accent">Say hi to {zone.buddy}!</p>
              </div>
            </Panel>

            <Panel title="Fun quiz" subtitle="Become a Junior Ocean Scientist">
              <Quiz />
            </Panel>
          </div>
        </div>

        <Panel title="How OceanEmbed works — the kid version" bodyClassName="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {HOW_IT_WORKS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col gap-2 rounded-xl bg-secondary/40 p-4">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/25 text-accent">
                  <Icon className="size-4" />
                </span>
                <p className="font-display text-base">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Words to remember" bodyClassName="p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Temperature profile 🌡️", "A line that shows how warm the water is at every depth."],
              ["Thermocline 🥞", "The layer where warm water on top meets cold water below."],
              ["Plankton 🦐", "Tiny drifting life — the lunchbox of the ocean."],
              ["Current 🌀", "A river inside the sea that moves water around the world."],
              ["Satellite 🛰️", "A robot in space that takes pictures of the ocean every day."],
              ["Marine heatwave 🔥", "When the sea stays much hotter than normal for many days."],
            ].map(([term, def]) => (
              <div key={term} className="rounded-xl border border-border bg-panel p-4">
                <p className="font-display text-base">{term}</p>
                <p className="mt-1 text-sm text-muted-foreground">{def}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex items-center gap-2 px-1 pb-6 text-xs text-muted-foreground">
          <Waves className="size-3.5" /> Built for curious students — no science degree required.
        </div>
      </div>
    </AppShell>
  );
}
