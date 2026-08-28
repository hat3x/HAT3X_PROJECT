"use server";

/**
 * Server actions de EQUIPOS DE IMAGEN por salón (A1a).
 *
 * Aquí se configura QUÉ aparato tiene cada clínica. Es la pieza que hace que el
 * producto no dependa de un fabricante: no hay marca cableada en el código, y
 * cada salón declara los suyos —lo normal, un sensor por gabinete más un
 * ortopantomógrafo compartido.
 *
 * Mismo patrón de gate que `expediente/actions.ts`: sector + rol comprobados en
 * servidor, ADICIONALES a RLS. Las políticas de `salon_imaging_device` acotan por
 * `salon_id` pero no miran el sector, así que sin este gate un owner de una
 * peluquería podría escribir aquí invocando la Server Action directamente.
 *
 * La validación de la configuración NO se repite: se reutiliza
 * `imagingDeviceSchema`, la misma unión discriminada que usa el formulario. Así
 * cliente y servidor no pueden discrepar sobre qué ajustes valen para cada
 * adaptador — y una carpeta vigilada con un AE title de DICOM se rechaza aquí
 * igual que allí, antes de tocar la base.
 */
import { revalidatePath } from "next/cache";

import { isValidPairingToken } from "@/lib/imaging/pairing";
import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { imagingDeviceSchema } from "@/lib/validations/imaging-device";
import type { MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_SECTOR = "Los equipos de imagen son de las clínicas dentales.";
const ERROR_ROLE = "No tienes permiso para configurar los equipos.";

/** Configurar un equipo es administrar la clínica, no operarla. */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager"];

async function assertEquiposAccess(): Promise<
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
 * Da de alta o actualiza un equipo de imagen del salón activo.
 *
 * `deviceId` presente ⇒ actualiza ese equipo; ausente ⇒ alta. En ambos casos la
 * operación va acotada por `salon_id`: el cliente admin no interviene, pero el
 * filtro explícito impide tocar el equipo de otra clínica aunque el id venga
 * manipulado.
 */
export async function saveImagingDevice(
  input: unknown,
  deviceId?: string,
): Promise<ActionResult<{ id: string }>> {
  const access = await assertEquiposAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const parsed = imagingDeviceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Configuración no válida." };
  }

  const supabase = createClient();
  const row = {
    salon_id: access.salonId,
    name: parsed.data.name,
    adapter: parsed.data.adapter,
    settings: parsed.data.settings,
    modality: parsed.data.modality,
    active: parsed.data.active,
  };

  const query = deviceId
    ? supabase
        .from("salon_imaging_device")
        .update(row)
        .eq("id", deviceId)
        .eq("salon_id", access.salonId)
    : supabase.from("salon_imaging_device").insert(row);

  const { data, error } = await query.select("id").single();

  if (error !== null) {
    // 23505 = ya hay un equipo con ese nombre en el salón. Dos equipos
    // homónimos serían indistinguibles para quien tiene que elegir uno con el
    // paciente delante, de ahí el índice único.
    if (error.code === "23505") {
      return { ok: false, error: "Ya tienes un equipo con ese nombre." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/ajustes/equipos");
  return { ok: true, data: { id: data.id } };
}

/**
 * Empareja el panel con el agente instalado en la clínica.
 *
 * Guarda el puerto y el secreto en `salons.settings->imaging_agent` **a través de
 * una RPC**, nunca con un update directo. Dos razones, las dos de seguridad:
 *
 *  · `settings` guarda además `single_resource`, `slot_interval_minutes` y
 *    `min_lead_minutes`. Escribir desde aquí obligaría a leer-modificar-escribir,
 *    y dos personas guardando a la vez dejarían al salón sin su
 *    `single_resource` — que en Biodental es lo que impide dos pacientes en el
 *    mismo hueco. La RPC fusiona con `||`, que es atómico.
 *  · La RPC solo puede tocar la clave `imaging_agent`. Permiso de UPDATE sobre
 *    `settings` sería permiso sobre todas las claves, las de hoy y las de mañana.
 */
export async function saveImagingAgentSettings(input: {
  port: number;
  token: string;
}): Promise<ActionResult<null>> {
  const access = await assertEquiposAccess();
  if (!access.ok) return { ok: false, error: access.error };

  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return { ok: false, error: "El puerto tiene que estar entre 1 y 65535." };
  }

  if (!isValidPairingToken(input.token)) {
    return {
      ok: false,
      error:
        "Ese token no vale. Comprueba que lo has copiado entero, sin espacios ni saltos de línea.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("set_salon_imaging_agent", {
    p_salon_id: access.salonId,
    p_port: input.port,
    p_token: input.token,
  });

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/equipos");
  return { ok: true, data: null };
}

/** Borra un equipo del salón activo. Acotado por `salon_id`. */
export async function deleteImagingDevice(deviceId: string): Promise<ActionResult<null>> {
  const access = await assertEquiposAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("salon_imaging_device")
    .delete()
    .eq("id", deviceId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ajustes/equipos");
  return { ok: true, data: null };
}
