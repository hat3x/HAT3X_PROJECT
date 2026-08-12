/** Pedidos a laboratorio + progreso de alineadores (Fase 4). Puro, sin IO. */

export type LabOrderKind = "modelo" | "retenedor" | "alineadores" | "ortopedia" | "otro";
export type LabOrderStatus = "enviado" | "recibido" | "entregado";

export const LAB_ORDER_KIND_LABELS: Record<LabOrderKind, string> = {
  modelo: "Modelo",
  retenedor: "Retenedor",
  alineadores: "Alineadores",
  ortopedia: "Ortopedia",
  otro: "Otro",
};

export const LAB_ORDER_STATUS_LABELS: Record<LabOrderStatus, string> = {
  enviado: "Enviado",
  recibido: "Recibido",
  entregado: "Entregado",
};

/** Estado derivado de las fechas del pedido (no se almacena). */
export function labOrderStatus(order: {
  sentAt: string;
  receivedAt: string | null;
  deliveredAt: string | null;
}): LabOrderStatus {
  if (order.deliveredAt !== null) return "entregado";
  if (order.receivedAt !== null) return "recibido";
  return "enviado";
}

export interface AlignerProgress {
  total: number;
  delivered: number;
  pending: number;
}

/**
 * Progreso de alineadores. `deliveredNumbers` = el `alignerDelivered` de cada visita
 * (nº del alineador entregado en esa visita; null si no se entregó). Entregados = el mayor
 * de esos números; pendientes = total − entregados (nunca negativo).
 */
export function computeAlignerProgress(
  alignerTotal: number | null,
  deliveredNumbers: readonly (number | null)[],
): AlignerProgress {
  const total = alignerTotal ?? 0;
  const delivered = deliveredNumbers.reduce<number>(
    (max, n) => (n !== null && n > max ? n : max),
    0,
  );
  const pending = Math.max(0, total - delivered);
  return { total, delivered, pending };
}
