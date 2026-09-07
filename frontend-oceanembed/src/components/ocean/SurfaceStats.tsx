import { Droplet, Thermometer, Waves, Wind } from "lucide-react";
import type { SurfaceState } from "@/lib/ocean-model";

export function SurfaceStats({ surface }: { surface: SurfaceState }) {
  const stats = [
    {
      icon: Thermometer,
      abbr: "SST",
      label: "Sea surface temperature",
      help: "How warm the top layer of the ocean is right now",
      value: surface.sst.toFixed(1),
      unit: "°C",
      tone: "text-warm",
    },
    {
      icon: Droplet,
      abbr: "SSS",
      label: "Sea surface salinity",
      help: "How salty the surface water is",
      value: surface.sss.toFixed(1),
      unit: "PSU",
      tone: "text-cool",
    },
    {
      icon: Wind,
      abbr: "Wind",
      label: "Surface wind speed",
      help: "Wind blowing over the ocean — it stirs and cools the water",
      value: (Math.hypot(surface.windU, surface.windV) * 3.6).toFixed(0),
      unit: "km/h",
      tone: "text-chart-5",
    },
    {
      icon: Waves,
      abbr: "Current",
      label: "Surface current speed",
      help: "How fast the surface water is moving",
      value: Math.hypot(surface.currentU, surface.currentV).toFixed(1),
      unit: "m/s",
      tone: "text-teal",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map(({ icon: Icon, abbr, label, help, value, unit, tone }) => (
        <div key={abbr} className="panel-surface flex items-center gap-3 px-4 py-3" title={help}>
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/60 ${tone}`}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="label-caps truncate">
              {abbr} <span className="normal-case tracking-normal">· {label}</span>
            </p>
            <p className="font-display text-2xl font-semibold leading-tight">
              {value}
              <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
            </p>
            <p className="truncate text-[0.65rem] text-muted-foreground">{help}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
