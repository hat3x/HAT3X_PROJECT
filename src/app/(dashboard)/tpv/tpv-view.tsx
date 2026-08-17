"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  CalendarClock,
  CheckCircle2,
  Coins,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  TicketPercent,
  Trash2,
  X,
} from "lucide-react";

import type {
  RetryLoyaltyOutcome,
  SaleLoyaltyOutcome,
  SaleReceipt,
} from "@/app/(dashboard)/tpv/actions";
import {
  blankManualLine,
  centsToEuroInput,
  computeTicketTotals,
  DEFAULT_SERVICE_VAT_RATE,
  isLineComplete,
  lineFromProduct,
  lineFromService,
  parseEuroToCents,
  parseQuantity,
  type TenderDraft,
  type TicketLine,
} from "@/app/(dashboard)/tpv/cart";
import { LoyaltyPanel } from "@/app/(dashboard)/tpv/loyalty-panel";
import { PaymentDialog } from "@/app/(dashboard)/tpv/payment-dialog";
import {
  buildTicketData,
  PAYMENT_METHOD_LABELS,
  printTicketDocument,
} from "@/app/(dashboard)/tpv/print-ticket";
import {
  EmitInvoiceDialog,
  type InvoiceIssuer,
} from "@/components/facturacion/emit-invoice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateSale,
  useLoyaltyLookup,
  useOpenAppointments,
  useRetrySaleLoyalty,
  useSalePaymentMethods,
  useSaleProducts,
  useSaleServices,
} from "@/hooks/use-tpv";
import { formatTimeInZone, localDateInZone } from "@/lib/booking/timezone";
import { formatMoney } from "@/lib/format";
import { LOYALTY_MILESTONES, type LoyaltyCouponView } from "@/lib/loyalty/types";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type {
  TicketDocumentLoyalty,
  TicketDocumentTender,
  TicketRollWidth,
} from "@/lib/tpv/ticket-document";
import type { SaleInput } from "@/lib/validations/sale";

/** Tipos de IVA vigentes en España (porcentaje). */
const VAT_RATES = ["21", "10", "4", "0"] as const;

/**
 * Etiqueta humana de cada tipo de recompensa de hito, derivada del catálogo de
 * hitos. Se usa en el recibo para nombrar la recompensa que la visita desbloqueó
 * (mismo criterio que la tarjeta de fidelización del panel de escaneo).
 */
const REWARD_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LOYALTY_MILESTONES.map((milestone) => [milestone.rewardType, milestone.label]),
);

/**
 * "Foto" inmutable de la venta recién cerrada para poder imprimir su ticket
 * DESPUÉS de que el carrito se haya vaciado. La fidelización NO se congela aquí:
 * se resuelve al imprimir con el desenlace más fresco (acreditación al cobrar o
 * reintento manual correcto), de modo que un ticket impreso tras reintentar sí
 * refleja los puntos.
 */
interface TicketSaleSnapshot {
  args: Omit<Parameters<typeof buildTicketData>[0], "loyalty">;
  /** Nombre del cliente escaneado (o `null`), para el bloque de fidelización. */
  customerName: string | null;
}

/**
 * Adapta el desenlace de fidelización (del cobro o de un reintento) al bloque
 * imprimible del ticket, resolviendo la etiqueta humana de la recompensa. `null`
 * si no hubo cliente/acreditación (el ticket se imprime sin bloque de puntos).
 */
function toTicketLoyalty(
  outcome: SaleLoyaltyOutcome | RetryLoyaltyOutcome | null,
  customerName: string | null,
): TicketDocumentLoyalty | null {
  if (outcome == null) return null;
  return {
    customerName,
    pointsEarned: outcome.pointsEarned,
    pointsBalance: outcome.pointsBalance,
    reward:
      outcome.reward != null
        ? {
            label: REWARD_TYPE_LABELS[outcome.reward.type] ?? outcome.reward.type,
            code: outcome.reward.code,
          }
        : null,
  };
}

