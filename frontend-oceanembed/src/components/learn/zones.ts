export type Zone = {
  id: string;
  name: string;
  emoji: string;
  from: number;
  to: number;
  color: string;
  temp: string;
  fact: string;
  buddy: string;
};

export const ZONES: Zone[] = [
  {
    id: "sunlight",
    name: "Sunlight Zone",
    emoji: "☀️",
    from: 0,
    to: 200,
    color: "#38bdf8",
    temp: "about 28–30 °C",
    fact: "Sunlight reaches here, so tiny plants called plankton grow and feed almost everybody else.",
    buddy: "Fin the Clownfish",
  },
  {
    id: "twilight",
    name: "Twilight Zone",
    emoji: "🌒",
    from: 200,
    to: 1000,
    color: "#2563eb",
    temp: "about 10–18 °C",
    fact: "Light fades away fast. Many animals here glow in the dark to talk and to hide.",
    buddy: "Blinky the Lanternfish",
  },
  {
    id: "midnight",
    name: "Midnight Zone",
    emoji: "🌑",
    from: 1000,
    to: 4000,
    color: "#1e3a8a",
    temp: "about 4 °C",
    fact: "Pitch black and freezing cold. The water is heavy and squeezes everything here.",
    buddy: "Gulp the Anglerfish",
  },
];
