export interface SelectedModifier {
  priceDeltaCents: number;
}

export function effectiveUnitPriceCents(
  basePriceCents: number,
  mods: readonly SelectedModifier[],
): number {
  const delta = mods.reduce((sum, m) => sum + m.priceDeltaCents, 0);
  return Math.max(0, basePriceCents + delta);
}

export interface ComboPiece {
  componentProductId: string;
  qty: number;
  stationId: string | null;
  stationOverrideId: string | null;
}

export interface ExpandedLine {
  productId: string;
  qty: number;
  stationId: string | null;
  unitPriceCents: number;
}

export function expandCombo(comboQty: number, pieces: readonly ComboPiece[]): ExpandedLine[] {
  return pieces.map((p) => ({
    productId: p.componentProductId,
    qty: p.qty * comboQty,
    stationId: p.stationOverrideId ?? p.stationId,
    unitPriceCents: 0,
  }));
}