/** Contexto de venta cuando arranca desde una cita. */
interface SaleContext {
  appointmentId: string | null;
  customerId: string | null;
  professionalId: string | null;
  label: string;
}

interface TpvViewProps {
  salonId: string;
  /** Nombre comercial del salón; cabecera del ticket impreso. */
  salonName: string;
  timezone: string;
  /**
   * Si el salón tiene contratado el add-on de fidelización. Cuando es `false`
   * ocultamos la tarjeta de escaneo (el gate real de `lookupByQr` ya devolvería
   * 403); el resto del cobro funciona igual, la fidelización es aditiva.
   */
  loyaltyEnabled: boolean;
  /** Datos fiscales del salón (emisor), para emitir factura desde el recibo del cobro. */
  issuer: InvoiceIssuer;
  /**
   * Cita de la que arrancar el cobro automáticamente al abrir la caja (viene de
   * "Cobrar" en el panel de citas: /tpv?appointment=<id>). Solo surte efecto si
   * la cita está en las citas abiertas de hoy.
   */
  initialAppointmentId?: string;
}

/**
 * Pantalla "pasar por caja", pensada para cobrar desde tablet: catálogo
 * (servicios/productos) con botonera amplia a la izquierda y ticket con
 * totales fijo a la derecha. Arranca una venta libre o desde una cita del
 * día; el cobro se registra vía la capa de pagos (diálogo de cobro).
 */
