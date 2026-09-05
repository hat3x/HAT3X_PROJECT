"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PALETTES, useTheme, type Palette, type Theme } from "@/components/providers/theme-provider";

/**
 * Apariencia — selector de tema (claro/oscuro/sistema) y paleta de ambiente.
 *
 * Vive en Ajustes (materia de configuración). La preferencia se guarda en ESTE
 * dispositivo (localStorage, igual que el tema); el `ThemeProvider` la aplica al
 * instante y `ThemeScript` evita el parpadeo. La marca del salón (white-label)
 * sigue tiñendo el acento; la paleta solo cambia el ambiente (aurora + tinte).
 */

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "dark", label: "Oscuro", icon: Moon },
];

const PALETTE_META: Record<Palette, { label: string; from: string; to: string }> = {
  laton: { label: "Latón", from: "#b4884d", to: "#e8cf9f" },
  zafiro: { label: "Zafiro", from: "#1f6fe0", to: "#14b5c9" },
  oceano: { label: "Océano", from: "#0e7490", to: "#1d63af" },
  nebulosa: { label: "Nebulosa", from: "#6d5ce6", to: "#bf5af2" },
  grafito: { label: "Grafito", from: "#3a4a63", to: "#788496" },
  crepusculo: { label: "Crepúsculo", from: "#d1495b", to: "#ff9f0a" },
};

export function AparienciaView(): React.ReactElement {
  const { theme, setTheme, palette, setPalette } = useTheme();
  // Evita desajuste de hidratación: el estado marcado solo tras montar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Tema */}
      <Card className="p-5">
        <h3 className="text-base font-semibold tracking-tight">Tema</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Claro, oscuro o según tu sistema operativo.
        </p>
        <div role="radiogroup" aria-label="Tema" className="mt-4 grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = mounted && theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-all duration-200 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary/40 bg-accent text-accent-foreground shadow-xs"
                    : "border-border/70 text-muted-foreground hover:border-primary/30 hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Paleta de ambiente */}
      <Card className="p-5">
        <h3 className="text-base font-semibold tracking-tight">Paleta de ambiente</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tiñe el fondo aurora y los detalles de la interfaz. El color de marca de
          tu salón se mantiene.
        </p>
        <div
          role="radiogroup"
          aria-label="Paleta de ambiente"
          className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {PALETTES.map((value) => {
            const meta = PALETTE_META[value];
            const active = mounted && palette === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPalette(value)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-medium transition-all duration-200 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary/40 bg-accent text-accent-foreground shadow-xs"
                    : "border-border/70 text-muted-foreground hover:border-primary/30 hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-xs ring-1 ring-black/10"
                  style={{ backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
                >
                  {active ? <Check className="h-4 w-4 text-white drop-shadow" aria-hidden="true" /> : null}
                </span>
                <span className="truncate">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
