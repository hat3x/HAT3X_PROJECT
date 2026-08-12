"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Undo2,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCancelOrthoPaymentPlan,
  useCreateOrthoPaymentPlan,
  useOrthoPaymentPlan,
  usePayInstallment,
  useUnpayInstallment,
} from "@/hooks/use-ortho-payments";
import {
  computeInstallmentSchedule,
  computePlanBalance,
  isOverdue,
  ORTHO_PAYMENT_METHOD_LABELS,
  type OrthoInstallmentStatus,
  type OrthoPaymentMethod,
  type ScheduledInstallment,
} from "@/lib/dental/ortho-payments";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrthoInstallment, OrthoPaymentPlan } from "@/types/database";

// ---------------------------------------------------------------------------
// OrthoPaymentPlanCard — plan de pago a plazos del tratamiento de ortodoncia.
// Componente CLIENTE (no importa de "@/lib/salon"; recibe `salonId` por prop,
// resuelto en el page servidor). Dos estados excluyentes según haya o no un
// plan "activo" para el paciente: formulario de creación (con previsualización
// del calendario) o panel del plan activo (saldo + tabla de cuotas + cobro).
// Mismo patrón de mutaciones "una por fila" que `ConsentList` / `PrescriptionList`.
// ---------------------------------------------------------------------------

export interface OrthoPaymentPlanCardProps {
  salonId: string;
  customerId: string;
}

