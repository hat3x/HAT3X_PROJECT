"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Coins, Plus, Trash2 } from "lucide-react";

import {
  centsToEuroInput,
  parseEuroToCents,
  type TenderDraft,
} from "@/app/(dashboard)/tpv/cart";
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
import type { PosPaymentMethod, PosPaymentMethodRow } from "@/types/database";

/** Métodos base cuando el salón no tiene catálogo `pos_payment_methods`. */
const BASE_METHODS: { method: PosPaymentMethod; label: string }[] = [
  { method: "efectivo", label: "Efectivo" },
  { method: "tarjeta", label: "Tarjeta" },
  { method: "bizum", label: "Bizum" },
  { method: "transferencia", label: "Transferencia" },
  { method: "otro", label: "Otro" },
];

/** Una opción del selector de método: mapea a un `method` base + id de catálogo. */
interface MethodOption {
  value: string; // clave del <Select>
  label: string;
  method: PosPaymentMethod;
  paymentMethodId: string | null;
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalCents: number;
  paymentMethods: PosPaymentMethodRow[];
  pending: boolean;
  error: string | null;
  onConfirm: (tenders: TenderDraft[]) => void;
}

/**
 * Diálogo de cobro: reparte el total del ticket en uno o varios medios de pago
 * (varios = pago mixto). No cobra nada real; produce los `TenderDraft` que la
 * capa de pagos validará y convertirá en filas de `pos_payments`.
 */
export function PaymentDialog({
  open,
  onOpenChange,
  totalCents,
  paymentMethods,
  pending,
  error,
  onConfirm,
}: PaymentDialogProps): React.ReactElement {
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

  // Un único tender que cubre todo el total al abrir el diálogo.
  const [tenders, setTenders] = useState<
    (TenderDraft & { optionValue: string })[]
  >(() => [
    {
      optionValue: firstOption.value,
      method: firstOption.method,
      paymentMethodId: firstOption.paymentMethodId,
      amount: centsToEuroInput(totalCents),
    },
  ]);

  const paidCents = tenders.reduce(
    (acc, t) => acc + (parseEuroToCents(t.amount) ?? 0),
    0,
  );
  const remainingCents = totalCents - paidCents;
  const covered = remainingCents === 0 && totalCents > 0;

  function updateTender(
    index: number,
    patch: Partial<TenderDraft & { optionValue: string }>,
  ): void {
    setTenders((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  }

  function chooseMethod(index: number, optionValue: string): void {
    const option = options.find((o) => o.value === optionValue);
    if (option === undefined) return;
    updateTender(index, {
      optionValue,
      method: option.method,
      paymentMethodId: option.paymentMethodId,
    });
  }

  function addTender(): void {
    // El nuevo medio arranca con el importe pendiente (si lo hay).
    const pendingAmount =
      remainingCents > 0 ? centsToEuroInput(remainingCents) : "";
    setTenders((prev) => [
      ...prev,
      {
        optionValue: firstOption.value,
        method: firstOption.method,
        paymentMethodId: firstOption.paymentMethodId,
        amount: pendingAmount,
      },
    ]);
  }

  function removeTender(index: number): void {
    setTenders((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm(): void {
    onConfirm(
      tenders.map(({ method, amount, paymentMethodId }) => ({
        method,
        amount,
        paymentMethodId,
      })),
    );
  }

  // Estado del reparto: cuadrado, falta por cobrar o cambio a devolver.
  const status: "settled" | "due" | "change" =
    remainingCents === 0 ? "settled" : remainingCents > 0 ? "due" : "change";

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
          {tenders.map((tender, index) => (
            <div
              key={index}
              className="flex items-end gap-2 rounded-xl border border-border/70 bg-muted/30 p-3"
            >
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor={`method-${index}`} className="text-xs">
                  Medio de pago
                </Label>
                <Select
                  value={tender.optionValue}
                  onValueChange={(value) => chooseMethod(index, value)}
                >
                  <SelectTrigger id={`method-${index}`} className="h-11">
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
                <Label htmlFor={`amount-${index}`} className="text-xs">
                  Importe (€)
                </Label>
                <Input
                  id={`amount-${index}`}
                  inputMode="decimal"
                  value={tender.amount}
                  onChange={(e) => updateTender(index, { amount: e.target.value })}
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
                disabled={tenders.length === 1}
                onClick={() => removeTender(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="h-10 justify-start rounded-lg"
            onClick={addTender}
          >
            <Plus className="mr-2 h-4 w-4" />
            Añadir otro medio de pago
          </Button>

          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
              status === "settled"
                ? "border-success/25 bg-success/10 text-success"
                : status === "change"
                  ? "border-info/25 bg-info/10 text-info"
                  : "border-warning/30 bg-warning/10 text-warning"
            }`}
          >
            <span className="inline-flex items-center gap-2 font-medium">
              {status === "settled" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : status === "change" ? (
                <Coins className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {status === "settled"
                ? "Cobro cuadrado"
                : status === "due"
                  ? "Falta por cobrar"
                  : "Cambio a devolver"}
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
