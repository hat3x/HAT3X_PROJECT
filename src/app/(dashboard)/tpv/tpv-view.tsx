"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Package,
  Plus,
  Scissors,
  Search,
  Trash2,
  X,
} from "lucide-react";

import type { SaleReceipt } from "@/app/(dashboard)/tpv/actions";
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
import { PaymentDialog } from "@/app/(dashboard)/tpv/payment-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  useOpenAppointments,
  useSalePaymentMethods,
  useSaleProducts,
  useSaleServices,
} from "@/hooks/use-tpv";
import { formatTimeInZone, localDateInZone } from "@/lib/booking/timezone";
import { formatMoney } from "@/lib/format";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { SaleInput } from "@/lib/validations/sale";

/** Tipos de IVA vigentes en España (porcentaje). */
const VAT_RATES = ["21", "10", "4", "0"] as const;

/** Contexto de venta cuando arranca desde una cita. */
interface SaleContext {
  appointmentId: string | null;
  customerId: string | null;
  professionalId: string | null;
  label: string;
}

interface TpvViewProps {
  salonId: string;
  timezone: string;
}

/**
 * Pantalla "pasar por caja": catálogo (servicios/productos) a la izquierda,
 * ticket con totales a la derecha. Arranca una venta libre o desde una cita del
 * día; el cobro se registra vía la capa de pagos (diálogo de cobro).
 */
