"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Coins, Plus, Trash2 } from "lucide-react";

import { centsToEuroInput, parseEuroToCents } from "@/app/(dashboard)/tpv/cart";
import { Button } from "@/components/ui/button";
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
import { formatMoney } from "@/lib/format";
import type { SettleTenderInput } from "@/lib/validations/order";
import type { PosPaymentMethod, PosPaymentMethodRow } from "@/types/database";

/**
 * Diálogo de cobro del mostrador (restauración): reparte el TOTAL del pedido
 * en uno o varios medios de pago, igual que `tpv/payment-dialog.tsx`. La
 * diferencia clave está en el EFECTIVO: `settleOrder` exige que
 * `Σ tenders.amountCents === totalCents` EXACTO (ver `mostrador/actions.ts`,
 * §8), así que aquí cada fila de efectivo separa "lo que entrega el cliente"
 * (`amount`, para poder calcular el cambio) de "lo que se APLICA al cobro"
 * (`amountCents` que sale hacia `onConfirm`, topado al importe pendiente). El
 * resto de medios (tarjeta, bizum…) no tienen concepto de cambio: lo tecleado
 * ES lo aplicado, igual que en el TPV.
 */

/** Métodos base cuando el salón no tiene catálogo `pos_payment_methods`. */
const BASE_METHODS: { method: PosPaymentMethod; label: string }[] = [
  { method: "efectivo", label: "Efectivo" },
  { method: "tarjeta", label: "Tarjeta" },
  { method: "bizum", label: "Bizum" },
  { method: "transferencia", label: "Transferencia" },
  { method: "otro", label: "Otro" },
];

interface MethodOption {
  value: string;
  label: string;
  method: PosPaymentMethod;
  paymentMethodId: string | null;
}

/** Una fila de cobro en edición. `amount` es lo tecleado (euros); para
 * efectivo es "lo que entrega el cliente", para el resto es lo aplicado. */
interface TenderRow {
  optionValue: string;
  method: PosPaymentMethod;
  paymentMethodId: string | null;
  amount: string;
}

interface AppliedRow {
  appliedCents: number;
  changeCents: number;
}

/**
 * Aplica cada fila, en orden, contra el importe pendiente. Para efectivo la
 * fila se topa al pendiente (el resto es cambio); para el resto, lo tecleado
 * se aplica tal cual (sin concepto de cambio, como en el TPV).
 */
function computeApplied(rows: readonly TenderRow[], totalCents: number): AppliedRow[] {
  let remaining = totalCents;
  return rows.map((row) => {
    const entered = parseEuroToCents(row.amount) ?? 0;
    if (row.method !== "efectivo") {
      remaining -= entered;
      return { appliedCents: entered, changeCents: 0 };
    }
    const applied = Math.max(0, Math.min(entered, Math.max(remaining, 0)));
    remaining -= applied;
    return { appliedCents: applied, changeCents: Math.max(0, entered - applied) };
  });
}

interface PaymentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalCents: number;
  paymentMethods: PosPaymentMethodRow[];
  pending: boolean;
  error: string | null;
  onConfirm: (tenders: SettleTenderInput[]) => void;
}

