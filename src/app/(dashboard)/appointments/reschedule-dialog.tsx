"use client";

import { useMemo, useState } from "react";
import { Clock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatLongDate, formatSlotTime } from "@/lib/booking/format";
import { localDateInZone } from "@/lib/booking/timezone";
import type { PublicSlot } from "@/lib/booking/types";
import {
  useAvailabilitySlots,
  useProfessionals,
  useRescheduleAppointment,
  useServiceProfessionalsMap,
} from "@/hooks/use-appointments";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";

interface RescheduleDialogProps {
  open: boolean;
  appointment: AppointmentWithDetails;
  salonId: string;
  salonSlug: string;
  timezone: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function RescheduleDialog({
  open,
  appointment,
  salonId,
  salonSlug,
  timezone,
  onSuccess,
  onClose,
}: RescheduleDialogProps): React.ReactElement {
  const today = localDateInZone(timezone);
  const initialDate = localDateInZone(timezone, new Date(appointment.starts_at));

  const [date, setDate] = useState<string>(initialDate);
  const [professionalId, setProfessionalId] = useState<string>(
    appointment.professional_id,
  );
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);

  const professionalsQuery = useProfessionals(salonId);
  const serviceProfMap = useServiceProfessionalsMap(salonId);
  const slotsQuery = useAvailabilitySlots(
    salonSlug,
    appointment.service_id,
    professionalId,
    date,
  );
  const rescheduleMutation = useRescheduleAppointment(salonId);

  const eligibleProfessionals = useMemo(() => {
    if (!professionalsQuery.data || !serviceProfMap.data) return [];
    const ids = new Set(serviceProfMap.data[appointment.service_id] ?? []);
    return professionalsQuery.data.filter((p) => ids.has(p.id));
  }, [appointment.service_id, professionalsQuery.data, serviceProfMap.data]);

  function handleDialogOpenChange(isOpen: boolean): void {
    if (!isOpen) onClose();
  }

  function handleDateChange(value: string): void {
    setDate(value);
    setSelectedSlot(null);
  }

  function handleProfessionalChange(value: string): void {
    setProfessionalId(value);
    setSelectedSlot(null);
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!selectedSlot) return;

    rescheduleMutation.mutate(
      {
        appointmentId: appointment.id,
        professionalId: selectedSlot.professionalId,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
      },
      {
        onSuccess: (result) => {
          if (result.ok) {
            onSuccess();
          }
        },
      },
    );
  }

  const mutationError =
    rescheduleMutation.data && !rescheduleMutation.data.ok
      ? rescheduleMutation.data.error
      : null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reprogramar cita</DialogTitle>
          <DialogDescription>
            {appointment.service?.name ?? "Servicio"} ·{" "}
            {appointment.customer?.full_name ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Profesional (solo si el servicio lo prestan varios) */}
          {eligibleProfessionals.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="reschedule-professional">Profesional</Label>
              <Select value={professionalId} onValueChange={handleProfessionalChange}>
                <SelectTrigger id="reschedule-professional">
                  <SelectValue placeholder="Elige profesional" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleProfessionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Fecha */}
          <div className="space-y-2">
            <Label htmlFor="reschedule-date">Fecha *</Label>
            <Input
              id="reschedule-date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full sm:w-56"
            />
            <p className="text-sm capitalize text-muted-foreground">
              {formatLongDate(date, timezone)}
            </p>
          </div>

          {/* Huecos disponibles */}
          <div className="space-y-2">
            <Label>Nueva hora *</Label>
            {slotsQuery.isLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando huecos…
              </p>
            )}
            {slotsQuery.isError && (
              <p className="text-sm text-destructive">
                Error al cargar disponibilidad.
              </p>
            )}
            {slotsQuery.isSuccess && slotsQuery.data.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay huecos disponibles este día. Prueba otra fecha.
              </p>
            )}
            {slotsQuery.isSuccess && slotsQuery.data.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {slotsQuery.data.map((slot) => {
                  const isSelected = selectedSlot?.startsAt === slot.startsAt;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={
                        "flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors " +
                        (isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:border-primary hover:bg-accent")
                      }
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {formatSlotTime(slot.startsAt, timezone)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resumen del hueco seleccionado */}
          {selectedSlot && (
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
              <p className="font-medium">Nueva hora seleccionada</p>
              <p className="capitalize text-muted-foreground">
                {formatLongDate(date, timezone)}
                {" · "}
                {formatSlotTime(selectedSlot.startsAt, timezone)}
                {" – "}
                {formatSlotTime(selectedSlot.endsAt, timezone)}
              </p>
            </div>
          )}

          {(mutationError ?? rescheduleMutation.isError) && (
            <p className="text-sm text-destructive">
              {mutationError ??
                (rescheduleMutation.error instanceof Error
                  ? rescheduleMutation.error.message
                  : "Error al reprogramar la cita")}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={rescheduleMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!selectedSlot || rescheduleMutation.isPending}
            >
              {rescheduleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reprogramando…
                </>
              ) : (
                "Confirmar cambio"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
