"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// EvolutionDatePicker — evolutivo "boca en fecha X" del odontograma
// ---------------------------------------------------------------------------

export interface EvolutionDatePickerProps {
  /** Fecha elegida (`YYYY-MM-DD`) o `null` = estado ACTUAL (por defecto). */
  value: string | null;
  onChange: (date: string | null) => void;
}

/**
 * Selector de fecha para reconstruir el odontograma vigente en una fecha
 * pasada ("boca en fecha X"). `value === null` significa "estado actual" —
 * el input se muestra vacío. El botón "Hoy" siempre vuelve a `null`,
 * independientemente del valor del input.
 */
export function EvolutionDatePicker({
  value,
  onChange,
}: EvolutionDatePickerProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <Label
        htmlFor="odontogram-evolution-date"
        className="text-xs text-muted-foreground font-medium shrink-0"
      >
        Boca en fecha:
      </Label>
      <Input
        id="odontogram-evolution-date"
        type="date"
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next.length > 0 ? next : null);
        }}
        className="h-7 w-auto px-2 text-xs"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-3 text-xs"
        onClick={() => onChange(null)}
      >
        Hoy
      </Button>
    </div>
  );
}
