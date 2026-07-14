"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Selector de tema — control segmentado accesible (claro · sistema · oscuro).
 *
 * Semántica ARIA de grupo de radios con *roving tabindex* y navegación por
 * flechas/Home/End, tal como espera la especificación WAI-ARIA para
 * `radiogroup`. El foco es visible (anillo de marca) y cada opción anuncia
 * su etiqueta. La opción activa se resalta con superficie elevada.
 *
 * Un guard de montaje evita desajustes de hidratación: en servidor el estado
 * es "system" y `aria-checked` sólo se refleja tras montar en el cliente.
 */

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "dark", label: "Oscuro", icon: Moon },
];

/** Índice usado como tabbable por defecto antes de montar ("system"). */
const DEFAULT_INDEX = 1;

const NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const currentIndex = OPTIONS.findIndex((option) => option.value === theme);

  function focusOption(index: number): void {
    const buttons = groupRef.current?.querySelectorAll("button");
    buttons?.[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!NAV_KEYS.includes(event.key)) return;
    event.preventDefault();

    const base = currentIndex < 0 ? DEFAULT_INDEX : currentIndex;
    let next = base;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (base + 1) % OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (base - 1 + OPTIONS.length) % OPTIONS.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = OPTIONS.length - 1;
    }

    const option = OPTIONS[next];
    if (!option) return;
    setTheme(option.value);
    focusOption(next);
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Tema de la interfaz"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-muted/40 p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }, index) => {
        const active = mounted && theme === value;
        // Roving tabindex: sólo la opción activa entra en el orden de
        // tabulación (antes de montar, la de "system" por defecto).
        const tabbable = mounted ? active : index === DEFAULT_INDEX;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Tema ${label.toLowerCase()}`}
            title={`Tema ${label.toLowerCase()}`}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-200 ease-apple-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
