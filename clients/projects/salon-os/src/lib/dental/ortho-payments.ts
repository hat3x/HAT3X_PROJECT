/** Plan de pago de ortodoncia (Fase 2): cálculo del calendario y del saldo. Puro, sin IO. */

export type OrthoPlanStatus = "activo" | "completado" | "cancelado";
export type OrthoInstallmentStatus = "pendiente" | "pagada";
export type OrthoPaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "otro";

export const ORTHO_PLAN_STATUS_LABELS: Record<OrthoPlanStatus, string> = {
  activo: "Activo",
  completado: "Completado",
  cancelado: "Cancelado",
};

export const ORTHO_PAYMENT_METHOD_LABELS: Record<OrthoPaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

export interface ScheduleInput {
  totalCents: number;
  downPaymentCents: number;
  installmentCount: number; // N cuotas (>= 1)
  dayOfMonth: number; // 1..31 (se clampa al último día del mes)
  startDate: string; // ISO "YYYY-MM-DD"
}

export interface ScheduledInstallment {
  seq: number; // 0 = entrada, 1..N = cuotas
  dueDate: string; // ISO "YYYY-MM-DD"
  amountCents: number;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Devuelve la fecha ISO `months` meses después de `iso`, con día `day` clampado al mes. */
function addMonthsClamped(iso: string, months: number, day: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number, number];
  const total0 = m - 1 + months;
  const year = y + Math.floor(total0 / 12);
  const month0 = ((total0 % 12) + 12) % 12;
  const d = Math.min(day, daysInMonth(year, month0));
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Calendario del plan: entrada (seq 0, solo si down > 0, vence en start_date) + N cuotas
 * (seq 1..N, financiado repartido; el resto en céntimos va a las primeras cuotas; vencen el
 * día `dayOfMonth` de cada mes tras el de inicio). Invariante: Σ amountCents === totalCents.
 */
export function computeInstallmentSchedule(input: ScheduleInput): ScheduledInstallment[] {
  const { totalCents, downPaymentCents, installmentCount: n, dayOfMonth, startDate } = input;
  const out: ScheduledInstallment[] = [];

  if (downPaymentCents > 0) {
    out.push({ seq: 0, dueDate: startDate, amountCents: downPaymentCents });
  }

  const financed = totalCents - downPaymentCents;
  const base = Math.floor(financed / n);
  const remainder = financed - base * n;

  for (let k = 1; k <= n; k++) {
    const amountCents = base + (k <= remainder ? 1 : 0);
    out.push({ seq: k, dueDate: addMonthsClamped(startDate, k, dayOfMonth), amountCents });
  }

  return out;
}

export interface BalanceInstallment {
  status: OrthoInstallmentStatus;
  dueDate: string;
  amountCents: number;
  paidAmountCents?: number | null;
}

export interface PlanBalance {
  paidCents: number;
  pendingCents: number;
  overdueCount: number;
  nextDueDate: string | null;
  nextAmountCents: number | null;
}

export function isOverdue(
  inst: { status: OrthoInstallmentStatus; dueDate: string },
  todayIso: string,
): boolean {
  return inst.status === "pendiente" && inst.dueDate < todayIso;
}

/** Resumen de saldo derivado de las cuotas (todo en céntimos). `todayIso` = "YYYY-MM-DD". */
export function computePlanBalance(
  installments: readonly BalanceInstallment[],
  todayIso: string,
): PlanBalance {
  let paidCents = 0;
  let pendingCents = 0;
  let overdueCount = 0;
  let next: BalanceInstallment | null = null;

  for (const it of installments) {
    if (it.status === "pagada") {
      paidCents += it.paidAmountCents ?? it.amountCents;
    } else {
      pendingCents += it.amountCents;
      if (isOverdue(it, todayIso)) overdueCount += 1;
      if (next === null || it.dueDate < next.dueDate) next = it;
    }
  }

  return {
    paidCents,
    pendingCents,
    overdueCount,
    nextDueDate: next?.dueDate ?? null,
    nextAmountCents: next?.amountCents ?? null,
  };
}
