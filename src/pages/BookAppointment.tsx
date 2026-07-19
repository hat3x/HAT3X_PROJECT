// Asistente de reserva del cliente sobre la API PÚBLICA de Salón OS.
//
// Flujo (una decisión por paso): servicio → profesional (concreto o «cualquiera») →
// fecha → hueco → confirmar. Todo se apoya en el cliente HTTP tipado de la API pública
// (@/lib/salon-os-api vía @/config/salon-os):
//   · GET  bootstrap      → catálogo (servicios, profesionales, quién presta qué, TZ).
//   · GET  availability   → huecos reservables de (servicio, fecha, profesional).
//   · POST /              → crea la cita (estado pending) y devuelve su confirmación.
//
// ── El servidor manda; el cliente NO recalcula disponibilidad ───────────────────
// Los `PublicSlot` llegan ya calculados por el servidor (horarios, duración del modelo
// de 3 fases, solapes, lead-time y zona horaria). Aquí se CONSUMEN tal cual: sólo se
// ordenan/deduplican para pintarlos (prepareSlots) y se formatea la hora en la zona del
// salón. No hay ninguna aritmética de huecos en el cliente (a diferencia del legacy).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  RefreshCw,
  Scissors,
  StickyNote,
  User,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useCustomer } from '@/hooks/useCustomer';
import { useSalonOsApi } from '@/config/salon-os';
import type {
  BookingConfirmation,
  ProfessionalSelection,
  PublicService,
  PublicSlot,
} from '@/lib/salon-os-api';
import {
  buildBookingCustomer,
  classifyBookingError,
  formatLocalDate,
  isCustomerComplete,
  isSlotTakenError,
  prepareSlots,
  professionalName,
  professionalsForService,
} from '@/lib/booking';
import {
  formatDuration,
  formatLongDate,
  formatPrice,
  formatTime,
  localeToBcp47,
} from '@/lib/appointments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import BottomNav from '@/components/BottomNav';

const STEPS = ['service', 'professional', 'date', 'slot', 'confirm'] as const;
type Step = (typeof STEPS)[number];

/** Selección «cualquier profesional» (el servidor lo resuelve). */
const ANY: ProfessionalSelection = 'any';

/** Contexto de formateo: locale de la app + zona horaria del salón (del catálogo). */
interface Fmt {
  locale: string;
  timeZone: string | null;
}

// ── Estados compartidos (carga / error) ──────────────────────────────────────────

const CenteredSpinner = ({ label }: { label: string }) => (
  <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-16">
    <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

const ErrorState = ({ body, onRetry }: { body: string; onRetry: () => void }) => {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
      </div>
      <p className="mb-6 max-w-xs text-sm leading-relaxed text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg gradient-gold px-6 text-sm font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t('general.retry')}
      </button>
    </div>
  );
};

// ── Tarjeta de opción seleccionable (servicio / profesional) ─────────────────────

const OptionCard = ({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`w-full rounded-xl border p-4 text-left transition-all ${
      selected ? 'border-gold bg-gold/5' : 'border-border bg-card hover:border-gold/20'
    }`}
  >
    {children}
  </button>
);

// ── Pantalla ─────────────────────────────────────────────────────────────────────

