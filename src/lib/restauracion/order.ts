import { computeSaleTotals, type SaleTotals } from "@/lib/payments";
import { effectiveUnitPriceCents, expandCombo, type ComboPiece } from "@/lib/restauracion/menu";

export interface MenuSelection {
  productId: string;
  name: string;
  basePriceCents: number;
  vatRate: number;
  stationId: string | null;
  isCombo: boolean;
  qty: number;
  modifiers: Array<{ name: string; priceDeltaCents: number }>;
  comboPieces: ComboPiece[];
}

export interface OrderItemDraft {
  id: string;
  productId: string;
  qty: number;
  unitPriceCents: number;
  vatRate: number;
  stationId: string | null;
  comboGroup: string | null;
  modifiersSnapshot: Array<{ name: string; priceDeltaCents: number }>;
}

export function buildOrderItemDrafts(sel: MenuSelection, newId: () => string): OrderItemDraft[] {
  const headPrice = effectiveUnitPriceCents(sel.basePriceCents, sel.modifiers);
  if (!sel.isCombo || sel.comboPieces.length === 0) {
    return [{
      id: newId(), productId: sel.productId, qty: sel.qty, unitPriceCents: headPrice,
      vatRate: sel.vatRate, stationId: sel.stationId, comboGroup: null, modifiersSnapshot: sel.modifiers,
    }];
  }
  const comboGroup = newId();
  const head: OrderItemDraft = {
    id: newId(), productId: sel.productId, qty: sel.qty, unitPriceCents: headPrice,
    vatRate: sel.vatRate, stationId: sel.stationId, comboGroup, modifiersSnapshot: sel.modifiers,
  };
  const pieces = expandCombo(sel.qty, sel.comboPieces).map((line): OrderItemDraft => ({
    id: newId(), productId: line.productId, qty: line.qty, unitPriceCents: 0,
    vatRate: sel.vatRate, stationId: line.stationId, comboGroup, modifiersSnapshot: [],
  }));
  return [head, ...pieces];
}

export interface SettleLineInput {
  description: string;
  qty: number;
  unitPriceCents: number;
  vatRate: number;
}

export function buildSettleLines(
  items: Array<{ productName: string; qty: number; unitPriceCents: number; vatRate: number;
                 modifiersSnapshot: Array<{ name: string }> }>,
): SettleLineInput[] {
  return items.map((it) => {
    const mods = it.modifiersSnapshot.map((m) => m.name).join(", ");
    return {
      description: mods.length > 0 ? `${it.productName} (${mods})` : it.productName,
      qty: it.qty, unitPriceCents: it.unitPriceCents, vatRate: it.vatRate,
    };
  });
}

export function settleTotals(lines: SettleLineInput[]): SaleTotals {
  return computeSaleTotals(lines.map((l) => ({
    quantity: l.qty, unitPriceCents: l.unitPriceCents, vatRate: l.vatRate,
  })));
}
