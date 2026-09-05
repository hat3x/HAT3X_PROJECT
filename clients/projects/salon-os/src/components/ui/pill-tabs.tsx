// src/components/ui/pill-tabs.tsx
"use client";

import { cn } from "@/lib/utils";

export interface PillTab {
  id: string;
  label: string;
}

export interface PillTabsProps {
  tabs: readonly PillTab[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Barra de pestañas tipo "pill" (botones redondeados). Mismo patrón visual que el
 * conmutador día/semana/mes de la agenda. Conmuta subsecciones sin cambiar de ruta.
 */
export function PillTabs({
  tabs,
  active,
  onChange,
  ariaLabel,
  className,
}: PillTabsProps): React.ReactElement {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ease-apple-out",
            active === tab.id
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