const BookAppointment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, locale } = useI18n();
  const reduceMotion = useReducedMotion() ?? false;
  const queryClient = useQueryClient();

  // Cliente de la API pública ligado al salón actual (base de env + slug de runtime).
  const api = useSalonOsApi();
  const slug = api.slug;
  const { customer } = useCustomer();

  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<PublicService | null>(null);
  const [professional, setProfessional] = useState<ProfessionalSelection | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const stepIndex = STEPS.indexOf(step);

  // Traduce el error de cualquier paso (bootstrap / disponibilidad / POST) a un mensaje
  // LEGIBLE según su causa: hueco ocupado, datos inválidos, salón no disponible, red
  // caída o servidor. Si no encaja en ningún caso conocido, usa el `fallbackKey` del
  // paso. La clasificación es pura y testeada (classifyBookingError, en @/lib/booking).
  const errorMessage = (error: unknown, fallbackKey: string): string => {
    switch (classifyBookingError(error)) {
      case 'slotTaken':
        return t('book.errorSlotTaken');
      case 'invalidData':
        return t('book.errorInvalidData');
      case 'salonUnavailable':
        return t('book.errorSalonUnavailable');
      case 'network':
        return t('book.errorNetwork');
      case 'server':
        return t('book.errorServer');
      default:
        return t(fallbackKey);
    }
  };

  // 1) Catálogo público (servicios + profesionales + TZ). Cacheado junto a "Mis Citas".
  const bootstrapQuery = useQuery({
    queryKey: ['salon-bootstrap', slug],
    queryFn: ({ signal }) => api.getBootstrap(signal),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });
  const bootstrap = bootstrapQuery.data ?? null;
  const fmt: Fmt = { locale, timeZone: bootstrap?.salon.timezone ?? null };

  const dateStr = date ? formatLocalDate(date) : null;

  // 2) Huecos reservables del servidor para (servicio, fecha, profesional). Se pintan
  //    tal cual: prepareSlots sólo ordena y deduplica por hora (presentación).
  const availabilityQuery = useQuery({
    queryKey: ['availability', slug, service?.id, dateStr, professional],
    queryFn: ({ signal }) =>
      api.getAvailability(
        { serviceId: service!.id, date: dateStr!, professionalId: professional! },
        signal,
      ),
    enabled: !!service && !!dateStr && professional !== null,
    staleTime: 1000 * 30,
    retry: 1,
  });
  const slots = useMemo(() => prepareSlots(availabilityQuery.data ?? []), [availabilityQuery.data]);

  // 3) Crear la reserva (POST). El cuerpo lleva EXACTAMENTE el contrato del servidor y
  //    reserva con el profesional CONCRETO del hueco elegido (nunca "any" en el POST):
  //    así se respeta el hueco que el servidor mostró, sin re-resolver «cualquiera».
  const createBooking = useMutation({
    mutationFn: () =>
      api.createBooking({
        serviceId: service!.id,
        professionalId: slot!.professionalId,
        startsAt: slot!.startsAt,
        customer: buildBookingCustomer({
          fullName,
          phone,
          email: customer?.email ?? undefined,
          notes,
        }),
      }),
    onSuccess: (conf) => {
      setConfirmation(conf);
      // La nueva cita (pending) debe aparecer al ir a "Mis Citas".
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => {
      if (isSlotTakenError(err)) {
        // El hueco se ocupó entre ver y reservar: vuelve a huecos y recalcula.
        toast.error(t('book.errorSlotTaken'));
        setSlot(null);
        setStep('slot');
        void availabilityQuery.refetch();
      } else {
        // Resto de casos (datos inválidos, salón no disponible, red caída, servidor):
        // se queda en «confirmar» con un aviso legible y deja reintentar sin perder datos.
        toast.error(errorMessage(err, 'book.errorBooking'));
      }
    },
  });

  // Prellenado de contacto desde la ficha del cliente (una vez, sin pisar lo tecleado).
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !customer) return;
    prefilled.current = true;
    setFullName(customer.full_name ?? '');
    setPhone(customer.phone ?? customer.phone_e164 ?? '');
  }, [customer]);

  // Preselección de servicio vía ?serviceId= (enlace desde el catálogo). Una sola vez.
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || !bootstrap) return;
    const id = searchParams.get('serviceId');
    if (!id) return;
    const svc = bootstrap.services.find((s) => s.id === id);
    if (svc) {
      preselected.current = true;
      setService(svc);
      setStep('professional');
    }
  }, [bootstrap, searchParams]);

  // ── Transiciones (cada selección resetea lo aguas abajo) ───────────────────────
  const chooseService = (svc: PublicService) => {
    setService(svc);
    setProfessional(null);
    setDate(undefined);
    setSlot(null);
    setStep('professional');
  };
  const chooseProfessional = (sel: ProfessionalSelection) => {
    setProfessional(sel);
    setDate(undefined);
    setSlot(null);
    setStep('date');
  };
  const chooseDate = (d: Date | undefined) => {
    setDate(d);
    setSlot(null);
    if (d) setStep('slot');
  };
  const chooseSlot = (s: PublicSlot) => {
    setSlot(s);
    setStep('confirm');
  };
  const goBack = () => {
    if (stepIndex <= 0) {
      navigate(-1);
      return;
    }
    setStep(STEPS[stepIndex - 1]);
  };

  // ── Pantalla de éxito ──────────────────────────────────────────────────────────
  if (confirmation) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 pb-24 text-center">
        <motion.div
          initial={reduceMotion ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-full gradient-gold shadow-gold"
        >
          <Check className="h-10 w-10 text-primary-foreground" aria-hidden="true" />
        </motion.div>
        <h1 className="mb-2 font-display text-3xl text-foreground">{t('book.success')}</h1>
        <p className="mb-6 max-w-xs text-sm text-muted-foreground">{t('book.successDesc')}</p>

        <div className="mb-4 w-full max-w-sm space-y-2 rounded-xl border border-border bg-card p-4 text-left">
          <SummaryRow icon={<Scissors className="h-4 w-4 text-gold" />} label={t('book.service')} value={confirmation.serviceName} />
          <SummaryRow icon={<User className="h-4 w-4 text-gold" />} label={t('book.staff')} value={confirmation.professionalName} />
          <SummaryRow
            icon={<CalendarDays className="h-4 w-4 text-gold" />}
            label={t('book.dateTime')}
            value={`${formatLongDate(confirmation.startsAt, fmt)} · ${formatTime(confirmation.startsAt, fmt)}`}
          />
        </div>

        {/* La reserva se crea en estado «pending»: lo decimos claro para no prometer confirmación. */}
        <p className="mb-8 flex w-full max-w-sm items-start gap-2 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden="true" />
          <span>{t('book.successPending')}</span>
        </p>

        <Button
          onClick={() => navigate('/appointments')}
          className="gradient-gold text-primary-foreground shadow-gold hover:opacity-90"
        >
          {t('book.goToAppointments')}
        </Button>
        <BottomNav />
      </div>
    );
  }

  // ── Datos derivados para los pasos «profesional» y «confirmar» ─────────────────
  const serviceProfessionals =
    bootstrap && service ? professionalsForService(bootstrap, service.id) : [];
  const assignedProfessionalName =
    bootstrap && slot
      ? professionalName(bootstrap, slot.professionalId)
      : bootstrap && professional && professional !== ANY
        ? professionalName(bootstrap, professional)
        : null;
  const contactReady = isCustomerComplete({ fullName, phone });

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Cabecera: volver + título + progreso */}
      <div className="px-6 pt-12 pb-4">
        <button
          type="button"
          onClick={goBack}
          className="mb-4 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span className="text-sm">{stepIndex > 0 ? t('book.previous') : t('general.back')}</span>
        </button>
        <h1 className="font-display text-3xl text-foreground">{t('book.title')}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('book.step')} {stepIndex + 1} {t('book.of')} {STEPS.length}
        </p>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? 'gradient-gold' : 'bg-muted'}`}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
          className="px-6 py-2"
        >
          {/* Paso 1 · Servicio */}
          {step === 'service' && (
            <section aria-label={t('book.selectService')} className="space-y-3">
              <h2 className="mb-2 font-display text-lg text-foreground">{t('book.selectService')}</h2>
              {bootstrapQuery.isPending ? (
                <CenteredSpinner label={t('general.loading')} />
              ) : bootstrapQuery.isError ? (
                <ErrorState
                  body={errorMessage(bootstrapQuery.error, 'book.loadError')}
                  onRetry={() => void bootstrapQuery.refetch()}
                />
              ) : !bootstrap || bootstrap.services.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('book.noServices')}</p>
              ) : (
                bootstrap.services.map((svc) => (
                  <OptionCard key={svc.id} selected={service?.id === svc.id} onClick={() => chooseService(svc)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{svc.name}</p>
                        {svc.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{svc.description}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {svc.durationMinutes > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} aria-hidden="true" /> {formatDuration(svc.durationMinutes)}
                            </span>
                          )}
                          {svc.priceCents > 0 && (
                            <span className="font-medium text-gold">
                              {formatPrice(svc.priceCents, svc.currency, locale)}
                            </span>
                          )}
                        </div>
                      </div>
                      {service?.id === svc.id && <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />}
                    </div>
                  </OptionCard>
                ))
              )}
            </section>
          )}

          {/* Paso 2 · Profesional (concreto o «cualquiera») */}
          {step === 'professional' && (
            <section aria-label={t('book.selectStaff')} className="space-y-3">
              <h2 className="mb-2 font-display text-lg text-foreground">{t('book.selectStaff')}</h2>

              <OptionCard selected={professional === ANY} onClick={() => chooseProfessional(ANY)}>
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${professional === ANY ? 'gradient-gold' : 'bg-muted'}`}
                  >
                    <Users className={`h-5 w-5 ${professional === ANY ? 'text-primary-foreground' : 'text-muted-foreground'}`} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t('book.anyProfessional')}</p>
                    <p className="text-xs text-muted-foreground">{t('book.firstAvailableDesc')}</p>
                  </div>
                  {professional === ANY && <Check className="ml-auto h-4 w-4 text-gold" aria-hidden="true" />}
                </div>
              </OptionCard>

              {serviceProfessionals.length === 0 ? (
                <p className="pt-2 text-xs text-muted-foreground">{t('book.anyProfessionalHint')}</p>
              ) : (
                serviceProfessionals.map((pro) => {
                  const selected = professional === pro.id;
                  return (
                    <OptionCard key={pro.id} selected={selected} onClick={() => chooseProfessional(pro.id)}>
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-full"
                          style={{ backgroundColor: pro.color ?? undefined }}
                        >
                          <User
                            className={`h-5 w-5 ${pro.color ? 'text-white' : selected ? 'text-gold' : 'text-muted-foreground'}`}
                            aria-hidden="true"
                          />
                        </span>
                        <p className="text-sm font-medium text-foreground">{pro.fullName}</p>
                        {selected && <Check className="ml-auto h-4 w-4 text-gold" aria-hidden="true" />}
                      </div>
                    </OptionCard>
                  );
                })
              )}
            </section>
          )}

          {/* Paso 3 · Fecha */}
          {step === 'date' && (
            <section aria-label={t('book.selectDate')} className="space-y-3">
              <h2 className="mb-2 font-display text-lg text-foreground">{t('book.selectDate')}</h2>
              <div className="flex justify-center rounded-xl border border-border bg-card p-2">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={chooseDate}
                  // Sólo se limita el pasado (server-authoritative para el resto): el
                  // servidor decide si un día tiene huecos; aquí no se prejuzga.
                  disabled={(d) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return d < today;
                  }}
                  className="pointer-events-auto text-foreground"
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">{t('book.dateHint')}</p>
            </section>
          )}

          {/* Paso 4 · Hueco (huecos del servidor, sin recálculo en cliente) */}
          {step === 'slot' && (
            <section aria-label={t('book.selectSlot')} className="space-y-4">
              <h2 className="font-display text-lg text-foreground">{t('book.selectSlot')}</h2>
              {date && (
                <p className="text-sm capitalize text-muted-foreground">
                  {date.toLocaleDateString(localeToBcp47(locale), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              )}
              {availabilityQuery.isPending ? (
                <CenteredSpinner label={t('book.checkingAvailability')} />
              ) : availabilityQuery.isError ? (
                <ErrorState
                  body={errorMessage(availabilityQuery.error, 'book.errorAvailability')}
                  onRetry={() => void availabilityQuery.refetch()}
                />
              ) : slots.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">{t('book.noSlots')}</p>
                  <Button variant="outline" onClick={() => setStep('date')} className="border-gold/40 text-gold hover:bg-gold/10">
                    {t('book.pickAnotherDate')}
                  </Button>
                </div>
              ) : (
                <div role="listbox" aria-label={t('book.selectSlot')} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((s) => {
                    const selected = slot?.startsAt === s.startsAt;
                    return (
                      <button
                        key={s.startsAt}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => chooseSlot(s)}
                        className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${
                          selected
                            ? 'border-gold bg-gold/10 text-gold'
                            : 'border-border bg-card text-foreground hover:border-gold/30'
                        }`}
                      >
                        {formatTime(s.startsAt, fmt)}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Paso 5 · Confirmar (datos de contacto + POST) */}
          {step === 'confirm' && service && slot && (
            <section aria-label={t('book.confirm')} className="space-y-4">
              <h2 className="mb-1 font-display text-lg text-foreground">{t('book.confirm')}</h2>

              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <SummaryRow
                  icon={<Scissors className="h-4 w-4 text-gold" />}
                  label={t('book.service')}
                  value={service.name}
                  sub={service.durationMinutes > 0 ? formatDuration(service.durationMinutes) : undefined}
                />
                <SummaryRow
                  icon={<User className="h-4 w-4 text-gold" />}
                  label={t('book.staff')}
                  value={assignedProfessionalName ?? t('book.anyProfessional')}
                  sub={professional === ANY ? t('book.assignedProfessional') : undefined}
                />
                <SummaryRow
                  icon={<CalendarDays className="h-4 w-4 text-gold" />}
                  label={t('book.dateTime')}
                  value={`${formatLongDate(slot.startsAt, fmt)} · ${formatTime(slot.startsAt, fmt)}`}
                />
                {service.priceCents > 0 && (
                  <SummaryRow
                    icon={<span className="text-xs font-bold text-gold">€</span>}
                    label={t('book.total')}
                    value={formatPrice(service.priceCents, service.currency, locale)}
                  />
                )}
              </div>

              {/* Datos de contacto (prellenados de la ficha; editables) */}
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('book.contactDetails')}
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="book-name" className="text-xs text-muted-foreground">{t('book.fullName')}</label>
                  <Input
                    id="book-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('book.fullName')}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="book-phone" className="text-xs text-muted-foreground">{t('auth.phone')}</label>
                  <Input
                    id="book-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('auth.phone')}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="book-notes" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StickyNote size={13} aria-hidden="true" /> {t('book.notes')}
                  </label>
                  <Textarea
                    id="book-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('book.notesPlaceholder')}
                    className="bg-background"
                  />
                </div>
              </div>

              {createBooking.isError && !isSlotTakenError(createBooking.error) && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-destructive">
                    {errorMessage(createBooking.error, 'book.errorBooking')}
                  </p>
                </div>
              )}

              <Button
                onClick={() => createBooking.mutate()}
                disabled={!contactReady || createBooking.isPending}
                className="w-full gradient-gold text-primary-foreground shadow-gold hover:opacity-90 disabled:opacity-40"
              >
                {createBooking.isPending ? t('general.loading') : t('book.confirmBooking')}
              </Button>
              {!contactReady && (
                <p className="text-center text-xs text-muted-foreground">{t('book.missingContact')}</p>
              )}
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

// ── Fila de resumen (icono · etiqueta · valor) ───────────────────────────────────

const SummaryRow = ({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) => (
  <div className="flex items-center gap-3">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
      {icon}
    </span>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm text-foreground">
        {value}
        {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
      </p>
    </div>
  </div>
);

export default BookAppointment;
