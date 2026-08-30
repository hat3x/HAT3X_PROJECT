"use client";

import { useState } from "react";
import { CalendarPlus, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateSalonOpeningException,
  useDeleteSalonOpeningException,
  useSalonOpeningExceptions,
} from "@/hooks/use-schedules";
import { cn } from "@/lib/utils";

/**
 * Excepciones del horario de la clínica: abrir un turno suelto, o cerrar un día.
 *
 * El caso que la motiva: Nicolás pasa consulta un martes por la tarde, pero
 * solo ese martes. Sin esta pantalla, la única forma de conseguirlo era abrir
 * TODOS los martes en el horario semanal — o pedir que alguien lo metiera por
 * API, que es lo que hubo que hacer la primera vez.
 *
 * La pantalla insiste en una cosa: **un turno extra se SUMA** al horario de
 * siempre. Sin decirlo, es razonable esperar que lo sustituya, y entonces
 * alguien creería que ha cerrado la mañana sin querer.
 */

export interface SalonExceptionsEditorProps {
  salonId: string;
  /** Fecha local de hoy (`YYYY-MM-DD`): no se listan excepciones pasadas. */
  today: string;
}

function horaCorta(t: string | null): string {
  return t === null ? "" : t.slice(0, 5);
}

export function SalonExceptionsEditor({
  salonId,
  today,
}: SalonExceptionsEditorProps): React.ReactElement {
  const { data, isPending, isError } = useSalonOpeningExceptions(salonId, today);
  const crear = useCreateSalonOpeningException(salonId);
  const borrar = useDeleteSalonOpeningException(salonId);

  const [fecha, setFecha] = useState("");
  const [cierra, setCierra] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function anadir(): void {
    if (fecha === "") {
      setError("Elige la fecha.");
      return;
    }
    setError(null);
    crear.mutate(
      {
        exception_date: fecha,
        is_open: !cierra,
        // Un cierre NO lleva horas: la base lo rechaza, y guardarlo dejaría al
        // motor adivinando qué se quiso decir.
        start_time: cierra ? null : desde || null,
        end_time: cierra ? null : hasta || null,
        reason: motivo.trim() || null,
      },
      {
        onSuccess: () => {
          setFecha("");
          setDesde("");
          setHasta("");
          setMotivo("");
          setCierra(false);
        },
        onError: (e: Error) => setError(e.message),
      },
    );
  }

  const lista = data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Para días sueltos: abrir un turno extra —una tarde concreta— o cerrar por vacaciones o
        festivo. <strong>El turno extra se suma</strong> al horario de siempre; no lo sustituye.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label htmlFor="exc-fecha" className="text-xs">
            Fecha
          </Label>
          <Input
            id="exc-fecha"
            type="date"
            min={today}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-40"
          />
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            id="exc-cierra"
            type="checkbox"
            checked={cierra}
            onChange={(e) => setCierra(e.target.checked)}
            className="h-4 w-4"
          />
          Cerrar ese día
        </label>

        {!cierra && (
          <>
            <div className="space-y-1">
              <Label htmlFor="exc-desde" className="text-xs">
                Desde
              </Label>
              <Input
                id="exc-desde"
                type="time"
                step={60}
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exc-hasta" className="text-xs">
                Hasta
              </Label>
              <Input
                id="exc-hasta"
                type="time"
                step={60}
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-28"
              />
            </div>
          </>
        )}

        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor="exc-motivo" className="text-xs">
            Motivo (opcional)
          </Label>
          <Input
            id="exc-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Consulta de tarde, festivo…"
          />
        </div>

        <Button type="button" onClick={anadir} disabled={crear.isPending}>
          {crear.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Añadir
        </Button>
      </div>

      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}

      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar las excepciones.</p>
      ) : lista.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No hay excepciones próximas. La clínica abre según su horario semanal.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">
                  {new Date(`${e.exception_date}T12:00:00Z`).toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                <p
                  className={cn(
                    "text-sm",
                    e.is_open ? "text-foreground" : "text-destructive",
                  )}
                >
                  {e.is_open
                    ? `Abre además de ${horaCorta(e.start_time)} a ${horaCorta(e.end_time)}`
                    : "Cerrado todo el día"}
                  {e.reason === null ? "" : ` · ${e.reason}`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Quitar la excepción del ${e.exception_date}`}
                onClick={() => borrar.mutate(e.id, {})}
              >
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
