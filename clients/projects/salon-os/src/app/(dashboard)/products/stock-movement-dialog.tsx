"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { formatDateTime } from "@/lib/format";
import { STOCK_KIND_LABELS, STOCK_MOVEMENT_KINDS, isLowStock } from "@/lib/stock";
import { useRecordMovement, useStockMovements } from "@/hooks/use-stock";
import type { Product, StockMovementKind } from "@/types/database";

// ---------------------------------------------------------------------------
// StockMovementPanel — formulario de movimiento + historial de un producto.
// Componente CLIENTE "smart": llama directamente a `useRecordMovement`
// (mutación) y `useStockMovements` (historial), igual patrón que
// `PlanDetail` (@/components/dental/plan-detail.tsx).
// ---------------------------------------------------------------------------

export interface StockMovementPanelProps {
  salonId: string;
  product: Product;
}

const EMPTY_FORM = { quantity: "", lot: "", expiry: "", note: "" };

export function StockMovementPanel({
  salonId,
  product,
}: StockMovementPanelProps): React.ReactElement {
  const [kind, setKind] = useState<StockMovementKind>("entrada");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const recordMutation = useRecordMovement(salonId);
  const movementsQuery = useStockMovements(salonId, product.id);

  const low = isLowStock(product.stock, product.min_stock);

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    const quantity = Number.parseInt(form.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setFormError("Introduce una cantidad válida (entero ≥ 0).");
      return;
    }
    if (kind !== "ajuste" && quantity === 0) {
      setFormError("La cantidad debe ser mayor que 0.");
      return;
    }

    recordMutation.mutate(
      {
        productId: product.id,
        kind,
        quantity,
        lot: kind === "entrada" && form.lot.trim() !== "" ? form.lot.trim() : null,
        expiry: kind === "entrada" && form.expiry !== "" ? form.expiry : null,
        note: form.note.trim() !== "" ? form.note.trim() : null,
      },
      {
        onSuccess: () => {
          setForm(EMPTY_FORM);
        },
        onError: (err: unknown) => {
          setFormError(err instanceof Error ? err.message : "Error al registrar el movimiento.");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {/*
          Encabezado en texto plano (no `DialogTitle` de Radix): este panel se
          testea de forma AISLADA (sin envolverlo en `Dialog`), igual patrón
          que `PlanDetail`. El `DialogTitle` accesible real lo aporta el
          wrapper `StockMovementDialog`, que sí vive dentro de un `Dialog`.
        */}
        <h2 className="text-lg font-semibold leading-none tracking-tight">
          Movimiento de stock — {product.name}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Existencias:{" "}
            <strong className="text-foreground">
              {product.stock ?? "—"} {product.unit}
            </strong>
          </span>
          <span>Mínimo: {product.min_stock}</span>
          {low ? <Badge variant="destructive">Bajo mínimo</Badge> : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="movement-kind">Tipo de movimiento</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as StockMovementKind)}>
              <SelectTrigger id="movement-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_MOVEMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {STOCK_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="movement-quantity">
              {kind === "ajuste" ? "Nuevo total" : "Cantidad"}
            </Label>
            <Input
              id="movement-quantity"
              inputMode="numeric"
              value={form.quantity}
              onChange={(e) => update("quantity", e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {kind === "entrada" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="movement-lot">Lote (opcional)</Label>
              <Input
                id="movement-lot"
                value={form.lot}
                onChange={(e) => update("lot", e.target.value)}
                placeholder="L-2026-08"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="movement-expiry">Caducidad (opcional)</Label>
              <Input
                id="movement-expiry"
                type="date"
                value={form.expiry}
                onChange={(e) => update("expiry", e.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="movement-note">Nota (opcional)</Label>
          <Textarea
            id="movement-note"
            value={form.note}
            onChange={(e) => update("note", e.target.value)}
            placeholder="Motivo, proveedor, incidencia…"
          />
        </div>

        {formError !== null ? (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="submit" disabled={recordMutation.isPending}>
            {recordMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Registrando…
              </>
            ) : (
              "Registrar movimiento"
            )}
          </Button>
        </DialogFooter>
      </form>

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Historial de movimientos</h3>
        {movementsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : movementsQuery.isError ? (
          <p className="text-sm text-destructive">
            {movementsQuery.error instanceof Error
              ? movementsQuery.error.message
              : "Error al cargar el historial."}
          </p>
        ) : movementsQuery.data === undefined || movementsQuery.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
        ) : (
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
            {movementsQuery.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{STOCK_KIND_LABELS[m.kind]}</Badge>
                  <span className="tabular-nums">
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </span>
                  {m.lot !== null ? (
                    <span className="text-xs text-muted-foreground">Lote {m.lot}</span>
                  ) : null}
                  {m.expiry !== null ? (
                    <span className="text-xs text-muted-foreground">Caduca {m.expiry}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {m.resulting_stock !== null ? <span>Stock: {m.resulting_stock}</span> : null}
                  <span>{formatDateTime(m.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StockMovementDialog — wrapper del Dialog, controlado por el producto
// seleccionado en `products-view.tsx` (mismo patrón que el Dialog de
// edición/borrado ya existentes en esa vista). Aporta el `DialogTitle`
// accesible real (Radix exige uno dentro de `Dialog`); se oculta visualmente
// porque `StockMovementPanel` ya repite el mismo texto como encabezado visible.
// ---------------------------------------------------------------------------

export interface StockMovementDialogProps {
  salonId: string;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}

export function StockMovementDialog({
  salonId,
  product,
  onOpenChange,
}: StockMovementDialogProps): React.ReactElement {
  return (
    <Dialog open={product !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>
            Movimiento de stock{product !== null ? ` — ${product.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        {product !== null ? <StockMovementPanel salonId={salonId} product={product} /> : null}
      </DialogContent>
    </Dialog>
  );
}
