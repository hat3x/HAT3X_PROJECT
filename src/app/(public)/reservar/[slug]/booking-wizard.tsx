"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarCheck, Check, ChevronLeft, Clock, User } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDuration,
  formatLongDate,
  formatPrice,
  formatSlotTime,
} from "@/lib/booking/format";
import { localDateInZone } from "@/lib/booking/timezone";
import type {
  AvailabilityResponse,
  BookingBootstrap,
  BookingConfirmation,
  PublicSlot,
} from "@/lib/booking/types";

type Step = "service" | "professional" | "datetime" | "contact" | "done";

const STEP_ORDER: Step[] = ["service", "professional", "datetime", "contact"];

const STEP_LABELS: Record<Step, string> = {
  service: "Servicio",
  professional: "Profesional",
  datetime: "Fecha y hora",
  contact: "Tus datos",
  done: "Confirmada",
};

interface ContactForm {
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  marketingConsent: boolean;
}

const EMPTY_CONTACT: ContactForm = {
  fullName: "",
  phone: "",
  email: "",
  notes: "",
  marketingConsent: false,
};

/** Agrupa huecos por franja del día en la zona del salón. */
function groupSlots(
  slots: PublicSlot[],
  timeZone: string,
): Array<{ label: string; slots: PublicSlot[] }> {
  const groups: Record<string, PublicSlot[]> = {
    Mañana: [],
    Tarde: [],
    Noche: [],
  };

  for (const slot of slots) {
    const hour = Number(formatSlotTime(slot.startsAt, timeZone).slice(0, 2));
    const key = hour < 13 ? "Mañana" : hour < 19 ? "Tarde" : "Noche";
    groups[key]?.push(slot);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, slots: list }));
}

