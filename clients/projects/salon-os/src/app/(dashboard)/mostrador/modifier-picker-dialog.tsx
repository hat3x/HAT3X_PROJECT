"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useComboComponents, useModifierOptionsForGroups } from "@/hooks/use-menu";
import { formatMoney } from "@/lib/format";
import type { ComboPiece } from "@/lib/restauracion/menu";
import type { MenuSelection } from "@/lib/restauracion/order";
import type { ModifierGroup, Product } from "@/types/database";

interface ModifierPickerDialogProps {
  salonId: string;
  /** Producto a configurar, o `null` si el diálogo está cerrado. */
  product: Product | null;
  /** Grupos de modificadores asignados a `product` (ya resueltos). */
  groups: ModifierGroup[];
  /** Catálogo completo, para resolver nombre/estación de las piezas de combo. */
  productsById: Map<string, Product>;
  onClose: () => void;
  onConfirm: (selection: MenuSelection) => void;
}

/**
 * Diálogo para configurar UNA unidad de un producto antes de añadirlo al
 * pedido: cantidad + opciones de cada grupo de modificadores (respetando
 * `min_select`/`max_select`) y, si el producto es un combo, la lista de
 * piezas que lo componen (informativa: el combo se ordena entero, sin elegir
 * piezas alternativas). Al confirmar entrega una {@link MenuSelection} que
 * `mostrador-view.tsx` pasa a `buildOrderItemDrafts`.
 */
export function ModifierPickerDialog({
  salonId,
  product,
  groups,
  productsById,
  onClose,
  onConfirm,
}: ModifierPickerDialogProps): React.ReactElement {
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  // Reinicia cantidad/selección cada vez que se abre para un producto distinto.
  useEffect(() => {
    setQty(1);
    setSelected({});
  }, [product?.id]);

  const groupIds = groups.map((g) => g.id);
  const optionsQuery = useModifierOptionsForGroups(salonId, product !== null ? groupIds : []);
  const comboQuery = useComboComponents(
    salonId,
    product?.is_combo === true ? product.id : null,
  );

  const options = optionsQuery.data ?? [];
  const optionsLoading = product !== null && groupIds.length > 0 && optionsQuery.isPending;
  const comboLoading = product?.is_combo === true && comboQuery.isPending;

  function toggleOption(group: ModifierGroup, optionId: string): void {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const already = current.includes(optionId);
      if (group.max_select <= 1) {
        // Selección única (tipo radio): un segundo toque la quita.
        return { ...prev, [group.id]: already ? [] : [optionId] };
      }
      if (already) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= group.max_select) return prev; // respeta el máximo
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  const allRequiredMet = groups.every(
    (g) => (selected[g.id]?.length ?? 0) >= g.min_select,
  );
  const canConfirm = allRequiredMet && qty >= 1 && !optionsLoading && !comboLoading;

  function handleConfirm(): void {
    if (product === null || !canConfirm) return;
    const modifiers = groups.flatMap((g) =>
      (selected[g.id] ?? []).map((optionId) => {
        const opt = options.find((o) => o.id === optionId);
        return { name: opt?.name ?? "", priceDeltaCents: opt?.price_delta_cents ?? 0 };
      }),
    );
    const comboPieces: ComboPiece[] = product.is_combo
      ? (comboQuery.data ?? []).map((piece) => ({
          componentProductId: piece.component_product_id,
          qty: piece.qty,
          stationId: productsById.get(piece.component_product_id)?.station_id ?? null,
          stationOverrideId: piece.station_id_override,
        }))
      : [];
    onConfirm({
      productId: product.id,
      name: product.name,
      basePriceCents: product.price_cents,
      vatRate: product.vat_rate,
      stationId: product.station_id,
      isCombo: product.is_combo,
      qty,
      modifiers,
      comboPieces,
    });
  }

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product?.name}</DialogTitle>
          <DialogDescription>
            {product !== null ? formatMoney(product.price_cents) : ""}
            {product?.is_combo === true ? " · combo" : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Cantidad */}
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 p-3">
          <span className="text-sm font-medium text-foreground">Cantidad</span>
          <div className="inline-flex items-center rounded-lg border border-border/70 bg-background">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-r-none"
              aria-label="Restar una unidad"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center text-sm font-semibold tabular-nums">{qty}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-l-none"
              aria-label="Sumar una unidad"
              onClick={() => setQty((q) => q + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Piezas del combo (informativo) */}
        {product?.is_combo === true ? (
          comboLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Incluye
              </p>
              <ul className="grid gap-1 text-sm text-foreground">
                {(comboQuery.data ?? []).map((piece) => (
                  <li key={piece.id}>
                    {piece.qty}× {productsById.get(piece.component_product_id)?.name ?? "Pieza"}
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}

        {/* Grupos de modificadores */}
        {optionsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          groups.map((group) => (
            <fieldset key={group.id} className="grid gap-2 rounded-xl border border-border/70 p-3">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
                {group.name}
                {group.required ? (
                  <span className="text-xs font-normal text-destructive">obligatorio</span>
                ) : null}
                <span className="text-xs font-normal text-muted-foreground">
                  (elige {group.min_select}
                  {group.max_select !== group.min_select ? `–${group.max_select}` : ""})
                </span>
              </legend>
              <div className="grid gap-1.5">
                {options
                  .filter((option) => option.group_id === group.id)
                  .map((option) => {
                    const isSelected = (selected[group.id] ?? []).includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleOption(group, option.id)}
                        className={[
                          "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          isSelected
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border/70 bg-background text-foreground hover:bg-accent",
                        ].join(" ")}
                      >
                        <span>{option.name}</span>
                        {option.price_delta_cents !== 0 ? (
                          <span className="tabular-nums">
                            {option.price_delta_cents > 0 ? "+" : ""}
                            {formatMoney(option.price_delta_cents)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
              </div>
            </fieldset>
          ))
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
            Añadir al pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