export function TpvView({
  salonId,
  salonName,
  timezone,
  loyaltyEnabled,
  issuer,
  initialAppointmentId,
}: TpvViewProps): React.ReactElement {
  const today = localDateInZone(timezone);

  const [lines, setLines] = useState<TicketLine[]>([]);
  const [context, setContext] = useState<SaleContext | null>(null);
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<"services" | "products">("services");
  const [search, setSearch] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  // "Foto" de la venta cerrada para imprimir su ticket, y ancho de rollo elegido.
  const [ticketSale, setTicketSale] = useState<TicketSaleSnapshot | null>(null);
  const [rollWidth, setRollWidth] = useState<TicketRollWidth>(80);
  // Cupón de bienvenida aplicado al ticket (dueño + cupón). Retirar = ponerlo a
  // null; el descuento desaparece de los totales al instante (antes de cobrar).
  const [appliedCoupon, setAppliedCoupon] = useState<{
    coupon: LoyaltyCouponView;
    customerId: string;
  } | null>(null);

  const services = useSaleServices(salonId, tab === "services" ? search : "");
  const products = useSaleProducts(salonId, tab === "products" ? search : "");
  const paymentMethods = useSalePaymentMethods(salonId);
  const appointments = useOpenAppointments(salonId, today, timezone);

  // "Cobrar" desde el panel de citas abre /tpv?appointment=<id>: en cuanto la
  // lista de citas abiertas de hoy carga, arrancamos esa venta una sola vez.
  const startedFromParamRef = useRef(false);
  useEffect(() => {
    if (startedFromParamRef.current || initialAppointmentId === undefined) return;
    const match = appointments.data?.find((a) => a.id === initialAppointmentId);
    if (match !== undefined) {
      startedFromParamRef.current = true;
      startFromAppointment(match);
    }
    // startFromAppointment es una declaración hoisted y estable; no va en deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAppointmentId, appointments.data]);
  const createSale = useCreateSale(salonId);
  // Fidelización: lookup de SOLO LECTURA por QR. Aditivo — no interviene en el
  // cobro; si no se escanea a nadie, la caja se comporta igual que siempre.
  const loyalty = useLoyaltyLookup();
  // Reintento MANUAL de la acreditación cuando el best-effort falló al cobrar
  // (§sub-7). Reacredita sobre la MISMA venta (ref idempotente); nunca re-cobra.
  const retryLoyalty = useRetrySaleLoyalty(salonId);

  const totals = useMemo(
    () => computeTicketTotals(lines, appliedCoupon?.coupon.percent_off ?? null),
    [lines, appliedCoupon],
  );
  const completeLines = lines.filter(isLineComplete);
  const canCharge = completeLines.length > 0 && totals.totalCents > 0;

  // ── Mutadores del ticket ─────────────────────────────────────────────────
  function updateLine(localId: string, patch: Partial<TicketLine>): void {
    setLines((prev) =>
      prev.map((l) => (l.localId === localId ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(localId: string): void {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
  }

  /** Añade un servicio/producto; si ya está en el ticket, suma 1 a la cantidad. */
  function addLine(line: TicketLine): void {
    setLines((prev) => {
      const existing = prev.find(
        (l) => l.kind === line.kind && l.refId !== null && l.refId === line.refId,
      );
      if (existing !== undefined) {
        const current = parseQuantity(existing.quantity) ?? 0;
        return prev.map((l) =>
          l.localId === existing.localId
            ? { ...l, quantity: String(current + 1) }
            : l,
        );
      }
      return [...prev, line];
    });
  }

  /** Arranca la venta desde una cita: fija contexto y añade el servicio. */
  function startFromAppointment(appt: AppointmentWithDetails): void {
    setContext({
      appointmentId: appt.id,
      customerId: appt.customer_id,
      professionalId: appt.professional_id,
      label: `${appt.customer?.full_name ?? "Cliente"} · ${formatTimeInZone(appt.starts_at, timezone)}`,
    });
    addLine({
      localId: `appt-${appt.id}`,
      kind: "service",
      refId: appt.service_id,
      description: appt.service?.name ?? "Servicio",
      quantity: "1",
      unitPrice: centsToEuroInput(appt.price_cents),
      vatRate: String(DEFAULT_SERVICE_VAT_RATE),
    });
  }

  function resetSale(): void {
    setLines([]);
    setContext(null);
    setNotes("");
    setSearch("");
    setAppliedCoupon(null);
    loyalty.reset(); // vuelve el panel de fidelización a reposo tras la venta
    createSale.reset();
  }

  function submitSale(tenders: TenderDraft[]): void {
    // Cliente escaneado por QR (si lo hay): el servidor le acredita la visita de
    // fidelización tras cobrar. Es independiente del `customerId` de la cita.
    const scannedCustomerId =
      loyalty.data?.ok === true ? loyalty.data.data.customer.id : null;
    const input: SaleInput = {
      appointmentId: context?.appointmentId ?? null,
      customerId: context?.customerId ?? null,
      professionalId: context?.professionalId ?? null,
      notes: notes.trim() === "" ? undefined : notes.trim(),
      // El servidor re-valida el cupón y recalcula el descuento; aquí solo se
      // envían sus referencias (nunca el porcentaje).
      coupon: appliedCoupon
        ? { id: appliedCoupon.coupon.id, customerId: appliedCoupon.customerId }
        : null,
      // Cliente escaneado al que acreditar los puntos de la visita (o `null`).
      loyaltyCustomerId: scannedCustomerId,
      lines: completeLines.map((l) => ({
        kind: l.kind,
        refId: l.refId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
      })),
      tenders: tenders.map((t) => ({
        method: t.method,
        amount: t.amount,
        paymentMethodId: t.paymentMethodId ?? undefined,
        reference: t.reference,
      })),
    };
    createSale.mutate(input, {
      onSuccess: (data) => {
        // Congela la "foto" de la venta para el ticket ANTES de vaciar el carrito
        // (`resetSale`). Las líneas y totales ya no cambiarán; la fidelización se
        // resuelve al imprimir con el desenlace más fresco (cobro o reintento).
        const scannedName =
          loyalty.data?.ok === true ? loyalty.data.data.customer.full_name : null;
        const ticketTenders: TicketDocumentTender[] = tenders.map((t) => ({
          label:
            (t.paymentMethodId !== null
              ? (paymentMethods.data ?? []).find((m) => m.id === t.paymentMethodId)
                  ?.name
              : undefined) ?? PAYMENT_METHOD_LABELS[t.method],
          amountCents: parseEuroToCents(t.amount) ?? 0,
        }));
        setTicketSale({
          args: {
            salonName,
            ticketRef: data.saleId.slice(0, 8).toUpperCase(),
            issuedAt: new Date(),
            lines: completeLines,
            totals,
            tenders: ticketTenders,
            notes: notes.trim() === "" ? null : notes.trim(),
          },
          customerName: scannedName,
        });

        setReceipt(data);
        setPayOpen(false);
        // Arranca el recibo sin arrastrar el desenlace de un reintento anterior.
        retryLoyalty.reset();
        resetSale();
      },
    });
  }

  /**
   * Imprime el ticket de la venta cerrada en la impresora térmica del sistema.
   * Toma la fidelización más fresca (acreditación al cobrar o reintento correcto)
   * y usa el ancho de rollo seleccionado.
   */
  function handlePrintTicket(): void {
    if (ticketSale === null) return;
    const outcome: SaleLoyaltyOutcome | RetryLoyaltyOutcome | null =
      receipt?.loyalty ?? retryLoyalty.data ?? null;
    printTicketDocument(
      buildTicketData({
        ...ticketSale.args,
        loyalty: toTicketLoyalty(outcome, ticketSale.customerName),
      }),
      { rollWidthMm: rollWidth },
    );
  }

  /** Cierra el recibo y descarta el estado asociado (reintento y ticket). */
  function closeReceipt(): void {
    setReceipt(null);
    retryLoyalty.reset();
    setTicketSale(null);
  }

  const activeCatalog = tab === "services" ? services : products;
  const catalogItems = activeCatalog.data ?? [];
  const lineCount = completeLines.length;

  return (
    <main className="container py-6 lg:py-8">
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Caja</h1>
          <p className="text-sm text-muted-foreground">
            Pasa por caja una cita o crea una venta libre.
          </p>
        </div>
      </div>

      <div className="grid animate-fade-up gap-5 lg:grid-cols-[1fr_26rem] lg:gap-6">
        {/* ── Catálogo ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          {loyaltyEnabled ? (
            <LoyaltyPanel
              pending={loyalty.isPending}
              result={loyalty.data}
              onScan={(qrToken) => {
                setAppliedCoupon(null); // un nuevo escaneo descarta el cupón anterior
                loyalty.mutate(qrToken);
              }}
              onClear={() => {
                setAppliedCoupon(null);
                loyalty.reset();
              }}
              appliedCouponId={appliedCoupon?.coupon.id ?? null}
              onApplyCoupon={(coupon, customerId) =>
                setAppliedCoupon({ coupon, customerId })
              }
              onRemoveCoupon={() => setAppliedCoupon(null)}
            />
          ) : null}

          <AppointmentPicker
            appointments={appointments.data ?? []}
            loading={appointments.isPending}
            timezone={timezone}
            activeId={context?.appointmentId ?? null}
            onPick={startFromAppointment}
          />

          <Card className="overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              {/* Control segmentado servicios / productos */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-xl border border-border/70 bg-muted/50 p-1 shadow-xs">
                  <SegmentTab
                    active={tab === "services"}
                    icon={<Scissors className="h-4 w-4" />}
                    label="Servicios"
                    onClick={() => setTab("services")}
                  />
                  <SegmentTab
                    active={tab === "products"}
                    icon={<Package className="h-4 w-4" />}
                    label="Productos"
                    onClick={() => setTab("products")}
                  />
                </div>
              </div>

              {/* Buscador */}
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-11 rounded-xl pl-10 text-base"
                  placeholder={
                    tab === "services" ? "Buscar servicio…" : "Buscar producto…"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar en el catálogo"
                />
              </div>

              {/* Rejilla de botones táctiles */}
              <div className="mt-4 grid max-h-[28rem] grid-cols-2 gap-2.5 overflow-y-auto pr-0.5 sm:grid-cols-3 xl:grid-cols-4">
                {activeCatalog.isPending ? (
                  <CatalogSkeleton />
                ) : catalogItems.length === 0 ? (
                  <EmptyCatalog
                    label={
                      tab === "services"
                        ? "No hay servicios activos."
                        : "No hay productos activos."
                    }
                  />
                ) : tab === "services" ? (
                  (services.data ?? []).map((service) => (
                    <CatalogButton
                      key={service.id}
                      title={service.name}
                      priceCents={service.price_cents}
                      kind="services"
                      onClick={() => addLine(lineFromService(service))}
                    />
                  ))
                ) : (
                  (products.data ?? []).map((product) => (
                    <CatalogButton
                      key={product.id}
                      title={product.name}
                      priceCents={product.price_cents}
                      kind="products"
                      onClick={() => addLine(lineFromProduct(product))}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Ticket ────────────────────────────────────────────────────── */}
        <Card className="flex flex-col overflow-hidden lg:sticky lg:top-6 lg:h-fit lg:max-h-[calc(100vh-3rem)]">
          {/* Cabecera del ticket */}
          <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Receipt className="h-[1.15rem] w-[1.15rem]" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-foreground">Ticket</p>
                <p className="text-xs text-muted-foreground">
                  {lineCount > 0
                    ? `${lineCount} concepto${lineCount !== 1 ? "s" : ""}`
                    : "Vacío"}
                </p>
              </div>
            </div>
            {context !== null ? (
              <div className="flex items-center gap-1">
                <Badge
                  variant="secondary"
                  className="max-w-[11rem] gap-1 truncate"
                >
                  <CalendarClock className="h-3 w-3 shrink-0" />
                  <span className="truncate">{context.label}</span>
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Quitar cita del ticket"
                  onClick={() => setContext(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                Venta libre
              </span>
            )}
          </div>

          <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
            {lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <Sparkles className="h-6 w-6" />
                </span>
                <p className="max-w-[16rem] text-sm text-muted-foreground">
                  Toca un servicio o producto del catálogo para empezar el ticket.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {lines.map((line) => (
                  <TicketRow
                    key={line.localId}
                    line={line}
                    onChange={(patch) => updateLine(line.localId, patch)}
                    onRemove={() => removeLine(line.localId)}
                  />
                ))}
              </ul>
            )}

            <Button
              variant="outline"
              className="h-10 justify-start rounded-lg"
              onClick={() => setLines((prev) => [...prev, blankManualLine()])}
            >
              <Plus className="mr-2 h-4 w-4" />
              Concepto manual
            </Button>

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nota del ticket (opcional)"
              rows={2}
              className="resize-none rounded-lg"
              aria-label="Nota del ticket"
            />
          </CardContent>

          {/* Totales + acción de cobro (fijo al pie) */}
          <div className="border-t border-border/70 bg-muted/30 p-5">
            <dl className="grid gap-1.5 text-sm">
              {totals.couponDiscountCents > 0 ? (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <dt>Subtotal</dt>
                    <dd className="tabular-nums">
                      {formatMoney(totals.grossTotalCents)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between text-success">
                    <dt className="flex items-center gap-1.5">
                      <TicketPercent className="h-3.5 w-3.5" aria-hidden />
                      <span>Cupón −{totals.couponPercentOff}%</span>
                      <button
                        type="button"
                        onClick={() => setAppliedCoupon(null)}
                        aria-label="Quitar el cupón del ticket"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-success/80 transition-colors hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </dt>
                    <dd className="font-medium tabular-nums">
                      −{formatMoney(totals.couponDiscountCents)}
                    </dd>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between text-muted-foreground">
                <dt>Base imponible</dt>
                <dd className="tabular-nums">
                  {formatMoney(totals.subtotalCents)}
                </dd>
              </div>
              {totals.vatBreakdown.map((entry) => (
                <div
                  key={entry.vatRate}
                  className="flex justify-between text-muted-foreground"
                >
                  <dt>IVA {entry.vatRate}%</dt>
                  <dd className="tabular-nums">{formatMoney(entry.taxCents)}</dd>
                </div>
              ))}
              <div className="mt-1.5 flex items-baseline justify-between border-t border-border/70 pt-3">
                <dt className="text-base font-semibold">Total</dt>
                <dd className="text-2xl font-bold tabular-nums tracking-tight">
                  {formatMoney(totals.totalCents)}
                </dd>
              </div>
            </dl>

            <Button
              size="lg"
              className="mt-4 h-14 w-full rounded-xl text-base font-semibold"
              disabled={!canCharge}
              onClick={() => setPayOpen(true)}
            >
              {canCharge
                ? `Cobrar ${formatMoney(totals.totalCents)}`
                : "Añade conceptos para cobrar"}
            </Button>
          </div>
        </Card>
      </div>

      {payOpen ? (
        <PaymentDialog
          open={payOpen}
          onOpenChange={(open) => {
            setPayOpen(open);
            if (!open) createSale.reset();
          }}
          totalCents={totals.totalCents}
          paymentMethods={paymentMethods.data ?? []}
          pending={createSale.isPending}
          error={
            createSale.error instanceof Error ? createSale.error.message : null
          }
          onConfirm={submitSale}
        />
      ) : null}

      {/* Confirmación de venta */}
      <Dialog
        open={receipt !== null}
        onOpenChange={(open) => {
          if (!open) closeReceipt();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <DialogTitle>Venta registrada</DialogTitle>
            <DialogDescription>
              Se han registrado {receipt?.lineCount} línea(s) y{" "}
              {receipt?.tenderCount} cobro(s).
            </DialogDescription>
          </DialogHeader>
          {receipt !== null ? (
            <dl className="grid gap-1.5 rounded-xl border border-border/70 bg-muted/40 p-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Base</dt>
                <dd className="tabular-nums">
                  {formatMoney(receipt.subtotalCents)}
                </dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>IVA</dt>
                <dd className="tabular-nums">{formatMoney(receipt.taxCents)}</dd>
              </div>
              {receipt.discountCents > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>Descuento (cupón)</dt>
                  <dd className="tabular-nums">
                    −{formatMoney(receipt.discountCents)}
                  </dd>
                </div>
              ) : null}
              <div className="mt-1 flex items-baseline justify-between border-t border-border/70 pt-2.5">
                <dt className="font-semibold">Total cobrado</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {formatMoney(receipt.totalCents)}
                </dd>
              </div>
            </dl>
          ) : null}

          {/* Fidelización tras el cobro: el resumen de éxito se muestra tanto si se
              acreditó al cobrar (`receipt.loyalty`) como tras un reintento correcto
              (`retryLoyalty.data`). Si el best-effort falló, se ofrece el reintento
              manual sobre la MISMA venta. La región `aria-live` anuncia el desenlace
              del reintento a lectores de pantalla sin recargar el diálogo. */}
          <div aria-live="polite">
            {receipt?.loyalty != null ? (
              <LoyaltyReceiptSummary outcome={receipt.loyalty} />
            ) : retryLoyalty.data != null ? (
              <LoyaltyReceiptSummary outcome={retryLoyalty.data} />
            ) : receipt?.loyaltyRetry != null ? (
              <LoyaltyRetryCard
                pending={retryLoyalty.isPending}
                error={
                  retryLoyalty.error instanceof Error
                    ? retryLoyalty.error.message
                    : null
                }
                onRetry={() => {
                  if (receipt.loyaltyRetry != null) {
                    retryLoyalty.mutate(receipt.loyaltyRetry);
                  }
                }}
              />
            ) : null}
          </div>
          {/* Impresión del ticket en la impresora térmica del sistema. El ancho de
              rollo (80/58 mm) se elige aquí; el ticket sale por window.print(). */}
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              disabled={ticketSale === null}
              onClick={handlePrintTicket}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir ticket
            </Button>
            <div
              role="group"
              aria-label="Ancho del rollo"
              className="inline-flex items-center rounded-lg border border-border/70 bg-background p-1"
            >
              {([80, 58] as const).map((width) => (
                <button
                  key={width}
                  type="button"
                  onClick={() => setRollWidth(width)}
                  aria-pressed={rollWidth === width}
                  className={[
                    "h-9 rounded-md px-2.5 text-xs font-medium tabular-nums transition-colors",
                    rollWidth === width
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {width} mm
                </button>
              ))}
            </div>
          </div>

          {/* Emitir factura de esta venta (simplificada o completa). El ticket ya
              está registrado; la factura es un documento aparte a demanda. */}
          {receipt !== null ? (
            <EmitInvoiceDialog
              saleId={receipt.saleId}
              issuer={issuer}
              customer={{
                name: ticketSale?.customerName ?? null,
                taxId: null,
                address: null,
              }}
              triggerLabel="Emitir factura"
              triggerVariant="outline"
              triggerSize="default"
              triggerClassName="h-11 w-full"
            />
          ) : null}

          <DialogFooter>
            <Button className="h-11" onClick={closeReceipt}>
              Nueva venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

/** Pestaña de un control segmentado (servicios / productos). */
function SegmentTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-all duration-200 ease-apple-out active:scale-[0.98]",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

/** Botón de un ítem del catálogo (servicio o producto), táctil y amplio. */
function CatalogButton({
  title,
  priceCents,
  kind,
  onClick,
}: {
  title: string;
  priceCents: number;
  kind: "services" | "products";
  onClick: () => void;
}): React.ReactElement {
  const Icon = kind === "services" ? Scissors : Package;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-24 flex-col items-start justify-between overflow-hidden rounded-xl border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-3 text-left shadow-xs transition-all duration-200 ease-apple-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
    >
      <span className="flex w-full items-start justify-between gap-1.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary opacity-0 transition-all duration-200 ease-apple-out group-hover:opacity-100">
          <Plus className="h-3.5 w-3.5" />
        </span>
      </span>
      <span className="w-full space-y-0.5">
        <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">
          {title}
        </span>
        <span className="block text-sm font-semibold tabular-nums text-foreground">
          {formatMoney(priceCents)}
        </span>
      </span>
    </button>
  );
}

function CatalogSkeleton(): React.ReactElement {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </>
  );
}

function EmptyCatalog({ label }: { label: string }): React.ReactElement {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Package className="h-5 w-5" />
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Selector de citas del día para arrancar "desde cita". */
function AppointmentPicker({
  appointments,
  loading,
  timezone,
  activeId,
  onPick,
}: {
  appointments: AppointmentWithDetails[];
  loading: boolean;
  timezone: string;
  activeId: string | null;
  onPick: (appt: AppointmentWithDetails) => void;
}): React.ReactElement | null {
  if (loading) {
    return <Skeleton className="h-11 w-full rounded-xl" />;
  }
  if (appointments.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-3 shadow-xs">
      <span className="inline-flex items-center gap-1.5 pl-1 pr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        Desde cita
      </span>
      {appointments.map((appt) => {
        const active = activeId === appt.id;
        return (
          <button
            key={appt.id}
            type="button"
            onClick={() => onPick(appt)}
            aria-pressed={active}
            className={[
              "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all duration-200 ease-apple-out active:scale-[0.98]",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 bg-background text-foreground hover:border-primary/30 hover:bg-accent",
            ].join(" ")}
          >
            <span className="tabular-nums">
              {formatTimeInZone(appt.starts_at, timezone)}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="max-w-[9rem] truncate">
              {appt.customer?.full_name ?? "Cliente"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Una fila editable del ticket, con controles táctiles amplios. */
function TicketRow({
  line,
  onChange,
  onRemove,
}: {
  line: TicketLine;
  onChange: (patch: Partial<TicketLine>) => void;
  onRemove: () => void;
}): React.ReactElement {
  const qty = parseQuantity(line.quantity);
  const unit = parseEuroToCents(line.unitPrice);
  const lineTotalCents = qty !== null && unit !== null ? Math.round(unit * qty) : 0;

  function stepQty(delta: number): void {
    const next = Math.max(1, (parseQuantity(line.quantity) ?? 0) + delta);
    onChange({ quantity: String(next) });
  }

  return (
    <li className="grid gap-2.5 rounded-xl border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        {line.kind === "manual" ? (
          <Input
            value={line.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Concepto"
            className="h-9"
            aria-label="Concepto"
          />
        ) : (
          <span className="pt-1 text-sm font-medium leading-tight text-foreground">
            {line.description}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Quitar ${line.description || "línea"}`}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {/* Stepper de cantidad, cómodo para tablet */}
        <div className="inline-flex items-center rounded-lg border border-border/70 bg-background">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-r-none text-muted-foreground"
            aria-label="Restar una unidad"
            onClick={() => stepQty(-1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            inputMode="decimal"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className="h-9 w-12 rounded-none border-x border-y-0 border-border/70 px-0 text-center tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label="Cantidad"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-l-none text-muted-foreground"
            aria-label="Sumar una unidad"
            onClick={() => stepQty(1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Input
          inputMode="decimal"
          value={line.unitPrice}
          onChange={(e) => onChange({ unitPrice: e.target.value })}
          placeholder="0,00"
          className="h-9 w-20 text-right tabular-nums"
          aria-label="Precio unitario"
        />
        <Select
          value={line.vatRate}
          onValueChange={(value) => onChange({ vatRate: value })}
        >
          <SelectTrigger className="h-9 w-[4.5rem]" aria-label="IVA">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VAT_RATES.map((rate) => (
              <SelectItem key={rate} value={rate}>
                {rate}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
          {formatMoney(lineTotalCents)}
        </span>
      </div>
    </li>
  );
}

/**
 * Resumen de fidelización acreditada del recibo: puntos ganados, saldo resultante
 * y —si la visita alcanzó un hito— la recompensa desbloqueada. Sirve tanto al
 * cobro (§sub-6) como al reintento manual (§sub-7): cuando la acreditación YA
 * constaba (`alreadyAwarded`), no se suma nada y la copia lo refleja en lugar de
 * mostrar un engañoso "+0 puntos".
 */
function LoyaltyReceiptSummary({
  outcome,
}: {
  outcome: SaleLoyaltyOutcome | RetryLoyaltyOutcome;
}): React.ReactElement {
  const alreadyAwarded = "alreadyAwarded" in outcome && outcome.alreadyAwarded;
  const { pointsEarned, pointsBalance, reward } = outcome;
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Coins className="h-[1.15rem] w-[1.15rem]" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-primary">
            {alreadyAwarded
              ? "Fidelización ya acreditada"
              : `+${pointsEarned} ${pointsEarned === 1 ? "punto" : "puntos"}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Saldo: {pointsBalance} {pointsBalance === 1 ? "punto" : "puntos"}
          </p>
        </div>
      </div>
      {reward != null ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-primary/20 bg-card/70 p-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Award className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              ¡Recompensa desbloqueada!{" "}
              {REWARD_TYPE_LABELS[reward.type] ?? reward.type}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {reward.code}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Aviso de que la acreditación best-effort falló al cerrar el cobro, con la acción
 * de REINTENTO manual (§sub-7). Deja claro que el cobro SÍ quedó registrado: solo
 * faltan los puntos, que se reacreditan sobre la misma venta sin volver a cobrar
 * (la `ref` idempotente evita duplicar). Durante el reintento el botón muestra
 * spinner + "Acreditando…"; si el reintento falla, el error se anuncia con
 * `role="alert"` para lectores de pantalla.
 */
function LoyaltyRetryCard({
  pending,
  error,
  onRetry,
}: {
  pending: boolean;
  error: string | null;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/[0.07] p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <AlertTriangle className="h-[1.15rem] w-[1.15rem]" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-foreground">
            No se pudieron acreditar los puntos
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            El cobro se registró correctamente. Reintenta la acreditación sin
            volver a cobrar.
          </p>
        </div>
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-foreground"
        >
          {error}
        </p>
      ) : null}

      <Button
        variant="outline"
        className="mt-3 h-11 w-full rounded-lg border-warning/40 font-semibold"
        onClick={onRetry}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="mr-2 h-4 w-4" />
        )}
        {pending ? "Acreditando…" : "Reintentar puntos"}
      </Button>
    </div>
  );
}
