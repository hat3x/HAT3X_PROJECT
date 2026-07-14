"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Lock,
  LockOpen,
  Receipt,
  ScrollText,
  Wallet,
} from "lucide-react";

import type { CloseSessionReceipt } from "@/app/(dashboard)/arqueo/actions";
import {
  aggregateByMethod,
  computeCashVariance,
  computeExpectedCash,
  METHOD_LABEL,
  sumAllPayments,
  sumCashPayments,
} from "@/app/(dashboard)/arqueo/session-totals";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useCloseSession,
  useOpenSession,
  useOpenSessionMutation,
  useRecentSessions,
  useSessionActivity,
} from "@/hooks/use-sessions";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { PosSession } from "@/types/database";

/** Euros como texto ("50,00"/"50.00") → céntimos, o `null` si no es válido. */
function parseEuroToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number.parseFloat(trimmed.replace(",", ".")) * 100);
}

interface ArqueoViewProps {
  salonId: string;
}

/**
 * Pantalla de arqueo de caja: si no hay caja abierta, ofrece abrirla (fondo
 * inicial); si la hay, muestra los totales vivos por método, el efectivo
 * esperado y un formulario de cierre que previsualiza el descuadre antes de
 * arquear. Debajo, el historial de los últimos arqueos cerrados.
 */
