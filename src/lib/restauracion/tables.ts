export type TableStatusValue = "libre" | "ocupada" | "cuenta_pedida" | "por_limpiar";

const TRANSITIONS: Record<TableStatusValue, readonly TableStatusValue[]> = {
  libre: ["ocupada"],
  ocupada: ["cuenta_pedida", "por_limpiar"],
  cuenta_pedida: ["por_limpiar"],
  por_limpiar: ["libre"],
};

export function canTransition(from: TableStatusValue, to: TableStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}

export function validCapacity(min: number, max: number): boolean {
  return Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min;
}

export function clampPosition(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export function tableTone(status: TableStatusValue): "free" | "busy" | "bill" | "cleaning" {
  switch (status) {
    case "libre": return "free";
    case "ocupada": return "busy";
    case "cuenta_pedida": return "bill";
    case "por_limpiar": return "cleaning";
  }
}
