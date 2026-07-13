"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSaveWeeklySchedule, useWeeklySchedule } from "@/hooks/use-schedules";
import { WEEKDAY_LABELS } from "@/lib/booking/format";
import {
  WEEKDAY_ORDER,
  weeklyScheduleSchema,
  type WeeklyScheduleInput,
} from "@/lib/validations/schedule";

interface ScheduleEditorProps {
  salonId: string;
  professionalId: string;
}

/** Tramo en edición; `key` es estable para React (id de fila o generado). */
interface DraftSlot {
  key: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

/** `HH:MM:SS` (o `HH:MM`) → `HH:MM` para los inputs de tipo `time`. */
function toTimeInput(value: string): string {
  return value.slice(0, 5);
}

/**
 * Editor del horario semanal de un profesional.
 *
 * Muestra los siete días (lunes primero) y, en cada uno, cero o más tramos.
 * Varios tramos en un mismo día cubren el caso de turno de mañana y tarde; un
 * día sin tramos equivale a jornada cerrada. Al guardar se reemplaza todo el
 * horario del profesional de una sola vez.
 *
 * La validación de confianza vive en el Server Action, pero aquí se ejecuta el
 * mismo esquema Zod antes de enviar para dar feedback inmediato (incluida la
 * regla `end_time > start_time` de cada tramo).
 */
export function ScheduleEditor({
  salonId,
  professionalId,
}: ScheduleEditorProps): React.ReactElement {
  const { data, isPending, isError, error } = useWeeklySchedule(
    salonId,
    professionalId,
  );
  const saveMutation = useSaveWeeklySchedule(salonId, professionalId);

  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const keyCounter = useRef(0);

  function nextKey(): string {
    keyCounter.current += 1;
    return `new-${keyCounter.current}`;
  }

  // Sincroniza el borrador local con el horario del servidor cuando llega o
  // cambia (incluido el refetch posterior a guardar, que refleja lo guardado).
  // No se toca aquí `saved`/`formError`: el mensaje de éxito debe sobrevivir al
  // refetch que dispara el propio guardado; se limpian al editar (`markDirty`).
  useEffect(() => {
    if (data === undefined) {
      return;
    }
    setSlots(
      data.map((row) => ({
        key: row.id,
        weekday: row.weekday,
        start_time: toTimeInput(row.start_time),
        end_time: toTimeInput(row.end_time),
      })),
    );
  }, [data]);

  function markDirty(): void {
    setSaved(false);
    setFormError(null);
  }

  function addSlot(weekday: number): void {
    markDirty();
    setSlots((prev) => [
      ...prev,
      { key: nextKey(), weekday, start_time: "09:00", end_time: "14:00" },
    ]);
  }

  function removeSlot(key: string): void {
    markDirty();
    setSlots((prev) => prev.filter((slot) => slot.key !== key));
  }

  function updateSlot(
    key: string,
    field: "start_time" | "end_time",
    value: string,
  ): void {
    markDirty();
    setSlots((prev) =>
      prev.map((slot) =>
        slot.key === key ? { ...slot, [field]: value } : slot,
      ),
    );
  }

  function handleSave(): void {
    const input: WeeklyScheduleInput = {
      professional_id: professionalId,
      slots: slots.map((slot) => ({
        weekday: slot.weekday,
        start_time: slot.start_time,
        end_time: slot.end_time,
      })),
    };

    const parsed = weeklyScheduleSchema.safeParse(input);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos no válidos");
      return;
    }

    setFormError(null);
    saveMutation.mutate(input, {
      onSuccess: () => setSaved(true),
    });
  }

  if (isPending) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Error al cargar el horario"}
      </p>
    );
  }

  const mutationError =
    saveMutation.error instanceof Error ? saveMutation.error.message : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        {WEEKDAY_ORDER.map((weekday) => {
          const daySlots = slots.filter((slot) => slot.weekday === weekday);
          return (
            <div
              key={weekday}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-[8rem_1fr] sm:items-start sm:gap-4"
            >
              <div className="flex items-center justify-between sm:block">
                <span className="text-sm font-medium">
                  {WEEKDAY_LABELS[weekday]}
                </span>
                {daySlots.length === 0 ? (
                  <span className="text-xs text-muted-foreground sm:mt-1 sm:block">
                    Cerrado
                  </span>
                ) : null}
              </div>

              <div className="grid gap-2">
                {daySlots.map((slot) => (
                  <div key={slot.key} className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${WEEKDAY_LABELS[weekday]}: hora de inicio`}
                      value={slot.start_time}
                      onChange={(e) =>
                        updateSlot(slot.key, "start_time", e.target.value)
                      }
                      className="w-[7.5rem]"
                    />
                    <span className="text-muted-foreground" aria-hidden="true">
                      –
                    </span>
                    <Input
                      type="time"
                      aria-label={`${WEEKDAY_LABELS[weekday]}: hora de fin`}
                      value={slot.end_time}
                      onChange={(e) =>
                        updateSlot(slot.key, "end_time", e.target.value)
                      }
                      className="w-[7.5rem]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar tramo de ${WEEKDAY_LABELS[weekday]}`}
                      onClick={() => removeSlot(slot.key)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}

                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addSlot(weekday)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {daySlots.length === 0 ? "Añadir horario" : "Añadir tramo"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {formError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : mutationError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {mutationError}
        </p>
      ) : saved ? (
        <p role="status" className="text-sm text-emerald-600">
          Horario guardado.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Añade tantos tramos como necesites; deja un día sin tramos para
          marcarlo como cerrado.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? "Guardando…" : "Guardar horario"}
        </Button>
      </div>
    </div>
  );
}