export function ArqueoView({ salonId }: ArqueoViewProps): React.ReactElement {
  const openSession = useOpenSession(salonId);
  const recent = useRecentSessions(salonId);
  const [receipt, setReceipt] = useState<CloseSessionReceipt | null>(null);

  return (
    <main className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Arqueo de caja</h1>
        <p className="text-muted-foreground">
          Abre la caja al empezar el día y ciérrala para cuadrar el efectivo.
        </p>
      </div>

      {openSession.isPending ? (
        <Skeleton className="h-64 w-full max-w-2xl" />
      ) : openSession.data !== null && openSession.data !== undefined ? (
        <OpenSessionPanel
          salonId={salonId}
          session={openSession.data}
          onClosed={setReceipt}
        />
      ) : (
        <OpenCashPanel salonId={salonId} />
      )}

      <RecentSessions
        sessions={recent.data ?? []}
        loading={recent.isPending}
      />

      {/* Informe de arqueo tras el cierre */}
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
              Caja cerrada
            </DialogTitle>
            <DialogDescription>
              Resumen del arqueo. Queda registrado en el historial.
            </DialogDescription>
          </DialogHeader>
          {receipt !== null ? (
            <dl className="grid gap-1 rounded-md bg-muted p-3 text-sm">
              <Row label="Fondo inicial" cents={receipt.openingFloatCents} muted />
              <Row label="Total cobrado" cents={receipt.totalTakingsCents} muted />
              <Row
                label="Efectivo esperado"
                cents={receipt.expectedCashCents}
                muted
              />
              <Row
                label="Efectivo contado"
                cents={receipt.countedCashCents}
                muted
              />
              <VarianceRow cents={receipt.cashVarianceCents} />
            </dl>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setReceipt(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ── Panel: no hay caja abierta → abrir ──────────────────────────────────────

function OpenCashPanel({ salonId }: { salonId: string }): React.ReactElement {
  const mutation = useOpenSessionMutation(salonId);
  const [openingFloat, setOpeningFloat] = useState("");
  const [notes, setNotes] = useState("");

  const floatCents = parseEuroToCents(openingFloat);
  const canOpen = floatCents !== null;

  function submit(): void {
    mutation.mutate({
      openingFloat,
      notes: notes.trim() === "" ? undefined : notes.trim(),
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockOpen className="h-5 w-5" />
          Abrir caja
        </CardTitle>
        <CardDescription>
          No hay ninguna caja abierta. Indica el fondo inicial (efectivo con el
          que arranca el cajón) para empezar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="opening-float">Fondo de caja (€)</Label>
          <Input
            id="opening-float"
            inputMode="decimal"
            placeholder="0,00"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            className="max-w-[12rem] text-right tabular-nums"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="opening-notes">Nota (opcional)</Label>
          <Textarea
            id="opening-notes"
            rows={2}
            placeholder="Turno, cajero, incidencia…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {mutation.error instanceof Error ? (
          <p className="text-sm text-destructive" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
        <Button
          onClick={submit}
          disabled={!canOpen || mutation.isPending}
          className="self-start"
        >
          {mutation.isPending ? "Abriendo…" : "Abrir caja"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Panel: caja abierta → totales vivos + cierre ────────────────────────────

function OpenSessionPanel({
  salonId,
  session,
  onClosed,
}: {
  salonId: string;
  session: PosSession;
  onClosed: (receipt: CloseSessionReceipt) => void;
}): React.ReactElement {
  const activity = useSessionActivity(salonId, session.id);
  const closeMutation = useCloseSession(salonId);

  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const payments = activity.data?.payments ?? [];
  const byMethod = useMemo(() => aggregateByMethod(payments), [payments]);
  const totalTakings = sumAllPayments(payments);
  const cashTakings = sumCashPayments(payments);
  const expectedCash = computeExpectedCash(
    session.opening_float_cents,
    cashTakings,
  );

  const countedCents = parseEuroToCents(countedCash);
  const variance =
    countedCents !== null
      ? computeCashVariance(countedCents, expectedCash)
      : null;
  const canClose = countedCents !== null;

  function confirmClose(): void {
    closeMutation.mutate(
      {
        sessionId: session.id,
        countedCash,
        notes: notes.trim() === "" ? undefined : notes.trim(),
      },
      {
        onSuccess: (receipt) => {
          setConfirmOpen(false);
          onClosed(receipt);
        },
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      {/* Totales vivos por método */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Caja abierta
            </CardTitle>
            <Badge variant="secondary" className="gap-1">
              <Receipt className="h-3 w-3" />
              {activity.data?.salesCount ?? 0} venta(s)
            </Badge>
          </div>
          <CardDescription>
            Abierta {formatDateTime(session.opened_at)} · fondo{" "}
            {formatMoney(session.opening_float_cents)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <dl className="grid gap-1 text-sm">
                {byMethod.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground">
                    Aún no hay cobros en esta caja.
                  </p>
                ) : (
                  byMethod.map((entry) => (
                    <div
                      key={entry.method}
                      className="flex justify-between text-muted-foreground"
                    >
                      <dt>{METHOD_LABEL[entry.method]}</dt>
                      <dd className="tabular-nums">
                        {formatMoney(entry.amountCents)}
                      </dd>
                    </div>
                  ))
                )}
                <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
                  <dt>Total cobrado</dt>
                  <dd className="tabular-nums">{formatMoney(totalTakings)}</dd>
                </div>
              </dl>

              <dl className="mt-4 grid gap-1 rounded-md bg-muted p-3 text-sm">
                <Row label="Fondo inicial" cents={session.opening_float_cents} muted />
                <Row label="Efectivo cobrado" cents={cashTakings} muted />
                <div className="mt-1 flex items-center justify-between border-t pt-2 font-semibold">
                  <dt className="flex items-center gap-1.5">
                    <Coins className="h-4 w-4" />
                    Efectivo esperado
                  </dt>
                  <dd className="tabular-nums">{formatMoney(expectedCash)}</dd>
                </div>
              </dl>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cierre / arqueo */}
      <Card className="lg:sticky lg:top-6 lg:h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Cerrar caja
          </CardTitle>
          <CardDescription>
            Cuenta el efectivo del cajón e introdúcelo para cuadrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="counted-cash">Efectivo contado (€)</Label>
            <Input
              id="counted-cash"
              inputMode="decimal"
              placeholder="0,00"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              className="text-right tabular-nums"
            />
          </div>

          {variance !== null ? (
            <dl className="grid gap-1 rounded-md border p-3 text-sm">
              <Row label="Esperado" cents={expectedCash} muted />
              <Row label="Contado" cents={countedCents!} muted />
              <VarianceRow cents={variance} />
            </dl>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="closing-notes">Nota (opcional)</Label>
            <Textarea
              id="closing-notes"
              rows={2}
              placeholder="Justificación del descuadre, incidencias…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            size="lg"
            disabled={!canClose}
            onClick={() => setConfirmOpen(true)}
          >
            Cerrar y arquear
          </Button>
        </CardContent>
      </Card>

      {/* Confirmación de cierre */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar cierre de caja</DialogTitle>
            <DialogDescription>
              El cierre es definitivo: la sesión quedará arqueada con este
              descuadre. Revisa las cifras antes de continuar.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-1 rounded-md bg-muted p-3 text-sm">
            <Row label="Total cobrado" cents={totalTakings} muted />
            <Row label="Efectivo esperado" cents={expectedCash} muted />
            <Row label="Efectivo contado" cents={countedCents ?? 0} muted />
            {variance !== null ? <VarianceRow cents={variance} /> : null}
          </dl>
          {closeMutation.error instanceof Error ? (
            <p className="text-sm text-destructive" role="alert">
              {closeMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={closeMutation.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={confirmClose} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? "Cerrando…" : "Confirmar cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Historial de arqueos ────────────────────────────────────────────────────

function RecentSessions({
  sessions,
  loading,
}: {
  sessions: PosSession[];
  loading: boolean;
}): React.ReactElement {
  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <ScrollText className="h-5 w-5" />
        Historial de arqueos
      </h2>
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : sessions.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Todavía no hay arqueos cerrados.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cierre</TableHead>
                <TableHead className="text-right">Fondo</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead className="text-right">Descuadre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    {session.closed_at !== null
                      ? formatDateTime(session.closed_at)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(session.opening_float_cents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {session.expected_cash_cents !== null
                      ? formatMoney(session.expected_cash_cents)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {session.counted_cash_cents !== null
                      ? formatMoney(session.counted_cash_cents)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <VarianceBadge cents={session.cash_variance_cents} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

// ── Piezas compartidas ──────────────────────────────────────────────────────

/** Fila importe simple de una `<dl>`. */
function Row({
  label,
  cents,
  muted,
}: {
  label: string;
  cents: number;
  muted?: boolean;
}): React.ReactElement {
  return (
    <div
      className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatMoney(cents)}</dd>
    </div>
  );
}

/** Fila de descuadre resaltada (color según signo). */
function VarianceRow({ cents }: { cents: number }): React.ReactElement {
  const tone =
    cents === 0
      ? "text-primary"
      : cents < 0
        ? "text-destructive"
        : "text-amber-600 dark:text-amber-500";
  return (
    <div className="mt-1 flex items-center justify-between border-t pt-2 font-semibold">
      <dt className="flex items-center gap-1.5">
        {cents !== 0 ? <AlertTriangle className="h-4 w-4" /> : null}
        Descuadre
      </dt>
      <dd className={`tabular-nums ${tone}`}>{formatMoney(cents)}</dd>
    </div>
  );
}

/** Descuadre como badge para la tabla de historial. */
function VarianceBadge({
  cents,
}: {
  cents: number | null;
}): React.ReactElement {
  if (cents === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (cents === 0) {
    return <Badge variant="secondary">Cuadra</Badge>;
  }
  return (
    <Badge variant={cents < 0 ? "destructive" : "outline"}>
      {formatMoney(cents)}
    </Badge>
  );
}
