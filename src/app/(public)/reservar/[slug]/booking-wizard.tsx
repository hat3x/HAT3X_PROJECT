"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarCheck,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  Sparkles,
  User,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { DaySlots, DaySlotsSkeleton } from "@/components/booking/day-slots";
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
  BookingPrefill,
  DayAvailabilityResponse,
  PublicDaySlot,
  PublicSalon,
  PublicSlot,
} from "@/lib/booking/types";
import { cn } from "@/lib/utils";

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

/**
 * Estado inicial del paso «Tus datos» a partir de la precarga del cliente autenticado
 * (sub-6), o vacío si no la hay. Solo campos de PERFIL: `notes` arranca SIEMPRE vacío
 * (pertenece a la cita concreta, no al perfil). Lo sembrado queda editable con libertad.
 */
function contactFromPrefill(prefill: BookingPrefill | null | undefined): ContactForm {
  if (!prefill) return EMPTY_CONTACT;
  return {
    fullName: prefill.fullName,
    phone: prefill.phone,
    email: prefill.email,
    notes: "",
    marketingConsent: prefill.marketingConsent,
  };
}

/** Suma `n` días a una fecha local `YYYY-MM-DD` sin arrastrar zona horaria. */
function addLocalDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return next.toISOString().slice(0, 10);
}

/**
 * Error de una petición a la API pública que preserva el `status` HTTP. Permite a
 * la UI distinguir el conflicto de hueco (409) —recuperable eligiendo otra hora—
 * del resto de errores (datos no válidos, salón o servicio no disponible…), que se
 * muestran con el mensaje legible tal cual lo devuelve el servidor.
 */
class BookingRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BookingRequestError";
  }
}

