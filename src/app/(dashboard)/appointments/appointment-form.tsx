"use client";

import { useMemo, useState } from "react";
import { Clock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, formatPrice, formatSlotTime } from "@/lib/booking/format";
import { localDateInZone } from "@/lib/booking/timezone";
import type { PublicSlot } from "@/lib/booking/types";
import {
  useAvailabilitySlots,
  useCreateAppointment,
  useProfessionals,
  useServiceProfessionalsMap,
  useServices,
} from "@/hooks/use-appointments";

interface AppointmentFormProps {
  salonId: string;
  salonSlug: string;
  timezone: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ContactState {
  fullName: string;
  phone: string;
  email: string;
  notes: string;
}

const EMPTY_CONTACT: ContactState = { fullName: "", phone: "", email: "", notes: "" };

export function AppointmentForm({
  salonId,
  salonSlug,
  timezone,
  onSuccess,
  onCancel,
}: AppointmentFormProps): React.ReactElement {
  const today = localDateInZone(timezone);

  const [serviceId, setServiceId] = useState<string>("");
  const [professionalId, setProfessionalId] = useState<string>("any");
  const [date, setDate] = useState<string>(today);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [contact, setContact] = useState<ContactState>(EMPTY_CONTACT);

  const servicesQuery = useServices(salonId);
  const professionalsQuery = useProfessionals(salonId);
  const serviceProfMap = useServiceProfessionalsMap(salonId);
  const slotsQuery = useAvailabilitySlots(salonSlug, serviceId || null, professionalId, date);
  const createMutation = useCreateAppointment(salonId);

  const eligibleProfessionals = useMemo(() => {
    if (!serviceId || !professionalsQuery.data || !serviceProfMap.data) return [];
    const ids = new Set(serviceProfMap.data[serviceId] ?? []);
    return professionalsQuery.data.filter((p) => ids.has(p.id));
  }, [serviceId, professionalsQuery.data, serviceProfMap.data]);

  const selectedService = servicesQuery.data?.find((s) => s.id === serviceId);

  function handleServiceChange(id: string): void {
    setServiceId(id);
    setProfessionalId("any");
    setSelectedSlot(null);
  }

  function handleProfessionalChange(id: string): void {
    setProfessionalId(id);
    setSelectedSlot(null);
  }

  function handleDateChange(value: string): void {
    setDate(value);
    setSelectedSlot(null);
  }

  const canSubmit =
    Boolean(selectedSlot) &&
    contact.fullName.trim().length >= 2 &&
    contact.phone.trim().length >= 6;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!canSubmit || !selectedSlot) return;

    createMutation.mutate(
      {
        serviceId,
        professionalId: selectedSlot.professionalId,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
        customer: {
          fullName: contact.fullName,
          phone: contact.phone,
          email: contact.email || undefined,
          notes: contact.notes || undefined,
        },
      },
      {
        onSuccess: (result) => {
          if (result.ok) onSuccess();
        },
      },
    );
  }

  const mutationError =
    createMutation.data && !createMutation.data.ok ? createMutation.data.error : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Servicio */}
      <div className="space-y-2">
        <Label htmlFor="form-service">Servicio *</Label>
        <Select value={serviceId} onValueChange={handleServiceChange}>
          <SelectTrigger id="form-service">
            <SelectValue placeholder="Elige un servicio" />
          </SelectTrigger>
          <SelectContent>
            {(servicesQuery.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} — {formatDuration(s.duration_minutes)} ·{" "}
                {formatPrice(s.price_cents, s.currency)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Profesional */}
      <div className="space-y-2">
        <Label htmlFor="form-professional">Profesional</Label>
        <Select
          value={professionalId}
          onValueChange={handleProfessionalChange}
          disabled={!serviceId}
        >
          <SelectTrigger id="form-professional">
            <SelectValue placeholder="Cualquier profesional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Cualquier profesional</SelectItem>
            {eligibleProfessionals.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fecha */}
      <div className="space-y-2">
        <Label htmlFor="form-date">Fecha *</Label>
        <Input
          id="form-date"
          type="date"
          min={today}
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          disabled={!serviceId}
          className="w-full sm:w-56"
        />
      </div>

      {/* Huecos disponibles */}
      {serviceId && date && (
        <div className="space-y-2">
          <Label>Hora *</Label>
          {slotsQuery.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando huecos…
            </p>
          )}
          {slotsQuery.isError && (
            <p className="text-sm text-destructive">Error al cargar disponibilidad.</p>
          )}
          {slotsQuery.isSuccess && slotsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay huecos disponibles este día.
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
      )}

      {/* Resumen de la cita seleccionada */}
      {selectedSlot && selectedService && (
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          <span className="font-medium">{selectedService.name}</span>
          <span className="text-muted-foreground">
            {" · "}
            {formatSlotTime(selectedSlot.startsAt, timezone)}
            {" – "}
            {formatSlotTime(selectedSlot.endsAt, timezone)}
            {" · "}
            {formatPrice(selectedService.price_cents, selectedService.currency)}
          </span>
        </div>
      )}

      {/* Datos del cliente */}
      <div className="space-y-4 border-t pt-4">
        <p className="text-sm font-medium">Datos del cliente</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="form-name">Nombre y apellidos *</Label>
            <Input
              id="form-name"
              required
              value={contact.fullName}
              onChange={(e) => setContact((c) => ({ ...c, fullName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="form-phone">Teléfono *</Label>
            <Input
              id="form-phone"
              type="tel"
              required
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="form-email">Email (opcional)</Label>
          <Input
            id="form-email"
            type="email"
            value={contact.email}
            onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="form-notes">Notas (opcional)</Label>
          <Textarea
            id="form-notes"
            rows={2}
            value={contact.notes}
            onChange={(e) => setContact((c) => ({ ...c, notes: e.target.value }))}
          />
        </div>
      </div>

      {(mutationError ?? createMutation.isError) && (
        <p className="text-sm text-destructive">
          {mutationError ??
            (createMutation.error instanceof Error
              ? createMutation.error.message
              : "Error al crear la cita")}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={createMutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={!canSubmit || createMutation.isPending}>
          {createMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando…
            </>
          ) : (
            "Crear cita"
          )}
        </Button>
      </div>
    </form>
  );
}