export function TpvView({ salonId, timezone }: TpvViewProps): React.ReactElement {
  const today = localDateInZone(timezone);

  const [lines, setLines] = useState<TicketLine[]>([]);
  const [context, setContext] = useState<SaleContext | null>(null);
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<"services" | "products">("services");
  const [search, setSearch] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);

  const services = useSaleServices(salonId, tab === "services" ? search : "");
  const products = useSaleProducts(salonId, tab === "products" ? search : "");
  const paymentMethods = useSalePaymentMethods(salonId);
  const appointments = useOpenAppointments(salonId, today, timezone);
  const createSale = useCreateSale(salonId);

  const totals = useMemo(() => computeTicketTotals(lines), [lines]);
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
    createSale.reset();
  }

  function submitSale(tenders: TenderDraft[]): void {
    const input: SaleInput = {
      appointmentId: context?.appointmentId ?? null,
      customerId: context?.customerId ?? null,
      professionalId: context?.professionalId ?? null,
      notes: notes.trim() === "" ? undefined : notes.trim(),
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
        setReceipt(data);
        setPayOpen(false);
        resetSale();
      },
    });
  }

  return (
    <main className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Caja</h1>
        <p className="text-muted-foreground">
          Pasa por caja una cita o crea una venta libre.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        {/* ── Catálogo ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <AppointmentPicker
            appointments={appointments.data ?? []}
            loading={appointments.isPending}
            timezone={timezone}
            activeId={context?.appointmentId ?? null}
            onPick={startFromAppointment}
          />

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Button
                  variant={tab === "services" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTab("services")}
                >
                  <Scissors className="mr-2 h-4 w-4" />
                  Servicios
                </Button>
                <Button
                  variant={tab === "products" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTab("products")}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Productos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={
                    tab === "services" ? "Buscar servicio…" : "Buscar producto…"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar en el catálogo"
                />
              </div>

              <div className="grid max-h-[24rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {tab === "services" ? (
                  services.isPending ? (
                    <CatalogSkeleton />
                  ) : (services.data ?? []).length === 0 ? (
                    <EmptyCatalog label="No hay servicios activos." />
                  ) : (
                    (services.data ?? []).map((service) => (
                      <CatalogButton
                        key={service.id}
                        title={service.name}
                        priceCents={service.price_cents}
                        onClick={() => addLine(lineFromService(service))}
                      />
                    ))
                  )
                ) : products.isPending ? (
                  <CatalogSkeleton />
                ) : (products.data ?? []).length === 0 ? (
                  <EmptyCatalog label="No hay productos activos." />
                ) : (
                  (products.data ?? []).map((product) => (
                    <CatalogButton
                      key={product.id}
                      title={product.name}
                      priceCents={product.price_cents}
                      onClick={() => addLine(lineFromProduct(product))}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Ticket ────────────────────────────────────────────────────── */}
        <Card className="lg:sticky lg:top-6 lg:h-fit">
          <CardHeader className="pb-3">
            <CardTitle>Ticket</CardTitle>
            {context !== null ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <CalendarClock className="h-3 w-3" />
                  {context.label}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Quitar cita del ticket"
                  onClick={() => setContext(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <CardDescription>Venta libre</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Añade servicios o productos al ticket.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
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
              size="sm"
              className="justify-start"
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
              aria-label="Nota del ticket"
            />

            <dl className="grid gap-1 border-t pt-3 text-sm">
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
              <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(totals.totalCents)}</dd>
              </div>
            </dl>

            <Button
              size="lg"
              disabled={!canCharge}
              onClick={() => setPayOpen(true)}
            >
              Cobrar {formatMoney(totals.totalCents)}
            </Button>
          </CardContent>
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
          if (!open) setReceipt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Venta registrada
            </DialogTitle>
            <DialogDescription>
              Se han registrado {receipt?.lineCount} línea(s) y{" "}
              {receipt?.tenderCount} cobro(s).
            </DialogDescription>
          </DialogHeader>
          {receipt !== null ? (
            <dl className="grid gap-1 rounded-md bg-muted p-3 text-sm">
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
              <div className="flex justify-between font-semibold">
                <dt>Total cobrado</dt>
                <dd className="tabular-nums">
                  {formatMoney(receipt.totalCents)}
                </dd>
              </div>
            </dl>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setReceipt(null)}>Nueva venta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

/** Botón de un ítem del catálogo (servicio o producto). */
function CatalogButton({
  title,
  priceCents,
  onClick,
}: {
  title: string;
  priceCents: number;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-20 flex-col items-start justify-between rounded-md border p-2 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="line-clamp-2 text-xs font-medium">{title}</span>
      <span className="text-sm font-semibold tabular-nums">
        {formatMoney(priceCents)}
      </span>
    </button>
  );
}

function CatalogSkeleton(): React.ReactElement {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </>
  );
}

function EmptyCatalog({ label }: { label: string }): React.ReactElement {
  return (
    <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
      {label}
    </p>
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
    return <Skeleton className="h-10 w-full" />;
  }
  if (appointments.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Desde cita:</span>
      {appointments.map((appt) => (
        <Button
          key={appt.id}
          variant={activeId === appt.id ? "default" : "outline"}
          size="sm"
          onClick={() => onPick(appt)}
        >
          <CalendarClock className="mr-2 h-4 w-4" />
          {formatTimeInZone(appt.starts_at, timezone)} ·{" "}
          {appt.customer?.full_name ?? "Cliente"}
        </Button>
      ))}
    </div>
  );
}

/** Una fila editable del ticket. */
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

  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-start justify-between gap-2">
        {line.kind === "manual" ? (
          <Input
            value={line.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Concepto"
            className="h-8"
            aria-label="Concepto"
          />
        ) : (
          <span className="text-sm font-medium">{line.description}</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={`Quitar ${line.description || "línea"}`}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          value={line.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          className="h-8 w-14 text-center tabular-nums"
          aria-label="Cantidad"
        />
        <span className="text-muted-foreground">×</span>
        <Input
          inputMode="decimal"
          value={line.unitPrice}
          onChange={(e) => onChange({ unitPrice: e.target.value })}
          placeholder="0,00"
          className="h-8 w-20 text-right tabular-nums"
          aria-label="Precio unitario"
        />
        <Select
          value={line.vatRate}
          onValueChange={(value) => onChange({ vatRate: value })}
        >
          <SelectTrigger className="h-8 w-20" aria-label="IVA">
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
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {formatMoney(lineTotalCents)}
        </span>
      </div>
    </li>
  );
}