export function BookingWizard({
  slug,
  bootstrap,
  prefill,
}: {
  slug: string;
  bootstrap: BookingBootstrap;
  /**
   * Datos del cliente AUTENTICADO con ficha en este salón para sembrar «Tus datos»
   * (sub-6). `null`/ausente ⇒ visitante anónimo o sin ficha: el formulario arranca vacío.
   */
  prefill?: BookingPrefill | null;
}): React.ReactElement {
  const { salon, services, professionals, serviceProfessionals } = bootstrap;
  const timeZone = salon.timezone;
  const today = localDateInZone(timeZone);

  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string>("any");
  const [date, setDate] = useState<string>(today);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  // Siembra «Tus datos» con la ficha del cliente autenticado, si la hay (sub-6).
  // Inicializador perezoso: `prefill` llega del servidor y no cambia en vida del
  // componente, así que basta sembrarlo una vez (sin efecto que re-sincronice) y lo
  // sembrado sigue siendo editable.
  const [contact, setContact] = useState<ContactForm>(() =>
    contactFromPrefill(prefill),
  );

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
    queryFn: async (): Promise<PublicDaySlot[]> => {
      const query = new URLSearchParams({ serviceId: serviceId ?? "", date });
      // Con un profesional CONCRETO pedimos la rejilla completa de su jornada
      // (`view=day`: libres + no reservables con su motivo, sub-2). Con «cualquiera»
      // esa vista no aplica (es per-profesional), así que caemos en la vista por
      // defecto de solo-libres.
      const concrete = professionalId !== "any";
      if (concrete) {
        query.set("professionalId", professionalId);
        query.set("view", "day");
      }

      const res = await fetch(
        `/api/public/booking/${slug}/availability?${query.toString()}`,
      );
      const json = (await res.json()) as
        | DayAvailabilityResponse
        | AvailabilityResponse
        | { error: string };
      if (!res.ok) {
        throw new BookingRequestError(
          res.status,
          "error" in json ? json.error : "Error de disponibilidad.",
        );
      }
      // Profesional concreto → la jornada COMPLETA tal cual. «Cualquiera» → solo
      // libres, que se normalizan a la misma forma de rejilla (todos `available`)
      // para pintarlos con el MISMO componente sin ramas en la vista.
      if (concrete) {
        return (json as DayAvailabilityResponse).daySlots;
      }
      return (json as AvailabilityResponse).slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        professionalId: slot.professionalId,
        available: true,
      }));
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
        throw new BookingRequestError(
          res.status,
          "error" in json ? json.error : "No se pudo reservar.",
        );
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

  /**
   * Recuperación tras un conflicto de hueco (409): descarta la hora elegida,
   * limpia el error del envío y vuelve al paso de fecha refrescando la
   * disponibilidad (la caché es de 30 s: sin refetch se reofrecería la hora ya
   * ocupada). `refetch` fuerza la recarga aunque la query esté deshabilitada.
   */
  function backToSlots(): void {
    setSlot(null);
    createMutation.reset();
    setStep("datetime");
    void availabilityQuery.refetch();
  }

  const contactValid =
    contact.fullName.trim().length >= 2 && contact.phone.trim().length >= 6;

  // --- Confirmación ----------------------------------------------------------
  if (step === "done" && createMutation.data) {
    const confirmation = createMutation.data;
    return (
      <div className="animate-fade-in space-y-6">
        <BrandHeader salon={salon} />

        <Card className="overflow-hidden shadow-lg">
          {/* Cabecera de éxito con halo suave. */}
          <div className="relative flex flex-col items-center gap-3 border-b border-border/70 bg-[radial-gradient(80%_120%_at_50%_-10%,hsl(var(--success)/0.12),transparent)] px-6 pb-6 pt-8 text-center">
            <span className="flex h-16 w-16 animate-scale-in items-center justify-center rounded-full bg-success text-success-foreground shadow-md ring-8 ring-success/10">
              <Check className="h-8 w-8" strokeWidth={2.5} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">
              ¡Reserva confirmada!
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              Hemos registrado tu cita en{" "}
              <strong className="text-foreground">{confirmation.salonName}</strong>.
            </p>
          </div>

          {/* Detalle tipo «ticket». */}
          <CardContent className="space-y-4 p-6">
            <dl className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm">
              <TicketRow label="Servicio" value={confirmation.serviceName} />
              <TicketRow
                label="Profesional"
                value={confirmation.professionalName}
              />
              <TicketRow
                label="Fecha"
                value={formatLongDate(
                  localDateInZone(timeZone, new Date(confirmation.startsAt)),
                  timeZone,
                )}
              />
              <TicketRow
                label="Hora"
                value={formatSlotTime(confirmation.startsAt, timeZone)}
                emphasis
              />
            </dl>

            <div className="flex items-start gap-2.5 rounded-lg bg-warning/10 p-3 text-xs text-warning-foreground/80">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p>
                Estado inicial:{" "}
                <strong className="font-medium">pendiente de confirmación</strong>{" "}
                por el salón. Guarda esta información; recibirás la confirmación
                por el canal habitual.
              </p>
            </div>
          </CardContent>
        </Card>

        <TrustFooter salon={salon} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <BrandHeader salon={salon} />

      <Card className="overflow-hidden shadow-lg">
        {/* Progreso: barra fija superior con estilo premium. */}
        <div className="border-b border-border/70 bg-muted/30 px-5 py-4 sm:px-6">
          <Stepper current={step} />
        </div>

        <CardContent className="space-y-5 p-5 sm:p-6">
          {step !== "service" && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 -mt-1 h-8 text-muted-foreground hover:text-foreground"
              onClick={goBack}
              disabled={createMutation.isPending}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Atrás
            </Button>
          )}

          {/* Paso 1 — Servicio */}
          {step === "service" && (
            <section
              aria-label="Elegir servicio"
              className="animate-fade-up space-y-3"
            >
              <StepIntro
                title="¿Qué te apetece?"
                subtitle="Elige el servicio que quieres reservar."
              />
              {services.length === 0 ? (
                <EmptyState
                  icon={CalendarX}
                  message="Este salón todavía no tiene servicios disponibles para reservar en línea."
                />
              ) : (
                services.map((service, index) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => chooseService(service.id)}
                    style={{ animationDelay: `${index * 45}ms` }}
                    className="group flex w-full animate-fade-up items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left shadow-xs transition-all duration-200 ease-apple-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{service.name}</span>
                        {service.category && (
                          <Badge variant="secondary" className="font-normal">
                            {service.category}
                          </Badge>
                        )}
                      </span>
                      {service.description && (
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                          {service.description}
                        </span>
                      )}
                      <span className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(service.durationMinutes)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-base font-semibold tabular-nums">
                        {formatPrice(service.priceCents, service.currency)}
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted-foreground/50 transition-transform duration-200 ease-apple-out group-hover:translate-x-0.5 group-hover:text-primary" />
                    </span>
                  </button>
                ))
              )}
            </section>
          )}

          {/* Paso 2 — Profesional */}
          {step === "professional" && selectedService && (
            <section
              aria-label="Elegir profesional"
              className="animate-fade-up space-y-3"
            >
              <StepIntro
                title="¿Con quién?"
                subtitle="Elige tu profesional de confianza o deja que asignemos el primero libre."
              />
              <SelectionRecap service={selectedService.name} />
              {eligibleProfessionals.length === 0 ? (
                <EmptyState
                  icon={User}
                  message="No hay profesionales disponibles para este servicio."
                />
              ) : (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => chooseProfessional("any")}
                    className="group flex w-full items-center gap-3.5 rounded-xl border border-border/70 bg-card p-4 text-left shadow-xs transition-all duration-200 ease-apple-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-brand">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">Cualquier profesional</span>
                      <span className="block text-sm text-muted-foreground">
                        El primero disponible según la hora que elijas
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform duration-200 ease-apple-out group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                  {eligibleProfessionals.map((professional, index) => (
                    <button
                      key={professional.id}
                      type="button"
                      onClick={() => chooseProfessional(professional.id)}
                      style={{ animationDelay: `${index * 45}ms` }}
                      className="group flex w-full animate-fade-up items-center gap-3.5 rounded-xl border border-border/70 bg-card p-4 text-left shadow-xs transition-all duration-200 ease-apple-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99]"
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white shadow-sm"
                        style={{
                          backgroundColor: professional.color ?? "#64748b",
                        }}
                      >
                        {professional.fullName.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 font-semibold">
                        {professional.fullName}
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform duration-200 ease-apple-out group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Paso 3 — Fecha y hora */}
          {step === "datetime" && selectedService && (
            <section
              aria-label="Elegir fecha y hora"
              className="animate-fade-up space-y-5"
            >
              <StepIntro
                title="¿Cuándo te viene bien?"
                subtitle="Elige el día y toca la hora que prefieras."
              />
              <SelectionRecap service={selectedService.name} />

              <div className="space-y-2.5">
                <Label htmlFor="booking-date">Fecha</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <QuickDateChip
                    label="Hoy"
                    active={date === today}
                    onClick={() => {
                      setDate(today);
                      setSlot(null);
                    }}
                  />
                  <QuickDateChip
                    label="Mañana"
                    active={date === addLocalDays(today, 1)}
                    onClick={() => {
                      setDate(addLocalDays(today, 1));
                      setSlot(null);
                    }}
                  />
                  <Input
                    id="booking-date"
                    type="date"
                    min={today}
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setSlot(null);
                    }}
                    className="w-auto flex-1 sm:w-52 sm:flex-none"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium capitalize text-foreground">
                  {formatLongDate(date, timeZone)}
                </p>

                <div aria-live="polite" className="min-h-[3rem]">
                  {availabilityQuery.isLoading && <DaySlotsSkeleton />}

                  {availabilityQuery.isError && (
                    <ErrorState
                      message={(availabilityQuery.error as Error).message}
                      onRetry={() => availabilityQuery.refetch()}
                    />
                  )}

                  {availabilityQuery.isSuccess && (
                    <DaySlots
                      slots={availabilityQuery.data}
                      timeZone={timeZone}
                      selected={slot}
                      anyProfessional={professionalId === "any"}
                      onSelect={chooseSlot}
                    />
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Paso 4 — Datos de contacto */}
          {step === "contact" && selectedService && slot && (
            <section aria-label="Tus datos" className="animate-fade-up space-y-5">
              <StepIntro
                title="Ya casi está"
                subtitle="Déjanos tus datos para confirmar la cita."
              />

              {/* Resumen de la reserva. */}
              <div className="overflow-hidden rounded-xl border border-primary/20 bg-accent/50">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CalendarCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {selectedService.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatLongDate(
                        localDateInZone(timeZone, new Date(slot.startsAt)),
                        timeZone,
                      )}{" "}
                      · {formatSlotTime(slot.startsAt, timeZone)}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-right font-semibold tabular-nums">
                    {formatPrice(
                      selectedService.priceCents,
                      selectedService.currency,
                    )}
                  </span>
                </div>
              </div>

              {/* Reconocimiento del cliente autenticado: sus datos vienen sembrados
                  desde su ficha (sub-6). Aviso sutil y editable, no un bloqueo. */}
              {prefill && (
                <div className="flex items-center gap-2.5 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserCheck className="h-4 w-4" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    Hemos rellenado tus datos.{" "}
                    <span className="font-medium text-foreground">
                      Revísalos y confirma.
                    </span>
                  </p>
                </div>
              )}

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
                      autoComplete="name"
                      placeholder="Ej. Ana García"
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
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="600 000 000"
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
                    autoComplete="email"
                    inputMode="email"
                    placeholder="tu@correo.com"
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
                    placeholder="¿Algo que debamos saber antes de tu cita?"
                    value={contact.notes}
                    onChange={(e) =>
                      setContact((c) => ({ ...c, notes: e.target.value }))
                    }
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground transition-colors duration-200 ease-apple-out hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    checked={contact.marketingConsent}
                    onChange={(e) =>
                      setContact((c) => ({
                        ...c,
                        marketingConsent: e.target.checked,
                      }))
                    }
                  />
                  Acepto recibir comunicaciones comerciales del salón.
                </label>

                {createMutation.isError && (
                  <BookingErrorBlock
                    error={createMutation.error}
                    onPickAnother={backToSlots}
                  />
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!contactValid || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Spinner className="mr-2" /> Reservando…
                    </>
                  ) : (
                    "Confirmar reserva"
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Sin pago por adelantado. Confirmas y listo.
                </p>
              </form>
            </section>
          )}
        </CardContent>
      </Card>

      <TrustFooter salon={salon} />
    </div>
  );
}

// --- Subcomponentes ----------------------------------------------------------

/** Cabecera de marca: monograma del salón + nombre. */
function BrandHeader({ salon }: { salon: PublicSalon }): React.ReactElement {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-2xl font-bold text-primary-foreground shadow-brand">
        {salon.name.charAt(0).toUpperCase()}
      </span>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {salon.name}
        </h1>
        <p className="text-sm text-muted-foreground">Reserva tu cita en línea</p>
      </div>
    </header>
  );
}

/** Encabezado corto de cada paso. */
function StepIntro({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}): React.ReactElement {
  return (
    <div className="space-y-0.5">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/** Recordatorio compacto de lo ya elegido (contexto en pasos posteriores). */
function SelectionRecap({ service }: { service: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Check className="h-4 w-4 text-success" />
      <span className="font-medium text-foreground">{service}</span>
    </div>
  );
}

function Stepper({ current }: { current: Step }): React.ReactElement {
  const currentIndex =
    current === "done" ? STEP_ORDER.length : STEP_ORDER.indexOf(current);

  return (
    <ol className="flex items-center gap-1.5">
      {STEP_ORDER.map((s, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-all duration-300 ease-apple-out",
                done
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : active
                    ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/10"
                    : "border-muted-foreground/25 text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "hidden truncate text-xs sm:inline",
                active
                  ? "font-semibold text-foreground"
                  : done
                    ? "text-foreground/70"
                    : "text-muted-foreground",
              )}
            >
              {STEP_LABELS[s]}
            </span>
            {index < STEP_ORDER.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1 transition-colors duration-300 ease-apple-out",
                  done ? "bg-primary/50" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Chip de acceso rápido a un día (Hoy / Mañana). */
function QuickDateChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 rounded-lg border px-3.5 text-sm font-medium shadow-xs transition-all duration-200 ease-apple-out active:scale-95",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-brand"
          : "border-border/70 bg-card text-foreground hover:border-primary/40 hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

/** Detalle en el ticket de confirmación. */
function TicketRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium",
          emphasis && "text-base font-semibold tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function EmptyState({
  message,
  icon: Icon = CalendarX,
}: {
  message: string;
  icon?: typeof CalendarX;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.ReactElement {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="h-5 w-5" />
      </span>
      <p className="max-w-xs text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/**
 * Traduce el error del envío de la reserva a un bloque legible. El conflicto de
 * hueco (409) —la hora se ocupó entre que se cargó y se envió— es recuperable:
 * se ofrece volver a elegir hora. El resto (datos no válidos 400, salón o
 * servicio no disponible 404, error inesperado 500) muestran su mensaje tal cual.
 */
function BookingErrorBlock({
  error,
  onPickAnother,
}: {
  error: Error | null;
  onPickAnother: () => void;
}): React.ReactElement {
  if (error instanceof BookingRequestError && error.status === 409) {
    return <SlotTakenNotice message={error.message} onPickAnother={onPickAnother} />;
  }
  return (
    <ErrorState
      message={error?.message ?? "No se pudo reservar. Inténtalo de nuevo."}
    />
  );
}

/** Aviso recuperable de hueco ocupado, con acción para elegir otra hora. */
function SlotTakenNotice({
  message,
  onPickAnother,
}: {
  message: string;
  onPickAnother: () => void;
}): React.ReactElement {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 p-6 text-center"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-warning/15 text-warning">
        <CalendarX className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">Esa hora acaba de ocuparse</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" onClick={onPickAnother}>
        <Clock className="mr-1.5 h-4 w-4" /> Elegir otra hora
      </Button>
    </div>
  );
}

/** Pie de confianza: datos de contacto del salón. */
function TrustFooter({ salon }: { salon: PublicSalon }): React.ReactElement {
  if (!salon.phone && !salon.address) return <div className="h-2" />;
  return (
    <footer className="flex flex-col items-center gap-1.5 px-4 text-center text-xs text-muted-foreground">
      {salon.address && (
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          {salon.address}
        </span>
      )}
      {salon.phone && (
        <a
          href={`tel:${salon.phone.replace(/\s+/g, "")}`}
          className="flex items-center gap-1.5 transition-colors duration-200 ease-apple-out hover:text-foreground"
        >
          <Phone className="h-3.5 w-3.5" />
          {salon.phone}
        </a>
      )}
    </footer>
  );
}

/** Spinner minimalista para estados de carga en botones. */
function Spinner({ className }: { className?: string }): React.ReactElement {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
