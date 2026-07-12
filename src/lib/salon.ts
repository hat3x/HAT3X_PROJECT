import { createClient } from "@/lib/supabase/server";

export interface ActiveSalon {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

/**
 * Resuelve el salón activo del usuario autenticado.
 *
 * En el modelo multi-tenant un usuario pertenece a uno o varios salones a
 * través de `salon_members`. Por ahora tomamos la primera pertenencia
 * (la más antigua). Devuelve `null` si no hay sesión o el usuario no está
 * asociado a ningún salón.
 *
 * RLS ya restringe las filas a los salones del usuario; devolver el id nos
 * permite además scopear explícitamente las consultas e inserts.
 */
export async function getActiveSalonId(): Promise<string | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return null;
  }

  const { data, error } = await supabase
    .from("salon_members")
    .select("salon_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`No se pudo resolver el salón activo: ${error.message}`);
  }

  return data?.salon_id ?? null;
}

/** Resuelve id, nombre, slug y timezone del salón activo del usuario. */
export async function getActiveSalon(): Promise<ActiveSalon | null> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("salons")
    .select("id, name, slug, timezone")
    .eq("id", salonId)
    .maybeSingle();

  if (error !== null) throw new Error(`No se pudo cargar el salón: ${error.message}`);
  return data ?? null;
}
