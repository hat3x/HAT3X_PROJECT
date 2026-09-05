/**
 * GUARD de los Route Handlers de `/api/reception` — la puerta de entrada COMÚN.
 *
 * Cada endpoint de recepción es consumido por una integración NO-humana (el
 * recepcionista IA: Retell + Twilio + n8n) que se autentica por cabecera
 * `x-api-key`, NO por sesión de usuario. Antes de ejecutar CUALQUIER lógica de
 * negocio, todos comparten exactamente dos comprobaciones, y en este orden:
 *
 *   1. AUTENTICACIÓN — resolver `x-api-key → salón`. Si la clave falta, tiene un
 *      formato ajeno, es desconocida o está revocada ⇒ `401 UNAUTHORIZED`. Se
 *      apoya en {@link requireServiceApiKey} (lado-lectura de `service_api_keys`,
 *      FAIL-CLOSED; ver `@/lib/service-keys/verify`).
 *   2. ENTITLEMENT (autorización de producto) — el salón resuelto debe tener el
 *      add-on `ai_receptionist` contratado Y activo. Si no ⇒ `403
 *      FEATURE_NOT_ENABLED`. Espeja la semántica del gate SQL
 *      `app.salon_has_feature(salon_id, 'ai_receptionist')`.
 *
 * El ORDEN importa (defensa en profundidad): quien no presenta una clave válida
 * recibe su 401 ANTES de que se consulte el estado de ningún add-on — así el gate
 * de entitlements no filtra a un extraño si un salón tiene o no la recepción IA.
 * Es el mismo criterio "authz después de authn" de `requireLoyaltyFeature`.
 *
 * ── ¿Por qué leer la TABLA y no llamar a la RPC `app.salon_has_feature`? ───────
 * El helper `app.salon_has_feature()` vive en el esquema `app`, que PostgREST NO
 * expone, así que no es invocable vía `supabase.rpc()`. La verdad del entitlement
 * se lee de `public.salon_features` con IDÉNTICA semántica (fila presente y
 * `enabled = true`) a través de {@link salonHasFeature} (ver `@/lib/salon-features`).
 * Se usa el cliente ADMIN (service_role): la petición es máquina-a-máquina, NO hay
 * `auth.uid()`, luego la RLS de miembro no aplica; la lectura autoritativa omite
 * RLS y se acota A MANO por `salon_id`.
 *
 * ── SERVER-ONLY ──────────────────────────────────────────────────────────────
 * Depende de {@link createAdminClient} (SERVICE ROLE), que exige
 * `SUPABASE_SERVICE_ROLE_KEY` —variable SIN prefijo `NEXT_PUBLIC_`, solo en el
 * servidor—. NUNCA importar este módulo desde código de cliente (igual que su
 * hermano `@/lib/service-keys/verify`).
 *
 * ── Uso típico (envoltura) ───────────────────────────────────────────────────
 * ```ts
 * // app/api/reception/appointments/route.ts
 * export const dynamic = "force-dynamic";
 * export const POST = withReceptionGuard(async (request, { salonId }) => {
 *   const cita = await crearCitaRecepcion(salonId, await request.json());
 *   return receptionCreated(cita);            // 201, no-store
 * });
 * // El guard ya respondió 401/403 si procedía; aquí `salonId` es de fiar.
 * ```
 */
import type { NextRequest, NextResponse } from "next/server";

import { ReceptionError } from "@/lib/reception/errors";
import { receptionErrorResponse } from "@/lib/reception/http";
import { salonHasFeature } from "@/lib/salon-features";
import {
  requireServiceApiKey,
  type ServiceApiKeyIdentity,
} from "@/lib/service-keys/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalonFeature } from "@/types/database";

/**
 * Add-on que TODO endpoint de `/api/reception` EXIGE. Se nombra UNA sola vez y se
 * tipa contra el enum `SalonFeature`, así que un typo no compila. Cambiar aquí el
 * add-on requerido lo propaga a todos los handlers guardados.
 */
export const RECEPTION_FEATURE: SalonFeature = "ai_receptionist";

/** Cliente Supabase con service_role (omite RLS). Ver `@/lib/supabase/admin`. */
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Dependencias INYECTABLES del guard (para tests deterministas; en producción se
 * usan los defaults reales). Mismo patrón que `AuthenticateServiceApiKeyDeps`:
 * nunca se abre una conexión real ni se lee la hora del sistema en un test.
 */
export interface ReceptionGuardDeps {
  /** Cliente admin (service_role). Por defecto `createAdminClient()` (real). */
  admin?: AdminClient;
  /** Reloj para el sello `last_used_at` de la clave. Por defecto la hora real. */
  now?: () => string;
}

