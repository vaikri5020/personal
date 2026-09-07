import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelProps = {
  title: string;
  subtitle?: string;
  info?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function Panel({
  title,
  subtitle,
  info,
  action,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  return (
    <section className={cn("panel-surface flex flex-col", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="label-caps text-foreground/90">{title}</h2>
          {subtitle ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {info ? (
            <span title={info} className="text-muted-foreground/70">
              <Info className="size-4" />
            </span>
          ) : null}
        </div>
      </header>
      <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
