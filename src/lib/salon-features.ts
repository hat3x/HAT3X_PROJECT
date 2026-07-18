/**
 * Gate de ENTITLEMENTS (add-ons contratados por salón) — capa TS de servidor.
 *
 * Espejo en TypeScript del gate SQL `app.salon_has_feature(uuid, text)` (migración
 * `20260718100000_salon_features.sql`): un add-on está activo para un salón SOLO si
 * existe su fila en `public.salon_features` y `enabled = true` (modelo OPT-IN,
 * deny-by-default de negocio). La ausencia de fila = no contratado.
 *
 * ── ¿Por qué leer la tabla y no llamar a la RPC? ─────────────────────────────
 * `app.salon_has_feature()` vive en el esquema `app`, que PostgREST NO expone, así
 * que no es invocable vía `supabase.rpc()`. La verdad del entitlement se lee de la
 * TABLA `public.salon_features`, cuya RLS concede SELECT a los miembros del salón
 * (`members_select_salon_features`). Este helper acepta el cliente que le pase el
 * llamador:
 *   · Cliente ADMIN (service role) → lectura autoritativa que omite RLS, acotada a
 *     mano por `salon_id` (patrón de `@/lib/loyalty/server` para escrituras
 *     sensibles). Úsalo cuando la función ya opera con admin.
 *   · Cliente RLS de la sesión → un miembro solo ve los entitlements de SU salón;
 *     válido para funciones de solo lectura que no quieren tocar el admin (p. ej.
 *     `lookupByQr`).
 *
 * De solo lectura y sin efectos: NO provisiona ni modifica entitlements (eso es
 * exclusivo de HAT3X vía service_role/backoffice). USO EXCLUSIVO DE SERVIDOR.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, SalonFeature } from "@/types/database";

/** Cualquier cliente Supabase tipado con el esquema del proyecto (admin o sesión). */
type AnySupabaseClient = SupabaseClient<Database>;

/**
 * ¿El salón tiene el add-on `feature` contratado Y activo? Consulta
 * `public.salon_features` (fila presente y `enabled = true`), acotando SIEMPRE por
 * `salon_id`. Semántica idéntica al gate SQL: sin fila / `enabled = false` ⇒ `false`.
 *
 * @throws el error de Postgrest si la consulta falla (el llamador lo traduce a su
 *   error de dominio `internal`/500). Un resultado vacío NO es error: es `false`.
 */
export async function salonHasFeature(
  client: AnySupabaseClient,
  salonId: string,
  feature: SalonFeature,
): Promise<boolean> {
  const { data, error } = await client
    .from("salon_features")
    .select("enabled")
    .eq("salon_id", salonId)
    .eq("feature", feature)
    .eq("enabled", true)
    .maybeSingle();

  if (error !== null) {
    throw error;
  }
  return data !== null;
}

/**
 * Lee TODOS los entitlements de `salonId` en UNA sola consulta y los reduce a un mapa
 * `feature → enabled`. Pensado para VISUALIZAR o gatear VARIOS add-ons a la vez (p. ej.
 * la vista de «Complementos» de Ajustes) sin pagar un round-trip por feature como haría
 * llamar N veces a {@link salonHasFeature}.
 *
 * A diferencia de {@link salonHasFeature}, NO filtra por `enabled`: devuelve la fila tal
 * cual para que el llamador distinga los TRES estados que la UI necesita (la semántica
 * OPT-IN se preserva en el consumidor, no se pierde aquí):
 *   · clave ausente            ⇒ no contratado (la ausencia de fila ES el gate).
 *   · `get(feature) === true`  ⇒ contratado y activo.
 *   · `get(feature) === false` ⇒ contratado pero pausado (`enabled=false`, p. ej. impago).
 *
 * Acota SIEMPRE por `salon_id` (RLS del miembro + filtro explícito). De SOLO LECTURA: no
 * provisiona ni modifica entitlements (eso es exclusivo de HAT3X vía service_role). USO
 * EXCLUSIVO DE SERVIDOR.
 *
 * @throws el error de Postgrest si la consulta falla (el llamador lo traduce a su error
 *   de dominio). Un resultado vacío NO es error: es un mapa vacío (ningún add-on).
 */
export async function listSalonFeatures(
  client: AnySupabaseClient,
  salonId: string,
): Promise<Map<SalonFeature, boolean>> {
  const { data, error } = await client
    .from("salon_features")
    .select("feature, enabled")
    .eq("salon_id", salonId);

  if (error !== null) {
    throw error;
  }

  const states = new Map<SalonFeature, boolean>();
  for (const row of data ?? []) {
    states.set(row.feature, row.enabled);
  }
  return states;
}

/**
 * Mensaje de dominio ÚNICO para el gate de la fidelización nativa (evita que el copy
 * diverja entre `@/lib/loyalty/server` y `@/lib/customers/account`). El código de
 * error asociado es `feature_not_enabled` (HTTP 403).
 */
export const LOYALTY_FEATURE_DISABLED_MESSAGE =
  "Este salón no tiene contratada la fidelización";
