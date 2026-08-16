"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { CalendarRange, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FROM_PARAM,
  RANGE_PARAM,
  RANGE_PRESETS,
  TO_PARAM,
  type RangePreset,
} from "@/lib/metrics/range";
import { cn } from "@/lib/utils";

interface RangeSelectorProps {
  /** Preset efectivo resuelto en servidor (fuente de verdad = la URL). */
  preset: RangePreset;
  /** Extremos del periodo actual, para prefijar el rango personalizado. */
  from: string;
  to: string;
  /** Tope superior de los selectores de fecha: «hoy» local del salón. */
  maxDate: string;
}

/**
 * Selector de rango temporal de la analítica — control segmentado + rango
 * personalizado. Es el ÚNICO mando de la página: escribe el rango en la URL
 * (`?rango=…` o `?rango=personalizado&desde=…&hasta=…`) y deja que el Server
 * Component vuelva a resolver el periodo y re-consulte TODOS los KPIs y gráficas.
 * Así el rango gobierna la vista entera desde un solo sitio, y el enlace es
 * compartible/marcable (el estado vive en la URL, no en el cliente).
 *
 * Navegación con `useTransition` para no bloquear la UI mientras el servidor
 * recalcula: el preset pulsado se marca de forma OPTIMISTA y el control muestra
 * un estado ocupado (`aria-busy`) hasta que llega el nuevo árbol.
 */
export function RangeSelector({
  preset,
  from,
  to,
  maxDate,
}: RangeSelectorProps): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fieldId = useId();

  // Selección optimista: se adelanta a la respuesta del servidor y se reconcilia
  // con la verdad de la URL (`preset`) cuando la navegación termina.
  const [selected, setSelected] = useState<RangePreset>(preset);
  const [customOpen, setCustomOpen] = useState(preset === "personalizado");
  const [desde, setDesde] = useState(from);
  const [hasta, setHasta] = useState(to);

  useEffect(() => {
    setSelected(preset);
    if (preset === "personalizado") setCustomOpen(true);
  }, [preset]);

  // Tras cada navegación, reflejar el periodo resuelto en los campos del rango
  // personalizado (p. ej. al pulsar «30 días» se prefijan esas dos fechas).
  useEffect(() => {
    setDesde(from);
    setHasta(to);
  }, [from, to]);

  function navigate(params: URLSearchParams): void {
    startTransition(() => {
      router.push(`/analitica?${params.toString()}`, { scroll: false });
    });
  }

  function handlePreset(value: RangePreset): void {
    if (value === "personalizado") {
      setSelected("personalizado");
      setCustomOpen((open) => !open);
      return;
    }
    setSelected(value);
    setCustomOpen(false);
    navigate(new URLSearchParams({ [RANGE_PARAM]: value }));
  }

  const customInvalid = !desde || !hasta || desde > hasta;

  function handleCustomSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (customInvalid) return;
    navigate(
      new URLSearchParams({
        [RANGE_PARAM]: "personalizado",
        [FROM_PARAM]: desde,
        [TO_PARAM]: hasta,
      }),
    );
  }

  return (
    <div
      className="w-full"
      aria-busy={isPending}
      data-pending={isPending ? "" : undefined}
    >
      <div
        role="group"
        aria-label="Rango de fechas"
        className={cn(
          "inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-secondary/50 p-1 transition-opacity",
          isPending && "opacity-70",
        )}
      >
        {RANGE_PRESETS.map(({ value, label }) => {
          const active = selected === value;
          const isCustom = value === "personalizado";
          return (
            <button
              key={value}
              type="button"
              onClick={() => handlePreset(value)}
              aria-pressed={active}
              aria-expanded={isCustom ? customOpen : undefined}
              aria-controls={isCustom ? `${fieldId}-custom` : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-apple-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-secondary",
                active
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              {isCustom && <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />}
              <span className="whitespace-nowrap">{label}</span>
            </button>
          );
        })}
        {isPending && (
          <Loader2
            className="ml-1 mr-1 h-4 w-4 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      {customOpen && (
        <form
          id={`${fieldId}-custom`}
          onSubmit={handleCustomSubmit}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-3 shadow-xs animate-fade-up"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-desde`}
              className="text-xs font-medium text-muted-foreground"
            >
              Desde
            </label>
            <Input
              id={`${fieldId}-desde`}
              type="date"
              value={desde}
              max={hasta || maxDate}
              onChange={(event) => setDesde(event.target.value)}
              className="h-9 w-[9.5rem]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-hasta`}
              className="text-xs font-medium text-muted-foreground"
            >
              Hasta
            </label>
            <Input
              id={`${fieldId}-hasta`}
              type="date"
              value={hasta}
              min={desde || undefined}
              max={maxDate}
              onChange={(event) => setHasta(event.target.value)}
              className="h-9 w-[9.5rem]"
            />
          </div>
          <Button type="submit" size="sm" disabled={customInvalid || isPending}>
            Aplicar
          </Button>
          {customInvalid && (
            <p className="w-full text-xs text-destructive" role="alert">
              La fecha «desde» debe ser anterior o igual a «hasta».
            </p>
          )}
        </form>
      )}
    </div>
  );
}
