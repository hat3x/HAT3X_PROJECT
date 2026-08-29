"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  implantPlacementSchema,
  type ImplantPlacementInput,
} from "@/lib/validations/implant";
import type { MemberRole } from "@/types/database";

/**
 * Registro de implantes colocados (A3).
 *
 * El Reglamento (UE) 2017/745 obliga a seguir cada producto implantable hasta
 * el paciente. Lo que eso significa el día que importa: el fabricante retira un
 * lote y la clínica tiene que decir a quién se lo puso.
 *
 * ── La puerta de sector ──────────────────────────────────────────────────────
 * La RLS aísla por SALÓN, no por sector: sin esta comprobación, una peluquería
 * podría escribir en tablas clínicas. Es la regla que hereda todo el módulo
 * dental y la única barrera que existe para esto.
 */

const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_SECTOR = "La trazabilidad de implantes es propia de clínicas dentales.";
const ERROR_ROLE = "No tienes permiso para registrar implantes.";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function assertDentalAccess(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };
  if (salon.sector !== "odontologia") return { ok: false, error: ERROR_SECTOR };

  const membership = await getActiveMembership();
  if (membership === null || !WRITE_ROLES.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }
  return { ok: true, salonId: salon.id };
}

/**
 * Anota un implante en la ficha del paciente.
 *
 * Se valida ANTES de tocar la base: un diente fuera de la numeración FDI o un
 * GTIN a medias no llegan a escribirse, porque en la ficha parecerían un dato
 * bueno y fallarían justo el día que hay que buscarlos.
 */
export async function registerImplant(
  input: ImplantPlacementInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = implantPlacementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }
  const v = parsed.data;

  const access = await assertDentalAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("implant_placement")
    .insert({
      salon_id: access.salonId,
      customer_id: v.customerId,
      fdi_code: v.fdiCode,
      udi_raw: v.udiRaw,
      gtin: v.gtin,
      lot: v.lot,
      serial: v.serial,
      ref: v.ref,
      brand: v.brand,
      expiry: v.expiry,
      diameter_mm: v.diameterMm ?? null,
      length_mm: v.lengthMm ?? null,
      placed_by: v.professionalId ?? null,
      appointment_id: v.appointmentId ?? null,
      notes: v.notes,
    })
    .select("id")
    .single();

  if (error !== null || data === null) {
    return {
      ok: false,
      error: `No se pudo registrar el implante: ${error?.message ?? "sin respuesta"}`,
    };
  }

  revalidatePath("/expediente");
  return { ok: true, data: { id: data.id } };
}
