import { createClient } from "@/lib/supabase/server";

/**
 * Consultas de trazabilidad de implantes (A3).
 *
 * Responden las dos preguntas que exige el Reglamento (UE) 2017/745, y la
 * segunda es la que justifica la fase entera:
 *
 *   1. «¿Qué lleva puesto este paciente?» — el día a día.
 *   2. «Han retirado el lote LOT123: ¿a quién se lo pusimos?» — el día malo.
 *
 * Las dos filtran SIEMPRE por salón. Sin ese filtro, una alerta sanitaria
 * devolvería pacientes de otra clínica: el peor resultado posible aquí, porque
 * además parecería correcto.
 */

const CAMPOS =
  "id, fdi_code, gtin, lot, serial, ref, brand, expiry, diameter_mm, length_mm, " +
  "placed_at, notes, customer_id";

export interface ImplantRow {
  id: string;
  fdi_code: number;
  gtin: string | null;
  lot: string | null;
  serial: string | null;
  ref: string | null;
  brand: string | null;
  expiry: string | null;
  diameter_mm: number | null;
  length_mm: number | null;
  placed_at: string;
  notes: string | null;
  customer_id: string;
  customer?: { full_name: string | null; phone: string | null } | null;
}

/** Lo que lleva puesto un paciente, de lo más reciente a lo más antiguo. */
export async function fetchImplantsByCustomer(
  salonId: string,
  customerId: string,
): Promise<ImplantRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("implant_placement")
    .select(CAMPOS)
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("placed_at", { ascending: false })
    .returns<ImplantRow[]>();

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/**
 * A quién se le puso un lote. La consulta de la alerta sanitaria.
 *
 * Trae el nombre y el teléfono del paciente a propósito: lo siguiente que pasa
 * después de mirar esta lista es una llamada, y obligar a abrir cada ficha
 * convertiría diez minutos en una tarde.
 */
export async function fetchImplantsByLot(salonId: string, lot: string): Promise<ImplantRow[]> {
  // Un lote en blanco NO consulta: un `eq` con cadena vacía podría traer de
  // vuelta media clínica y hacer creer que la alerta afecta a todo el mundo.
  const buscado = lot.trim();
  if (buscado === "") return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("implant_placement")
    .select(`${CAMPOS}, customer:customers(full_name, phone)`)
    .eq("salon_id", salonId)
    .eq("lot", buscado)
    .order("placed_at", { ascending: false })
    .returns<ImplantRow[]>();

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
