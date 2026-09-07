import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OceanCanvas } from "../components/OceanCanvas";
import { OceanHUD } from "../components/OceanHUD";
import { oceanState } from "../lib/ocean-state";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Descent — A Scroll-Driven Deep Sea Dive" },
      {
        name: "description",
        content:
          "Pilot a submarine from the sunlit surface to the abyss. Scroll to descend 2,000 meters past fish schools, jellyfish, anglerfish, and coral reefs.",
      },
      { property: "og:title", content: "Descent — A Scroll-Driven Deep Sea Dive" },
      {
        property: "og:description",
        content:
          "Scroll to dive a submarine 2,000 meters through the ocean's sunlight, twilight, and midnight zones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [inspect, setInspect] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      oceanState.progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <OceanCanvas inspect={inspect} onInspectChange={setInspect} />
      <OceanHUD />
      {inspect && (
        <div className="fixed left-1/2 top-5 z-40 -translate-x-1/2">
          <button
            onClick={() => setInspect(false)}
            className="rounded-full border border-cyan-400/50 bg-black/60 px-5 py-2 text-xs font-bold uppercase tracking-widest text-cyan-200 backdrop-blur-md transition-all hover:bg-cyan-900/60"
          >
            ✕ Exit submarine inspect
          </button>
        </div>
      )}
      {/* scroll runway — the page height drives the dive */}
      <div style={{ height: "1000vh" }} aria-hidden />
    </>
  );
}
