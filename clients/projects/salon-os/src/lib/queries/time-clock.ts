import { createClient } from "@/lib/supabase/client";

/** Un fichaje (sesión de trabajo) con el nombre del empleado resuelto. */
export type TimeClockEntry = {
  id: string;
  userId: string | null;
  name: string;
  clockIn: string;
  clockOut: string | null;
};

export const timeClockKeys = {
  all: (salonId: string) => ["time-clock", salonId] as const,
  mine: (salonId: string, userId: string) =>
    [...timeClockKeys.all(salonId), "mine", userId] as const,
  report: (salonId: string, from: string, to: string) =>
    [...timeClockKeys.all(salonId), "report", from, to] as const,
};

type RawEntry = {
  id: string;
  user_id: string | null;
  clock_in: string;
  clock_out: string | null;
};

/**
 * Mapa user_id → nombre del empleado, resuelto desde professionals (que enlaza a
 * la cuenta con user_id). Los empleados sin ficha de profesional aparecen como
 * "Empleado".
 */
async function fetchStaffNames(salonId: string): Promise<Map<string, string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("professionals")
    .select("user_id, full_name")
    .eq("salon_id", salonId)
    .not("user_id", "is", null);
  const map = new Map<string, string>();
  for (const p of data ?? []) {
    if (p.user_id) map.set(p.user_id, p.full_name);
  }
  return map;
}

/** Fichaje ABIERTO del usuario actual (clock_out NULL), o null si no está dentro. */
export async function fetchMyOpenEntry(
  salonId: string,
  userId: string,
): Promise<TimeClockEntry | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("time_clock")
    .select("id, user_id, clock_in, clock_out")
    .eq("salon_id", salonId)
    .eq("user_id", userId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle<RawEntry>();

  if (error !== null) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    name: "",
    clockIn: data.clock_in,
    clockOut: data.clock_out,
  };
}

/**
 * Fichajes del salón cuyo clock_in cae en [fromISO, toISO), con el nombre del
 * empleado resuelto. Para el informe (owner/manager). Orden: más reciente primero.
 */
export async function fetchTimeClockReport(
  salonId: string,
  fromISO: string,
  toISO: string,
): Promise<TimeClockEntry[]> {
  const supabase = createClient();
  const [{ data, error }, names] = await Promise.all([
    supabase
      .from("time_clock")
      .select("id, user_id, clock_in, clock_out")
      .eq("salon_id", salonId)
      .gte("clock_in", fromISO)
      .lt("clock_in", toISO)
      .order("clock_in", { ascending: false })
      .returns<RawEntry[]>(),
    fetchStaffNames(salonId),
  ]);

  if (error !== null) throw new Error(error.message);
  return (data ?? []).map((e) => ({
    id: e.id,
    userId: e.user_id,
    name: (e.user_id && names.get(e.user_id)) || "Empleado",
    clockIn: e.clock_in,
    clockOut: e.clock_out,
  }));
}
