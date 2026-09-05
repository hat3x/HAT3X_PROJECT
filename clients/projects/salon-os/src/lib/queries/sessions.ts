import { createClient } from "@/lib/supabase/client";
import type { SessionPayment } from "@/app/(dashboard)/arqueo/session-totals";
import type { PosSession } from "@/types/database";

/**
 * Consultas de lectura del arqueo de caja (`pos_sessions` + `pos_payments`),
 * scopeadas por `salonId` para aislar tenants en la caché de TanStack Query. La
 * ESCRITURA (abrir/cerrar sesión) vive en el Server Action
 * (`app/(dashboard)/arqueo/actions.ts`), no aquí.
 */
export const sessionKeys = {
  all: (salonId: string) => ["pos-sessions", salonId] as const,
  open: (salonId: string) => [...sessionKeys.all(salonId), "open"] as const,
  activity: (salonId: string, sessionId: string) =>
    [...sessionKeys.all(salonId), "activity", sessionId] as const,
  recent: (salonId: string) => [...sessionKeys.all(salonId), "recent"] as const,
};

/** Actividad viva de una sesión: cobros por método + nº de ventas. */
export interface SessionActivity {
  payments: SessionPayment[];
  salesCount: number;
}

/**
 * La sesión de caja ABIERTA del salón, o `null` si no hay ninguna. El esquema
 * garantiza como mucho una abierta por (salón, sede) vía índice único, así que
 * `maybeSingle` es seguro.
 */
export async function fetchOpenSession(
  salonId: string,
): Promise<PosSession | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_sessions")
    .select("*")
    .eq("salon_id", salonId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) throw new Error(error.message);
  return data ?? null;
}

/**
 * Cobros (por método) y recuento de ventas de una sesión, para pintar los
 * totales vivos del arqueo mientras la caja está abierta. Los cobros se
 * vinculan a la sesión por `session_id` (lo estampa el TPV al cobrar).
 */
export async function fetchSessionActivity(
  salonId: string,
  sessionId: string,
): Promise<SessionActivity> {
  const supabase = createClient();

  const [paymentsRes, salesRes] = await Promise.all([
    supabase
      .from("pos_payments")
      .select("method, amount_cents")
      .eq("salon_id", salonId)
      .eq("session_id", sessionId),
    supabase
      .from("pos_sales")
      .select("id", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .eq("session_id", sessionId)
      .eq("status", "completed"),
  ]);

  if (paymentsRes.error !== null) throw new Error(paymentsRes.error.message);
  if (salesRes.error !== null) throw new Error(salesRes.error.message);

  return {
    payments: paymentsRes.data ?? [],
    salesCount: salesRes.count ?? 0,
  };
}

/**
 * Últimas sesiones CERRADAS del salón (historial de arqueos), de la más reciente
 * a la más antigua. Para la tabla de histórico de la pantalla de arqueo.
 */
export async function fetchRecentSessions(
  salonId: string,
  limit = 10,
): Promise<PosSession[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_sessions")
    .select("*")
    .eq("salon_id", salonId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(limit);

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
