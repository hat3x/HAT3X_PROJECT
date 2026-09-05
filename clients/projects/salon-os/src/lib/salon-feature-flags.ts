/**
 * Snapshot ISOMÓRFICO de entitlements — capa PURA, sin dependencias de servidor.
 *
 * `@/lib/salon-features` lee la verdad de `public.salon_features` con un cliente
 * Supabase (USO DE SERVIDOR). Este módulo, en cambio, NO toca la red ni `next/headers`:
 * solo define el CATÁLOGO de add-ons, el tipo del snapshot serializable
 * `SalonFeatureFlags` y el reductor puro que colapsa el mapa de tres estados de
 * `listSalonFeatures` en un booleano por feature con la semántica del GATE.
 *
 * ── ¿Por qué un módulo aparte? ───────────────────────────────────────────────
 * El snapshot viaja del layout de SERVIDOR (que resuelve el salón activo) al árbol
 * CLIENTE del panel (provider + hooks) como PROP serializable. Al no arrastrar
 * `@supabase/*` ni `next/headers`, es seguro importarlo tanto desde un Server
 * Component como desde un `"use client"`. Deny-by-default de negocio: la ausencia de
 * contrato —o de sesión/salón— es `false` (idéntico al gate SQL `app.salon_has_feature`).
 */
import type { SalonFeature } from "@/types/database";

/**
 * Catálogo en RUNTIME de los add-ons contratables, en el MISMO orden que el enum
 * `public.salon_feature` (migración `20260718100000_salon_features`):
 * loyalty · client_app · staff_app · ai_receptionist · pos. Única fuente para recorrer
 * TODAS las features (p. ej. construir un snapshot con todas las claves presentes).
 * `salon-feature-flags.test.ts` ancla esta lista contra el enum SQL real.
 */
export const SALON_FEATURES = [
  "loyalty",
  "client_app",
  "staff_app",
  "ai_receptionist",
  "pos",
] as const satisfies readonly SalonFeature[];

/**
 * Snapshot SERIALIZABLE de entitlements del salón: un booleano por CADA add-on del
 * catálogo (todas las claves presentes). `true` ⇔ contratado Y activo; cualquier otro
 * caso (no contratado, o contratado pero en pausa) ⇒ `false`. Es la forma que cruza la
 * frontera servidor→cliente y la que consultan los hooks del panel.
 */
export type SalonFeatureFlags = Readonly<Record<SalonFeature, boolean>>;

/**
 * Snapshot con TODOS los add-ons a `false` (deny-by-default). Se usa cuando no hay
 * sesión ni salón activo, y como valor por defecto del provider cliente: sin contexto,
 * todo add-on se considera NO disponible (nunca se filtra una superficie de pago).
 *
 * Literal explícito (no derivado de {@link SALON_FEATURES}) a propósito: si algún día se
 * añade un valor a la unión {@link SalonFeature}, TypeScript OBLIGA a añadir su clave
 * aquí — es un guardián de exhaustividad en tiempo de compilación. Congelado (solo lectura).
 */
export const EMPTY_SALON_FEATURE_FLAGS: SalonFeatureFlags = Object.freeze({
  loyalty: false,
  client_app: false,
  staff_app: false,
  ai_receptionist: false,
  pos: false,
});

/**
 * Colapsa el mapa de TRES estados de `listSalonFeatures` (`feature → enabled`, con
 * ausencia = no contratado) en el snapshot booleano del GATE. Regla OPT-IN, idéntica a
 * `salonHasFeature`:
 *
 *   · clave presente y `true`   ⇒ `true`   (contratado y activo)
 *   · clave presente y `false`  ⇒ `false`  (contratado pero en PAUSA: el gate CIERRA)
 *   · clave ausente             ⇒ `false`  (no contratado — la ausencia es el gate)
 *
 * Ojo a la diferencia con la vista de Complementos: ALLÍ "en pausa" es un tercer estado
 * visible; AQUÍ, para GATEAR módulos (ocultar Facturación / gráficas de ingresos), "en
 * pausa" cuenta como OFF — un add-on suspendido no debe habilitar su superficie de pago.
 * Devuelve SIEMPRE las cinco claves presentes (forma de {@link EMPTY_SALON_FEATURE_FLAGS}).
 */
export function toSalonFeatureFlags(
  states: ReadonlyMap<SalonFeature, boolean>,
): SalonFeatureFlags {
  const flags: Record<SalonFeature, boolean> = { ...EMPTY_SALON_FEATURE_FLAGS };
  for (const feature of SALON_FEATURES) {
    flags[feature] = states.get(feature) === true;
  }
  return flags;
}