/**
 * Contexto RESUELTO que el guard entrega a cada handler tras superar authn+authz.
 * `salonId` es el dato central (el salón en cuyo nombre actúa la integración) y se
 * expone aparte por comodidad; `identity` trae además los `scopes` de la clave por
 * si un endpoint quiere AUTORIZAR una acción concreta (authn ≠ authz).
 */
export interface ReceptionGuardContext {
  /** Salón resuelto desde `x-api-key`. De fiar: la clave ya se validó. */
  readonly salonId: string;
  /** Identidad completa de la clave (keyId, salonId, scopes, keyPrefix). */
  readonly identity: ServiceApiKeyIdentity;
}

/**
 * Resuelve —y EXIGE— el contexto de una petición de recepción a partir de sus
 * cabeceras: autentica la `x-api-key` y comprueba el entitlement `ai_receptionist`.
 * Devuelve el {@link ReceptionGuardContext} si ambas superan; en caso contrario
 * LANZA un {@link ReceptionError} que el borde traduce con `receptionErrorResponse`:
 *
 *   · sin clave válida            → `ReceptionError.unauthorized()`   (401)
 *   · salón sin `ai_receptionist` → `ReceptionError.featureNotEnabled()` (403)
 *   · fallo al leer el catálogo   → `ReceptionError.internal(cause)`  (500, FAIL-CLOSED)
 *
 * Un ÚNICO cliente admin se comparte entre la verificación de la clave y la lectura
 * del entitlement (un solo `createAdminClient()` por petición). Pensado para usarse
 * desde {@link withReceptionGuard}, pero se exporta suelto para handlers que
 * necesiten control fino (p. ej. leer el cuerpo antes de decidir).
 */
export async function resolveReceptionContext(
  headers: Headers,
  deps: ReceptionGuardDeps = {},
): Promise<ReceptionGuardContext> {
  const admin: AdminClient = deps.admin ?? createAdminClient();

  // 1) AUTENTICACIÓN — x-api-key → salón. Lanza UNAUTHORIZED (401) si no procede.
  const identity = await requireServiceApiKey(headers, { admin, now: deps.now });

  // 2) ENTITLEMENT — el salón debe tener 'ai_receptionist' contratado y activo.
  let enabled: boolean;
  try {
    enabled = await salonHasFeature(admin, identity.salonId, RECEPTION_FEATURE);
  } catch (cause) {
    // FAIL-CLOSED: si el catálogo de add-ons no se puede leer, NO se concede acceso.
    // Es un fallo transitorio (500), NO "función no disponible" (403): la diferencia
    // importa para el consumidor. La `cause` se guarda para el log; jamás se serializa.
    throw ReceptionError.internal(
      cause,
      "No se pudo verificar el add-on de recepción.",
    );
  }
  if (!enabled) throw ReceptionError.featureNotEnabled();

  return { salonId: identity.salonId, identity };
}

/**
 * Firma de un handler de recepción YA guardado: recibe la `request`, el
 * {@link ReceptionGuardContext} resuelto (con el `salonId` de fiar) y el contexto de
 * ruta de Next (`{ params }` en rutas dinámicas; genérico para no atarlo a una).
 */
export type ReceptionRouteHandler<TContext = unknown> = (
  request: NextRequest,
  guard: ReceptionGuardContext,
  context: TContext,
) => NextResponse | Promise<NextResponse>;

/**
 * ENVUELVE un handler de `/api/reception` con el guard común (authn + entitlement).
 * Devuelve una función con la forma de un Route Handler de Next que:
 *
 *   1. resuelve el contexto con {@link resolveReceptionContext} —respondiendo
 *      401/403/500 del contrato si falla, sin ejecutar el handler—; y
 *   2. si supera, invoca el handler pasándole `request`, el guard resuelto y el
 *      contexto de ruta de Next.
 *
 * Cualquier throw —del guard O del propio handler— se traduce de forma UNIFORME con
 * `receptionErrorResponse`: un `ReceptionError` conserva su `status`; cualquier otro
 * valor colapsa a `500 INTERNAL_ERROR` sin filtrar el detalle interno. Gracias a esta
 * red, un handler guardado puede limitarse a `throw ReceptionError.slotTaken()` y
 * devolver el éxito, sin repetir su propio `try/catch`.
 *
 * `deps` es para TESTS (inyectar un admin/reloj falsos); en producción se omite.
 */
export function withReceptionGuard<TContext = unknown>(
  handler: ReceptionRouteHandler<TContext>,
  deps: ReceptionGuardDeps = {},
): (request: NextRequest, context: TContext) => Promise<NextResponse> {
  return async (request: NextRequest, context: TContext): Promise<NextResponse> => {
    try {
      const guard = await resolveReceptionContext(request.headers, deps);
      return await handler(request, guard, context);
    } catch (error) {
      return receptionErrorResponse(error);
    }
  };
}