export function PaymentSheet({
  open,
  onOpenChange,
  totalCents,
  paymentMethods,
  pending,
  error,
  onConfirm,
}: PaymentSheetProps): React.ReactElement {
  const options = useMemo<MethodOption[]>(() => {
    if (paymentMethods.length > 0) {
      return paymentMethods.map((m) => ({
        value: m.id,
        label: m.name,
        method: m.kind,
        paymentMethodId: m.id,
      }));
    }
    return BASE_METHODS.map((m) => ({
      value: m.method,
      label: m.label,
      method: m.method,
      paymentMethodId: null,
    }));
  }, [paymentMethods]);

  const firstOption = options[0]!;

  // Arranca con un único tender de efectivo que cubre todo el total: el caso
  // más común (pagar justo) queda a un solo toque en "Confirmar cobro".
  const [rows, setRows] = useState<TenderRow[]>(() => [
    {
      optionValue: firstOption.value,
      method: firstOption.method,
      paymentMethodId: firstOption.paymentMethodId,
      amount: centsToEuroInput(totalCents),
    },
  ]);

  const applied = computeApplied(rows, totalCents);
  const appliedTotalCents = applied.reduce((acc, a) => acc + a.appliedCents, 0);
  const remainingCents = totalCents - appliedTotalCents;
  const covered = remainingCents === 0 && totalCents > 0;

  function updateRow(index: number, patch: Partial<TenderRow>): void {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function chooseMethod(index: number, optionValue: string): void {
    const option = options.find((o) => o.value === optionValue);
    if (option === undefined) return;
    updateRow(index, {
      optionValue,
      method: option.method,
      paymentMethodId: option.paymentMethodId,
    });
  }

  function addRow(): void {
    const pendingAmount = remainingCents > 0 ? centsToEuroInput(remainingCents) : "";
    setRows((prev) => [
      ...prev,
      {
        optionValue: firstOption.value,
        method: firstOption.method,
        paymentMethodId: firstOption.paymentMethodId,
        amount: pendingAmount,
      },
    ]);
  }

  function removeRow(index: number): void {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm(): void {
    // Filtra filas con importe aplicado <= 0 (p. ej. una fila que `addRow`
    // sembró vacía porque el resto YA estaba cubierto, o un tender a 0€
    // tecleado por error): `settleTenderSchema` exige `amountCents > 0` — un
    // tender fantasma haría que el servidor rechazase el cobro aunque el
    // AGREGADO (que es lo que vigila `covered`) sí cuadre con el total.
    const tenders: SettleTenderInput[] = rows
      .map((row, i) => ({
        method: row.method,
        amountCents: applied[i]!.appliedCents,
        paymentMethodId: row.paymentMethodId,
      }))
      .filter((tender) => tender.amountCents > 0);
    onConfirm(tenders);
  }

  const status: "settled" | "due" | "excess" =
    remainingCents === 0 ? "settled" : remainingCents > 0 ? "due" : "excess";
  const totalChangeCents = applied.reduce((acc, a) => acc + a.changeCents, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogDescription className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Importe a cobrar
          </DialogDescription>
          <DialogTitle className="text-3xl font-bold tabular-nums tracking-tight">
            {formatMoney(totalCents)}
          </DialogTitle>
          <DialogDescription>
            Reparte el total en uno o varios medios de pago.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-border/70 bg-muted/30 p-3"
            >
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor={`ms-method-${index}`} className="text-xs">
                    Medio de pago
                  </Label>
                  <Select
                    value={row.optionValue}
                    onValueChange={(value) => chooseMethod(index, value)}
                  >
                    <SelectTrigger id={`ms-method-${index}`} className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid w-28 gap-1.5">
                  <Label htmlFor={`ms-amount-${index}`} className="text-xs">
                    {row.method === "efectivo" ? "Entrega (€)" : "Importe (€)"}
                  </Label>
                  <Input
                    id={`ms-amount-${index}`}
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => updateRow(index, { amount: e.target.value })}
                    placeholder="0,00"
                    className="h-11 text-right text-base tabular-nums"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  aria-label={`Quitar medio de pago ${index + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => removeRow(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {row.method === "efectivo" && applied[index]!.changeCents > 0 ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-info">
                  <Coins className="h-3.5 w-3.5" />
                  Cambio: {formatMoney(applied[index]!.changeCents)}
                </p>
              ) : null}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="h-10 justify-start rounded-lg"
            onClick={addRow}
          >
            <Plus className="mr-2 h-4 w-4" />
            Añadir otro medio de pago
          </Button>

          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
              status === "settled"
                ? "border-success/25 bg-success/10 text-success"
                : "border-warning/30 bg-warning/10 text-warning"
            }`}
          >
            <span className="inline-flex items-center gap-2 font-medium">
              {status === "settled" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {status === "settled"
                ? totalChangeCents > 0
                  ? `Cobro cuadrado · cambio ${formatMoney(totalChangeCents)}`
                  : "Cobro cuadrado"
                : status === "due"
                  ? "Falta por cobrar"
                  : "Sobra por revisar"}
            </span>
            <span className="text-base font-bold tabular-nums">
              {formatMoney(Math.abs(remainingCents))}
            </span>
          </div>
        </div>

        {error !== null ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 font-semibold"
            disabled={!covered || pending}
            onClick={handleConfirm}
          >
            {pending ? "Registrando…" : "Confirmar cobro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