export function BookingWizard({
  slug,
  bootstrap,
}: {
  slug: string;
  bootstrap: BookingBootstrap;
}): React.ReactElement {
  const { salon, services, professionals, serviceProfessionals } = bootstrap;
  const timeZone = salon.timezone;
  const today = localDateInZone(timeZone);

  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string>("any");
  const [date, setDate] = useState<string>(today);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [contact, setContact] = useState<ContactForm>(EMPTY_CONTACT);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Profesionales que prestan el servicio elegido.
  const eligibleProfessionals = useMemo(() => {
    if (!serviceId) return [];
    const ids = new Set(serviceProfessionals[serviceId] ?? []);
    return professionals.filter((p) => ids.has(p.id));
  }, [serviceId, serviceProfessionals, professionals]);

  const availabilityQuery = useQuery({
    queryKey: ["public-availability", slug, serviceId, professionalId, date],
    enabled: step === "datetime" && Boolean(serviceId) && Boolean(date),
    queryFn: async (): Promise<PublicSlot[]> => {
      const query = new URLSearchParams({ serviceId: serviceId ?? "", date });
      if (professionalId !== "any") query.set("professionalId", professionalId);

      const res = await fetch(
        `/api/public/booking/${slug}/availability?${query.toString()}`,
      );
      const json = (await res.json()) as AvailabilityResponse | { error: string };
      if (!res.ok) {
        throw new Error("error" in json ? json.error : "Error de disponibilidad.");
      }
      return (json as AvailabilityResponse).slots;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (): Promise<BookingConfirmation> => {
      if (!serviceId || !slot) throw new Error("Falta información de la reserva.");
      const res = await fetch(`/api/public/booking/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          professionalId,
          startsAt: slot.startsAt,
          customer: {
            fullName: contact.fullName,
            phone: contact.phone,
            email: contact.email || undefined,
            notes: contact.notes || undefined,
            marketingConsent: contact.marketingConsent,
          },
        }),
      });
      const json = (await res.json()) as BookingConfirmation | { error: string };
      if (!res.ok) {
        throw new Error("error" in json ? json.error : "No se pudo reservar.");
      }
      return json as BookingConfirmation;
    },
    onSuccess: () => setStep("done"),
  });

  // --- Navegación ------------------------------------------------------------
  function chooseService(id: string): void {
    setServiceId(id);
    setProfessionalId("any");
    setSlot(null);
    setStep("professional");
  }

  function chooseProfessional(id: string): void {
    setProfessionalId(id);
    setSlot(null);
    setStep("datetime");
  }

  function chooseSlot(picked: PublicSlot): void {
    setSlot(picked);
    setStep("contact");
  }

  function goBack(): void {
    const index = STEP_ORDER.indexOf(step);
    if (index > 0) {
      const previous = STEP_ORDER[index - 1];
      if (previous) setStep(previous);
    }
  }

  const contactValid =
    contact.fullName.trim().length >= 2 && contact.phone.trim().length >= 6;

  // --- Confirmación ----------------------------------------------------------
  if (step === "done" && createMutation.data) {
    const confirmation = createMutation.data;
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">¡Reserva confirmada!</h1>
          <p className="text-muted-foreground">
            Hemos registrado tu cita en <strong>{confirmation.salonName}</strong>.
          </p>
          <div className="w-full max-w-sm rounded-lg border bg-muted/40 p-4 text-left text-sm">
            <p>
              <span className="text-muted-foreground">Servicio:</span>{" "}
              {confirmation.serviceName}
            </p>
            <p>
              <span className="text-muted-foreground">Profesional:</span>{" "}
              {confirmation.professionalName}
            </p>
            <p>
              <span className="text-muted-foreground">Fecha:</span>{" "}
              {formatLongDate(localDateInZone(timeZone, new Date(confirmation.startsAt)), timeZone)}
            </p>
            <p>
              <span className="text-muted-foreground">Hora:</span>{" "}
              {formatSlotTime(confirmation.startsAt, timeZone)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Estado inicial: pendiente de confirmación por el salón. Guarda esta
            información; recibirás la confirmación por el canal habitual.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{salon.name}</h1>
        <p className="text-sm text-muted-foreground">Reserva tu cita en línea</p>
      </header>

      <Stepper current={step} />

      {step !== "service" && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={goBack}
          disabled={createMutation.isPending}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Atrás
        </Button>
      )}

      {/* Paso 1 — Servicio */}
      {step === "service" && (
        <section aria-label="Elegir servicio" className="space-y-3">
          {services.length === 0 && (
            <EmptyState message="Este salón todavía no tiene servicios disponibles para reservar en línea." />
          )}
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => chooseService(service.id)}
              className="flex w-full items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
            >
              <span>
                <span className="font-medium">{service.name}</span>
                {service.category && (
                  <Badge variant="secondary" className="ml-2 align-middle">
                    {service.category}
                  </Badge>
                )}
                <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(service.durationMinutes)}
                </span>
              </span>
              <span className="font-semibold">
                {formatPrice(service.priceCents, service.currency)}
              </span>
            </button>
          ))}
        </section>
      )}

      {/* Paso 2 — Profesional */}
      {step === "professional" && selectedService && (
        <section aria-label="Elegir profesional" className="space-y-3">
          <SummaryLine label="Servicio" value={selectedService.name} />
          {eligibleProfessionals.length === 0 ? (
            <EmptyState message="No hay profesionales disponibles para este servicio." />
          ) : (
            <>
              <button
                type="button"
                onClick={() => chooseProfessional("any")}
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </span>
                <span>
                  <span className="font-medium">Cualquier profesional</span>
                  <span className="block text-sm text-muted-foreground">
                    El primero disponible según la hora que elijas
                  </span>
                </span>
              </button>
              {eligibleProfessionals.map((professional) => (
                <button
                  key={professional.id}
                  type="button"
                  onClick={() => chooseProfessional(professional.id)}
                  className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: professional.color ?? "#64748b" }}
                  >
                    {professional.fullName.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-medium">{professional.fullName}</span>
                </button>
              ))}
            </>
          )}
        </section>
      )}

      {/* Paso 3 — Fecha y hora */}
      {step === "datetime" && selectedService && (
        <section aria-label="Elegir fecha y hora" className="space-y-4">
          <SummaryLine label="Servicio" value={selectedService.name} />
          <div className="space-y-2">
            <Label htmlFor="booking-date">Fecha</Label>
            <Input
              id="booking-date"
              type="date"
              min={today}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setSlot(null);
              }}
              className="w-full sm:w-56"
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">
              {formatLongDate(date, timeZone)}
            </p>

            {availabilityQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Buscando huecos…</p>
            )}
            {availabilityQuery.isError && (
              <p className="text-sm text-destructive">
                {(availabilityQuery.error as Error).message}
              </p>
            )}
            {availabilityQuery.isSuccess &&
              availabilityQuery.data.length === 0 && (
                <EmptyState message="No hay horas libres este día. Prueba con otra fecha." />
              )}

            {availabilityQuery.isSuccess &&
              groupSlots(availabilityQuery.data, timeZone).map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.slots.map((available) => (
                      <Button
                        key={available.startsAt}
                        variant="outline"
                        size="sm"
                        onClick={() => chooseSlot(available)}
                      >
                        {formatSlotTime(available.startsAt, timeZone)}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Paso 4 — Datos de contacto */}
      {step === "contact" && selectedService && slot && (
        <section aria-label="Tus datos" className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CalendarCheck className="h-4 w-4" />
              {selectedService.name}
            </p>
            <p className="mt-1 text-muted-foreground">
              {formatLongDate(localDateInZone(timeZone, new Date(slot.startsAt)), timeZone)}{" "}
              · {formatSlotTime(slot.startsAt, timeZone)} ·{" "}
              {formatPrice(selectedService.priceCents, selectedService.currency)}
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (contactValid) createMutation.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre y apellidos *</Label>
                <Input
                  id="fullName"
                  required
                  value={contact.fullName}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, fullName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono *</Label>
                <Input
                  id="phone"
                  type="tel"
                  required
                  value={contact.phone}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, phone: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={contact.email}
                onChange={(e) =>
                  setContact((c) => ({ ...c, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={contact.notes}
                onChange={(e) =>
                  setContact((c) => ({ ...c, notes: e.target.value }))
                }
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={contact.marketingConsent}
                onChange={(e) =>
                  setContact((c) => ({ ...c, marketingConsent: e.target.checked }))
                }
              />
              Acepto recibir comunicaciones comerciales del salón.
            </label>

            {createMutation.isError && (
              <p className="text-sm text-destructive">
                {(createMutation.error as Error).message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={!contactValid || createMutation.isPending}
            >
              {createMutation.isPending ? "Reservando…" : "Confirmar reserva"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}

// --- Subcomponentes ----------------------------------------------------------

function Stepper({ current }: { current: Step }): React.ReactElement {
  const currentIndex =
    current === "done" ? STEP_ORDER.length : STEP_ORDER.indexOf(current);

  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEP_ORDER.map((s, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold " +
                (done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-muted-foreground/30 text-muted-foreground")
              }
            >
              {done ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span
              className={
                "hidden truncate sm:inline " +
                (active ? "font-medium text-foreground" : "text-muted-foreground")
              }
            >
              {STEP_LABELS[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <p className="text-sm text-muted-foreground">
      {label}: <span className="font-medium text-foreground">{value}</span>
    </p>
  );
}

function EmptyState({ message }: { message: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
