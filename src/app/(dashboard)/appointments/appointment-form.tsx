"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { DaySlots, DaySlotsSkeleton } from "@/components/booking/day-slots";
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
  useAvailabilityDaySlots,
  useCreateAppointment,
  useProfessionals,
  useServiceProfessionalsMap,
  useServices,
} from "@/hooks/use-appointments";
import { useCustomerSearch } from "@/hooks/use-customers";
import type { Customer } from "@/types/database";

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

  // Buscador de cliente existente (por nombre o teléfono). Si se selecciona uno,
  // la cita se crea sobre ese cliente; si no, se crea/reutiliza por los datos manuales.
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const customerSearch = useCustomerSearch(salonId, debouncedSearch);

  function handlePickCustomer(c: Customer): void {
    setSelectedCustomer(c);
    setContact((prev) => ({
      ...prev,
      fullName: c.full_name,
      phone: c.phone ?? "",
      email: c.email ?? "",
    }));
    setSearch("");
  }

  function clearSelectedCustomer(): void {
    setSelectedCustomer(null);
    setContact((prev) => ({ ...prev, fullName: "", phone: "", email: "" }));
  }

  const servicesQuery = useServices(salonId);
  const professionalsQuery = useProfessionals(salonId);
  const serviceProfMap = useServiceProfessionalsMap(salonId);
  const slotsQuery = useAvailabilityDaySlots(
    salonSlug,
    serviceId || null,
    professionalId,
    date,
  );
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
    (selectedCustomer !== null ||
      (contact.fullName.trim().length >= 2 && contact.phone.trim().length >= 6));

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!canSubmit || !selectedSlot) return;

    createMutation.mutate(
      {
        serviceId,
        professionalId: selectedSlot.professionalId,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
        customerId: selectedCustomer?.id,
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

      {/* Huecos: MISMA rejilla que la reserva pública (libres + ocupados/pasados
          deshabilitados). Solo las celdas libres son clicables, así que el panel sigue
          reservando únicamente huecos disponibles. */}
      {serviceId && date && (
        <div className="space-y-2">
          <Label>Hora *</Label>
          {slotsQuery.isLoading && <DaySlotsSkeleton />}
          {slotsQuery.isError && (
            <p className="text-sm text-destructive">Error al cargar disponibilidad.</p>
          )}
          {slotsQuery.isSuccess && (
            <DaySlots
              slots={slotsQuery.data}
              timeZone={timezone}
              selected={selectedSlot}
              anyProfessional={professionalId === "any"}
              onSelect={(slot) => setSelectedSlot(slot)}
            />
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

      {/* Cliente: buscar uno existente (por nombre o teléfono) o crear uno nuevo */}
      <div className="space-y-4 border-t pt-4">
        <p className="text-sm font-medium">Cliente *</p>

        {selectedCustomer ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedCustomer.full_name}</p>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {selectedCustomer.phone ?? selectedCustomer.email ?? "Sin contacto"}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearSelectedCustomer}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cambiar
            </Button>
          </div>
        ) : (
          <>
            {/* Buscador de cliente existente */}
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-9"
                placeholder="Buscar cliente por nombre o teléfono…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar cliente por nombre o teléfono"
              />
            </div>

            {search.trim().length >= 2 && (
              <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
                {customerSearch.isFetching && !customerSearch.data ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">Buscando…</p>
                ) : (customerSearch.data ?? []).length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    Sin coincidencias. Puedes crear un cliente nuevo abajo.
                  </p>
                ) : (
                  (customerSearch.data ?? []).slice(0, 20).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                      onClick={() => handlePickCustomer(c)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground tabular-nums">
                          {c.phone ?? c.email ?? ""}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* …o crear un cliente nuevo */}
            <p className="pt-1 text-xs text-muted-foreground">…o crea un cliente nuevo:</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="form-name">Nombre y apellidos</Label>
                <Input
                  id="form-name"
                  value={contact.fullName}
                  onChange={(e) => setContact((c) => ({ ...c, fullName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="form-phone">Teléfono</Label>
                <Input
                  id="form-phone"
                  type="tel"
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
          </>
        )}

        {/* Notas de la cita (siempre) */}
        <div className="space-y-2">
          <Label htmlFor="form-notes">Notas de la cita (opcional)</Label>
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