function eurosToCents(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convención de fecha del módulo dental (igual que ConsentList/PrescriptionList). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function OrthoPaymentPlanCard({
  salonId,
  customerId,
}: OrthoPaymentPlanCardProps): React.ReactElement {
  const planQuery = useOrthoPaymentPlan(salonId, customerId);
  const createPlan = useCreateOrthoPaymentPlan(salonId, customerId);
  const payMut = usePayInstallment(salonId, customerId);
  const unpayMut = useUnpayInstallment(salonId, customerId);
  const cancelMut = useCancelOrthoPaymentPlan(salonId, customerId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wallet className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
        </span>
        <div>
          <CardTitle className="text-xl">Plan de pago</CardTitle>
          <p className="text-sm text-muted-foreground">
            Financiación del tratamiento en cuotas mensuales.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {planQuery.isPending ? (
          <PlanSkeleton />
        ) : planQuery.isError ? (
          <PlanError
            message={
              planQuery.error instanceof Error
                ? planQuery.error.message
                : "No se pudo cargar el plan de pago."
            }
            onRetry={() => void planQuery.refetch()}
          />
        ) : planQuery.data ? (
          <ActivePlan
            plan={planQuery.data.plan}
            installments={planQuery.data.installments}
            // `mutateAsync` (no `mutate`): cada acción resuelve/rechaza su propia
            // promesa, así `ActivePlan` puede enganchar éxito/error POR LLAMADA
            // (cerrar diálogo, mostrar error) en vez de depender del estado
            // compartido de la mutación (que persiste entre filas/aperturas) o
            // del siguiente refetch. Ver fix round 1 en task-7-report.md.
            onPay={(installmentId, method) =>
              payMut.mutateAsync({ installmentId, input: { method } })
            }
            onUnpay={(id) => unpayMut.mutateAsync(id)}
            onCancel={(planId) => cancelMut.mutateAsync(planId)}
            payPending={payMut.isPending}
            unpayPending={unpayMut.isPending}
            cancelPending={cancelMut.isPending}
          />
        ) : (
          <NewPlanForm
            onCreate={(input) => createPlan.mutate(input)}
            creating={createPlan.isPending}
            error={createPlan.isError ? (createPlan.error as Error).message : null}
          />
        )}
      </CardContent>
    </Card>
  );
}

// --- Loading / error --------------------------------------------------------

function PlanSkeleton(): React.ReactElement {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Cargando plan de pago…</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-2.5 w-full rounded-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

function PlanError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 px-4 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">No se pudo cargar el plan de pago</p>
      <p className="max-w-[32ch] text-xs text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

// --- Sin plan: formulario de creación ---------------------------------------

interface NewPlanInput {
  totalCents: number;
  downPaymentCents: number;
  installmentCount: number;
  dayOfMonth: number;
  startDate: string;
  notes: string | null;
}

function NewPlanForm({
  onCreate,
  creating,
  error,
}: {
  onCreate: (input: NewPlanInput) => void;
  creating: boolean;
  error: string | null;
}): React.ReactElement {
  const [total, setTotal] = useState("");
  const [down, setDown] = useState("");
  const [count, setCount] = useState("");
  const [day, setDay] = useState("1");
  const [start, setStart] = useState(todayIso());

  const preview = useMemo<ScheduledInstallment[] | null>(() => {
    const totalCents = eurosToCents(total);
    const downPaymentCents = eurosToCents(down);
    const installmentCount = Number(count);
    const dayOfMonth = Number(day);
    if (
      totalCents <= 0 ||
      downPaymentCents < 0 ||
      downPaymentCents > totalCents ||
      !Number.isInteger(installmentCount) ||
      installmentCount < 1 ||
      installmentCount > 120 ||
      !Number.isInteger(dayOfMonth) ||
      dayOfMonth < 1 ||
      dayOfMonth > 31 ||
      totalCents - downPaymentCents < installmentCount ||
      start.trim() === ""
    ) {
      return null;
    }
    return computeInstallmentSchedule({
      totalCents,
      downPaymentCents,
      installmentCount,
      dayOfMonth,
      startDate: start,
    });
  }, [total, down, count, day, start]);

  // Pista de por qué no hay previsualización todavía; solo una vez el usuario
  // ha empezado a rellenar el formulario (no molesta con el formulario vacío).
  const validationHint = useMemo(() => {
    if (total.trim() === "" && count.trim() === "") return null;
    const totalCents = eurosToCents(total);
    const downPaymentCents = eurosToCents(down);
    const installmentCount = Number(count);
    const dayOfMonth = Number(day);
    if (totalCents <= 0) return "Introduce el total del tratamiento.";
    if (downPaymentCents > totalCents) return "La entrada no puede superar el total.";
    if (!Number.isInteger(installmentCount) || installmentCount < 1) {
      return "Indica un número de cuotas válido (mínimo 1).";
    }
    if (installmentCount > 120) {
      return "Máximo 120 cuotas.";
    }
    if (totalCents - downPaymentCents < installmentCount) {
      return "El importe a financiar es menor que el número de cuotas: sube el total, baja la entrada o reduce las cuotas.";
    }
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return "El día de cobro debe estar entre 1 y 31.";
    }
    return null;
  }, [total, down, count, day]);

  function submit(): void {
    if (preview === null) return;
    onCreate({
      totalCents: eurosToCents(total),
      downPaymentCents: eurosToCents(down),
      installmentCount: Number(count),
      dayOfMonth: Number(day),
      startDate: start,
      notes: null,
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Configura el total, la entrada y el número de cuotas. Verás la vista previa del
        calendario antes de crear el plan.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField id="ortho-total" label="Total del tratamiento" required value={total} onChange={setTotal} />
        <MoneyField id="ortho-down" label="Entrada (pago inicial)" value={down} onChange={setDown} />
        <div className="space-y-1.5">
          <Label htmlFor="ortho-count">
            Nº de cuotas <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ortho-count"
            type="number"
            min={1}
            max={120}
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ortho-day">
            Día de cobro <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ortho-day"
            type="number"
            min={1}
            max={31}
            inputMode="numeric"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Se ajusta automáticamente en meses cortos.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ortho-start">
            Fecha de inicio <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ortho-start"
            type="date"
            className="sm:max-w-xs"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
      </div>

      {preview !== null ? (
        <SchedulePreview schedule={preview} />
      ) : (
        validationHint !== null && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {validationHint}
          </p>
        )
      )}

      {error !== null && (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <Button type="button" className="gap-1.5" onClick={submit} disabled={creating || preview === null}>
        {creating ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Wallet className="h-4 w-4" aria-hidden="true" />
        )}
        {creating ? "Creando…" : "Crear plan de pago"}
      </Button>
    </div>
  );
}

/** Campo de importe en euros con sufijo "€" visible dentro del input. */
function MoneyField({
  id,
  label,
  value,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          placeholder="0,00"
          className="pr-8 text-right tabular-nums"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          €
        </span>
      </div>
    </div>
  );
}

/** Previsualización del calendario de cobro antes de confirmar la creación del plan. */
function SchedulePreview({ schedule }: { schedule: ScheduledInstallment[] }): React.ReactElement {
  const total = schedule.reduce((acc, s) => acc + s.amountCents, 0);
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/50 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          Vista previa del calendario
        </p>
        <p className="text-xs text-muted-foreground">
          {schedule.length} pago{schedule.length !== 1 ? "s" : ""}
        </p>
      </div>
      <ul className="max-h-52 divide-y divide-border/60 overflow-y-auto">
        {schedule.map((item) => (
          <li
            key={item.seq}
            className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
          >
            <span className="text-foreground">
              {item.seq === 0 ? "Entrada" : `Cuota ${item.seq}`}
            </span>
            <span className="tabular-nums text-muted-foreground">{formatDate(item.dueDate)}</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatMoney(item.amountCents, "EUR")}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-border/70 bg-muted/50 px-4 py-2.5 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatMoney(total, "EUR")}</span>
      </div>
    </div>
  );
}

// --- Plan activo -------------------------------------------------------------

function ActivePlan({
  plan,
  installments,
  onPay,
  onUnpay,
  onCancel,
  payPending,
  unpayPending,
  cancelPending,
}: {
  plan: OrthoPaymentPlan;
  installments: readonly OrthoInstallment[];
  // `Promise<unknown>` (no `void`): cada acción resuelve/rechaza para poder
  // enganchar éxito (cerrar diálogo) y error (mostrarlo) POR LLAMADA, en vez de
  // leer el estado compartido de la mutación (persiste entre filas/aperturas)
  // o esperar al siguiente refetch. Mismo espíritu que `ConsentList`, que
  // resetea su error local antes de cada `.mutate()` y lo fija en `onError`.
  onPay: (installmentId: string, method: OrthoPaymentMethod) => Promise<unknown>;
  onUnpay: (installmentId: string) => Promise<unknown>;
  onCancel: (planId: string) => Promise<unknown>;
  payPending: boolean;
  unpayPending: boolean;
  cancelPending: boolean;
}): React.ReactElement {
  const today = todayIso();
  const balance = useMemo(
    () =>
      computePlanBalance(
        installments.map((i) => ({
          status: i.status,
          dueDate: i.due_date,
          amountCents: i.amount_cents,
          paidAmountCents: i.paid_amount_cents,
        })),
        today,
      ),
    [installments, today],
  );

  // Cobrar: diálogo con su propio error, reseteado cada vez que se abre para
  // una cuota (evita mostrar el error de un cobro anterior al reabrir).
  const [payTarget, setPayTarget] = useState<OrthoInstallment | null>(null);
  const [payMethod, setPayMethod] = useState<OrthoPaymentMethod>("efectivo");
  const [payDialogError, setPayDialogError] = useState<string | null>(null);

  // Deshacer: sin diálogo (acción directa), error propio mostrado arriba de la tabla.
  const [unpayError, setUnpayError] = useState<string | null>(null);

  // Cancelar plan: diálogo con su propio error, reseteado al abrir.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function openPayDialog(installment: OrthoInstallment): void {
    setPayMethod("efectivo");
    setPayDialogError(null);
    setPayTarget(installment);
  }

  function handleConfirmPay(): void {
    if (payTarget === null) return;
    setPayDialogError(null);
    onPay(payTarget.id, payMethod)
      .then(() => setPayTarget(null))
      .catch((err: unknown) => {
        setPayDialogError(err instanceof Error ? err.message : "No se pudo cobrar la cuota.");
      });
  }

  function handleUnpay(installmentId: string): void {
    setUnpayError(null);
    onUnpay(installmentId).catch((err: unknown) => {
      setUnpayError(err instanceof Error ? err.message : "No se pudo deshacer el cobro.");
    });
  }

  function openCancelDialog(): void {
    setCancelError(null);
    setConfirmCancel(true);
  }

  function handleConfirmCancel(): void {
    setCancelError(null);
    onCancel(plan.id).catch((err: unknown) => {
      setCancelError(err instanceof Error ? err.message : "No se pudo cancelar el plan.");
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BalanceStat label="Total" value={formatMoney(plan.total_cents, plan.currency)} />
        <BalanceStat
          label="Pagado"
          value={formatMoney(balance.paidCents, plan.currency)}
          valueClassName="text-success"
        />
        <BalanceStat label="Pendiente" value={formatMoney(balance.pendingCents, plan.currency)} />
        <BalanceStat
          label="Vencidas"
          value={
            balance.overdueCount > 0
              ? `${balance.overdueCount} cuota${balance.overdueCount !== 1 ? "s" : ""}`
              : "Al día"
          }
          valueClassName={balance.overdueCount > 0 ? "text-destructive" : "text-success"}
          className={balance.overdueCount > 0 ? "border-destructive/30 bg-destructive/5" : undefined}
        />
      </div>

      <PaymentProgress paidCents={balance.paidCents} totalCents={plan.total_cents} />

      {unpayError !== null && (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {unpayError}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border/70">
        <Table scrollRegionLabel="Cuotas del plan de pago">
          <TableCaption className="sr-only">
            Cuotas del plan de pago: entrada y cuotas mensuales, con fecha, importe y estado.
          </TableCaption>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Cuota</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {installments.map((i) => {
              const overdue = isOverdue({ status: i.status, dueDate: i.due_date }, today);
              return (
                <TableRow
                  key={i.id}
                  className={overdue ? "bg-destructive/5 hover:bg-destructive/10" : undefined}
                >
                  <TableCell className="font-medium">
                    {i.seq === 0 ? "Entrada" : `Cuota ${i.seq}`}
                  </TableCell>
                  <TableCell
                    className={cn("tabular-nums", overdue ? "text-destructive" : "text-muted-foreground")}
                  >
                    {formatDate(i.due_date)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(i.amount_cents, plan.currency)}
                  </TableCell>
                  <TableCell>
                    <InstallmentStatusBadge status={i.status} overdue={overdue} />
                  </TableCell>
                  <TableCell className="text-right">
                    {i.status === "pagada" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                        disabled={unpayPending}
                        onClick={() => handleUnpay(i.id)}
                      >
                        {unpayPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Deshacer
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={payPending}
                        onClick={() => openPayDialog(i)}
                      >
                        Cobrar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
        <p className="text-xs text-muted-foreground">
          Métodos de cobro: {Object.values(ORTHO_PAYMENT_METHOD_LABELS).join(" · ")}.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={cancelPending}
          onClick={openCancelDialog}
        >
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          Cancelar plan
        </Button>
      </div>

      {/* Diálogo de cobro: elige método antes de confirmar (mejora sobre la referencia). */}
      <Dialog
        open={payTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPayTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrar cuota</DialogTitle>
            <DialogDescription>
              {payTarget !== null &&
                `${payTarget.seq === 0 ? "Entrada" : `Cuota ${payTarget.seq}`} · vence el ${formatDate(payTarget.due_date)}`}
            </DialogDescription>
          </DialogHeader>

          {payTarget !== null && (
            <>
              <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Importe a cobrar
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {formatMoney(payTarget.amount_cents, plan.currency)}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ortho-pay-method">Método de pago</Label>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as OrthoPaymentMethod)}>
                  <SelectTrigger id="ortho-pay-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ORTHO_PAYMENT_METHOD_LABELS) as OrthoPaymentMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {ORTHO_PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {payDialogError !== null && (
                <p
                  role="alert"
                  className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {payDialogError}
                </p>
              )}
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPayTarget(null)}
              disabled={payPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={payPending || payTarget === null}
              onClick={handleConfirmPay}
            >
              {payPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              {payPending ? "Cobrando…" : "Confirmar cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de cancelación (acción destructiva). */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Ban className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle>¿Cancelar el plan de pago?</DialogTitle>
            <DialogDescription>
              {balance.pendingCents > 0
                ? `Quedan ${formatMoney(balance.pendingCents, plan.currency)} pendientes. `
                : ""}
              El histórico de cuotas se conserva, pero no podrás cobrar cuotas de este plan desde
              aquí una vez cancelado.
            </DialogDescription>
          </DialogHeader>

          {cancelError !== null && (
            <p
              role="alert"
              className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {cancelError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmCancel(false)}
              disabled={cancelPending}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5"
              disabled={cancelPending}
              onClick={handleConfirmCancel}
            >
              {cancelPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Ban className="h-4 w-4" aria-hidden="true" />
              )}
              {cancelPending ? "Cancelando…" : "Sí, cancelar plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BalanceStat({
  label,
  value,
  valueClassName,
  className,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("rounded-lg border border-border/70 bg-muted/30 p-3", className)}>
      <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums text-foreground", valueClassName)}>
        {value}
      </p>
    </div>
  );
}

/** Barra de progreso pagado/total, animada, con rol ARIA de progressbar. */
function PaymentProgress({
  paidCents,
  totalCents,
}: {
  paidCents: number;
  totalCents: number;
}): React.ReactElement {
  const pct = totalCents > 0 ? Math.min(100, Math.round((paidCents / totalCents) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progreso de cobro</span>
        <span className="font-medium tabular-nums text-foreground">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso de cobro del plan de pago"
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-300 ease-apple-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function InstallmentStatusBadge({
  status,
  overdue,
}: {
  status: OrthoInstallmentStatus;
  overdue: boolean;
}): React.ReactElement {
  if (status === "pagada") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Pagada
      </Badge>
    );
  }
  if (overdue) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Vencida
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      Pendiente
    </Badge>
  );
}
