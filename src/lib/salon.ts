import {
  EMPTY_SALON_FEATURE_FLAGS,
  type SalonFeatureFlags,
} from "@/lib/salon-feature-flags";
import { salonFeatureFlags, salonHasFeature } from "@/lib/salon-features";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, SalonFeature, SalonSector } from "@/types/database";

export interface ActiveSalon {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  sector: SalonSector;
}

export interface ActiveMembership {
  salonId: string;
  role: MemberRole;
}

/**
 * Roles con permiso para administrar los ajustes del salón.
 * `staff` queda excluido de forma deliberada.
 */
export const SETTINGS_ROLES: readonly MemberRole[] = ["owner", "manager"];

/**
 * Resuelve la pertenencia activa (salón + rol) del usuario autenticado.
 *
 * Como en {@link getActiveSalonId} tomamos la primera pertenencia (la más
 * antigua). Devuelve `null` si no hay sesión o el usuario no pertenece a
 * ningún salón. Reutiliza esta función para decidir permisos en servidor.
 */
export async function getActiveMembership(): Promise<ActiveMembership | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    return null;
  }

  const { data, error } = await supabase
    .from("salon_members")
    .select("salon_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`No se pudo resolver la pertenencia activa: ${error.message}`);
  }

  if (data === null) {
    return null;
  }

  return { salonId: data.salon_id, role: data.role };
}

/** `true` si el rol tiene permiso para administrar los ajustes del salón. */
export function canManageSettings(role: MemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
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

/** Resuelve id, nombre, slug, timezone y sector del salón activo del usuario. */
export async function getActiveSalon(): Promise<ActiveSalon | null> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("salons")
    .select("id, name, slug, timezone, sector")
    .eq("id", salonId)
    .maybeSingle();

  if (error !== null) throw new Error(`No se pudo cargar el salón: ${error.message}`);
  return data ?? null;
}

/** Sector del salón activo (o null si no hay salón). */
export async function getActiveSalonSector(): Promise<SalonSector | null> {
  const salon = await getActiveSalon();
  return salon?.sector ?? null;
}

/**
 * ¿El salón activo del usuario tiene contratado Y activo el add-on `feature`?
 *
 * Lectura BARATA de `public.salon_features` para el GATING DE UI en servidor:
 * resuelve el salón activo (sesión) y delega en {@link salonHasFeature} con el
 * cliente RLS (un miembro solo ve los entitlements de SU salón). Sin sesión ni
 * salón ⇒ `false` (deny-by-default de negocio, igual que el gate SQL).
 *
 * Envoltorio de conveniencia para componentes de servidor que solo deciden
 * "muestro u oculto este acceso" (p. ej. el enlace de fidelización de la ficha o
 * la tarjeta de escaneo del TPV). Es SOLO presentación: ocultar un acceso NUNCA
 * sustituye al gate real de datos, que ya vive en el servidor de cada dominio
 * (p. ej. `lookupByQr`/`awardVisit` devuelven `feature_not_enabled`). Así, un
 * cliente que fuerce la URL sigue topándose con el 403 del servidor.
 */
export async function activeSalonHasFeature(
  feature: SalonFeature,
): Promise<boolean> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return false;

  const supabase = createClient();
  return salonHasFeature(supabase, salonId, feature);
}

/**
 * Snapshot completo de entitlements del salón ACTIVO para GATEAR la UI del panel en
 * cliente. Resuelve el salón de la sesión y, con el cliente RLS, calcula el snapshot
 * booleano en UNA consulta (vía {@link salonFeatureFlags}). Sin sesión ni salón ⇒
 * {@link EMPTY_SALON_FEATURE_FLAGS} (todo `false`, deny-by-default como el gate SQL).
 *
 * Pensado para SEMBRAR el provider cliente `SalonFeaturesProvider` desde el layout del
 * panel: el servidor lo resuelve UNA vez y el árbol cliente lo lee con `useSalonFeatures`
 * / `useHasFeature` / `useHasPos` — sin refetch ni prop-drilling. Base para ocultar los
 * módulos de pago (Facturación, gráficas de ingresos) cuando falta `pos`, dejando visible
 * la analítica de gestión (citas, clientes, ocupación).
 *
 * Es SOLO presentación: ocultar un acceso NUNCA sustituye al gate de datos, que ya vive
 * en el servidor de cada dominio (p. ej. las acciones del TPV/facturación). Un cliente
 * que fuerce la URL sigue topándose con el gate real del servidor.
 */
export async function getActiveSalonFeatureFlags(): Promise<SalonFeatureFlags> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return EMPTY_SALON_FEATURE_FLAGS;

  const supabase = createClient();
  return salonFeatureFlags(supabase, salonId);
}
