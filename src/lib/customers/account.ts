/**
 * Alta / enlace de la FICHA de cliente con su CUENTA de auth — acciones de SERVIDOR.
 *
 * Implementa la "identidad por teléfono" de FASE 3 (ver docs/roadmap-productizacion.md
 * y las migraciones 20260717100000_customers_user_id / 20260717110000_customers_phone_e164
 * / 20260717120000_rls_self_customer). El teléfono es la CLAVE NATURAL con la que se
 * reconoce a una persona; la columna GENERADA `customers.phone_e164` la canonicaliza a
 * E.164 y un índice ÚNICO PARCIAL `(salon_id, phone_e164)` garantiza "un teléfono = una
 * ficha por salón".
 *
 * Piezas:
 *   · findCustomerByPhone(salonId, phone)     — ¿existe ya este número en MI salón? (staff)
 *   · linkOrCreateCustomerAccount(input)       — enlaza/crea la ficha de la cuenta (self)
 *   · getMyCustomer(userId?)                    — la(s) ficha(s) del cliente autenticado
 *
 * ── Seguridad (aislamiento multi-tenant + no exponer a terceros) ──────────────
 * Dos clientes Supabase, como en `@/lib/loyalty/server` y `@/lib/booking/server`:
 *   · Cliente RLS de la SESIÓN (`@/lib/supabase/server`) para AUTORIZAR y para las
 *     lecturas del propio usuario (las políticas de Postgres ya acotan por salón /
 *     por `user_id = auth.uid()`, así que una consulta cruzada no ve nada ajeno).
 *   · Cliente ADMIN (service role, omite RLS) SOLO en el enlace/creación de cuenta,
 *     porque quien se registra en la app de cliente NO es miembro del salón y su ficha
 *     aún tiene `user_id = NULL`: bajo RLS no podría ni verla ni enlazarla. Al usar el
 *     admin se acota SIEMPRE a mano por `salon_id` (nunca se cruza de salón) y se exige
 *     que la cuenta que enlaza sea la del propio usuario autenticado.
 *
 * ── PROPIEDAD del teléfono: la GARANTIZA esta capa (gate OTP, fail-closed) ────
 * El teléfono es la CLAVE NATURAL de identidad, así que enlazar/crear una ficha por
 * teléfono SIN probar que ese número es de quien lo declara permitiría reclamar la ficha
 * de otra persona (robo de identidad + de puntos). Antes esta capa DELEGABA esa
 * verificación al llamante; ya NO: `linkOrCreateCustomerAccount` la EXIGE aquí, con el
 * MISMO criterio que la RPC gemela `register_my_customer_account` (paso 3.2 de la
 * migración 20260719120000):
 *   · Fail-closed por salón: consulta la válvula `require_phone_verification`
 *     (`public.salon_security_settings`, migración 20260719110000). SIN fila ⇒ se EXIGE
 *     verificación; solo una fila EXPLÍCITA `= false` (acto de HAT3X, solo dev/staging)
 *     la salta.
 *   · Prueba de posesión: cuando se exige, el teléfono declarado debe coincidir —ya
 *     normalizado a E.164— con el teléfono CONFIRMADO de la cuenta autenticada
 *     (`auth.users.phone` + `phone_confirmed_at`, sellados por el OTP de Supabase/GoTrue;
 *     aquí se leen con `auth.getUser()`). Si no hay teléfono confirmado o no coincide ⇒
 *     `CustomerAccountError('phone_not_verified', 403)`.
 *
 * USO EXCLUSIVO DE SERVIDOR (usa el cliente admin y cookies de sesión). No importar
 * desde componentes cliente.
 */
import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizePhone } from "@/lib/customers/normalize-phone";
import {
  LOYALTY_FEATURE_DISABLED_MESSAGE,
  salonHasFeature,
} from "@/lib/salon-features";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Código de error de dominio → estado HTTP con el que traducirlo en el borde. */
export type CustomerAccountErrorCode =
  | "unauthorized"
  | "forbidden"
  | "phone_not_verified"
  | "feature_not_enabled"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "internal";

/**
 * Error de dominio del alta/enlace de cliente, con estado HTTP asociado (mismo patrón
 * que `BookingError` / `LoyaltyActionError`). Permite a un Route Handler o Server Action
 * traducir el fallo a la respuesta adecuada sin filtrar detalles internos.
 */
export class CustomerAccountError extends Error {
  constructor(
    public readonly code: CustomerAccountErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CustomerAccountError";
  }
}

// -----------------------------------------------------------------------------
// Entrada y salida de linkOrCreateCustomerAccount
// -----------------------------------------------------------------------------

/**
 * Resultado del enlace/creación:
 *   · "created"        — no existía ficha con ese teléfono: se creó una nueva enlazada.
 *   · "linked"         — existía una ficha SIN cuenta: se enlazó a esta cuenta ahora.
 *   · "already_linked" — la ficha ya estaba enlazada a ESTA misma cuenta (no-op idempotente).
 */
export type LinkOrCreateOutcome = "created" | "linked" | "already_linked";

/** Entrada de {@link linkOrCreateCustomerAccount}. */
export interface LinkOrCreateCustomerInput {
  /** Salón en cuyo padrón se enlaza/crea la ficha. */
  salon_id: string;
  /** Cuenta de auth (auth.users.id) que se enlaza. DEBE ser la del usuario autenticado. */
  user_id: string;
  /**
   * Teléfono (en cualquier formato) que se normaliza a E.164. Debe pertenecer al usuario:
   * salvo válvula relajada, esta capa exige que coincida con el teléfono CONFIRMADO de la
   * cuenta (gate OTP; ver cabecera del módulo) o falla con `phone_not_verified`.
   */
  phone: string;
  /** Nombre para la ficha (obligatorio al crear). */
  full_name: string;
  /** Email opcional de la ficha. */
  email?: string | null;
}

/** Salida de {@link linkOrCreateCustomerAccount}: la ficha final y qué ocurrió. */
export interface LinkOrCreateCustomerResult {
  customer: Customer;
  outcome: LinkOrCreateOutcome;
}

/**
 * Validación de confianza en servidor (api-design: Zod en el borde). Recorta espacios,
 * exige nombre y teléfono no vacíos y normaliza el email opcional a `undefined`.
 */
const linkOrCreateSchema = z.object({
  salon_id: z.string().trim().min(1, "salon_id es obligatorio."),
  user_id: z.string().trim().min(1, "user_id es obligatorio."),
  phone: z.string().trim().min(1, "El teléfono es obligatorio."),
  full_name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(120, "El nombre no puede superar 120 caracteres."),
  email: z
    .string()
    .trim()
    .max(255)
    .email("Email no válido.")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === undefined || value === "" ? undefined : value.toLowerCase())),
});

// -----------------------------------------------------------------------------
// Autorización (cliente RLS de la sesión)
// -----------------------------------------------------------------------------

/**
 * Usuario autenticado COMPLETO (incluye `phone` y `phone_confirmed_at`, que necesita el
 * gate OTP), o 401 si no hay sesión. `getUser()` valida el token contra el servidor de
 * auth y devuelve el registro AUTORITATIVO de la cuenta, así que la confirmación del
 * teléfono es de fiar (no depende de un claim del JWT, que no la transporta).
 */
async function requireAuthenticatedUser(): Promise<User> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    throw new CustomerAccountError("unauthorized", 401, "No autorizado.");
  }
  return user;
}

/** Id del usuario autenticado, o 401 si no hay sesión. */
async function requireAuthenticatedUserId(): Promise<string> {
  return (await requireAuthenticatedUser()).id;
}

/**
 * Exige que el usuario autenticado sea MIEMBRO de `salonId` (staff). Se usa en el
 * lookup de duplicados por teléfono, que es una herramienta de personal del salón.
 * Maneja usuarios con pertenencia a varios salones (filtra por `salon_id`).
 */
async function requireMembershipForSalon(salonId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    throw new CustomerAccountError("unauthorized", 401, "No autorizado.");
  }

  const { data, error } = await supabase
    .from("salon_members")
    .select("salon_id")
    .eq("user_id", user.id)
    .eq("salon_id", salonId)
    .maybeSingle();

  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo verificar la pertenencia.");
  }
  if (data === null) {
    throw new CustomerAccountError("forbidden", 403, "Sin permiso en este salón.");
  }
}

// -----------------------------------------------------------------------------
// Helpers de datos (cliente admin — acotado a mano por salon_id)
// -----------------------------------------------------------------------------

/**
 * La ficha del salón con ese teléfono canónico.
 *
 * ── POR QUÉ PUEDE HABER VARIAS ──────────────────────────────────────────────
 * Un teléfono es de una FAMILIA: la madre da su móvil para ella y para sus
 * hijos, y cada uno tiene su ficha. Antes lo impedía un índice único; ahora no,
 * porque impedirlo dejaba a un tercio de los pacientes sin número de contacto.
 *
 * Con varias fichas NO se elige una. Este camino enlaza una CUENTA con una
 * ficha, y enlazarla a la persona equivocada le daría acceso al historial
 * clínico de un familiar. Se falla en claro y lo resuelve la clínica, que sabe
 * quién es quién.
 */
async function findCustomerByPhoneE164(
  admin: AdminClient,
  salonId: string,
  phoneE164: string,
): Promise<Customer | null> {
  const { data, error } = await admin
    .from("customers")
    .select("*")
    .eq("salon_id", salonId)
    .eq("phone_e164", phoneE164)
    .order("created_at", { ascending: true });
  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo buscar la ficha por teléfono.");
  }
  const filas = data ?? [];
  if (filas.length === 0) return null;
  if (filas.length > 1) {
    throw new CustomerAccountError(
      "conflict",
      409,
      "Ese teléfono está en varias fichas de la clínica. Pídeles que enlacen la tuya: " +
        "desde aquí no podemos saber cuál es la tuya sin arriesgarnos a darte la de otra persona.",
    );
  }
  return filas[0] ?? null;
}

/** Ficha del salón enlazada a esa cuenta, o null. Usa el índice único (salon_id, user_id). */
async function findCustomerByUserId(
  admin: AdminClient,
  salonId: string,
  userId: string,
): Promise<Customer | null> {
  const { data, error } = await admin
    .from("customers")
    .select("*")
    .eq("salon_id", salonId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo buscar la ficha por cuenta.");
  }
  return data;
}

/** Ficha por id dentro del salón (re-lectura tras una posible carrera), o null. */
async function findCustomerById(
  admin: AdminClient,
  salonId: string,
  customerId: string,
): Promise<Customer | null> {
  const { data, error } = await admin
    .from("customers")
    .select("*")
    .eq("salon_id", salonId)
    .eq("id", customerId)
    .maybeSingle();
  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo releer la ficha.");
  }
  return data;
}

/** Confirma que el salón existe (el admin omite RLS: validación explícita). */
async function assertSalonExists(admin: AdminClient, salonId: string): Promise<void> {
  const { data, error } = await admin
    .from("salons")
    .select("id")
    .eq("id", salonId)
    .maybeSingle();
  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo verificar el salón.");
  }
  if (data === null) {
    throw new CustomerAccountError("not_found", 404, "Salón no encontrado.");
  }
}

/**
 * Gate de negocio (entitlement): exige que el salón tenga contratado Y activo el
 * add-on de fidelización ('loyalty'). El alta/enlace de la ficha de cliente dispara
 * el trigger que crea la cuenta de puntos + el cupón de bienvenida, de modo que sin
 * el add-on no procede ⇒ `feature_not_enabled` (403). Se comprueba tras
 * `assertSalonExists` (un salón inexistente sigue dando 404 primero). Lee la verdad
 * de `public.salon_features` con el cliente ADMIN (acotado a mano por `salon_id`).
 */
async function requireLoyaltyFeature(admin: AdminClient, salonId: string): Promise<void> {
  let enabled: boolean;
  try {
    enabled = await salonHasFeature(admin, salonId, "loyalty");
  } catch {
    throw new CustomerAccountError(
      "internal",
      500,
      "No se pudo verificar el add-on de fidelización.",
    );
  }
  if (!enabled) {
    throw new CustomerAccountError(
      "feature_not_enabled",
      403,
      LOYALTY_FEATURE_DISABLED_MESSAGE,
    );
  }
}

/**
 * Gate de seguridad FAIL-CLOSED: ¿este salón EXIGE que el teléfono esté verificado (OTP)
 * antes de fiarse de él como identidad? Espejo TS de `app.salon_requires_phone_verification`
 * (migración 20260719110000). Como esa función vive en el esquema `app` (que PostgREST no
 * expone), la verdad se lee de la TABLA `public.salon_security_settings` con el cliente
 * ADMIN, acotando por `salon_id` — mismo motivo y patrón que `salonHasFeature`.
 *
 * Fail-closed (idéntico al `not exists(… = false)` del gate SQL): SIN fila ⇒ `true`
 * (exigir, seguro por defecto); con fila ⇒ el valor de la válvula (columna NOT NULL). Solo
 * un `require_phone_verification = false` EXPLÍCITO (acto de HAT3X, solo dev/staging)
 * devuelve `false`.
 */
async function salonRequiresPhoneVerification(
  admin: AdminClient,
  salonId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("salon_security_settings")
    .select("require_phone_verification")
    .eq("salon_id", salonId)
    .maybeSingle();
  if (error !== null) {
    throw new CustomerAccountError(
      "internal",
      500,
      "No se pudo verificar la configuración de seguridad del salón.",
    );
  }
  return data === null ? true : data.require_phone_verification;
}

/**
 * Gate OTP (propiedad del teléfono) — espejo TS del paso 3.2 de la RPC
 * `register_my_customer_account` (migración 20260719120000). Salvo que el salón haya
 * RELAJADO la válvula ({@link salonRequiresPhoneVerification}, fail-closed), exige que el
 * teléfono declarado (`phoneE164`, ya en E.164) coincida con el teléfono CONFIRMADO de la
 * cuenta autenticada.
 *
 * "Confirmado" = hay sello `phone_confirmed_at` Y `user.phone` (que GoTrue guarda en E.164
 * pero SIN el '+' de cabecera, p. ej. '34612…'). Se le antepone '+' para que
 * `normalizePhone` lo trate como el E.164 internacional que es y lo compare en la MISMA
 * forma canónica que `phoneE164`; sin ese '+', un '34…' se tomaría por número nacional y se
 * le añadiría otro '34' (basura), y ningún verificado coincidiría. `normalizePhone` colapsa
 * un '+' doble, así que es robusto aunque un GoTrue futuro guardara ya el prefijo.
 *
 * Se llama TRAS el feature-gate y ANTES de tocar/crear fichas (mismo orden que la RPC):
 * sin teléfono verificado no se enlaza ficha ajena ni se crea una nueva.
 */
async function requireVerifiedPhoneOwnership(
  admin: AdminClient,
  salonId: string,
  user: User,
  phoneE164: string,
): Promise<void> {
  if (!(await salonRequiresPhoneVerification(admin, salonId))) {
    return; // Válvula relajada (solo dev/staging): reabre el agujero de suplantación.
  }
  const verifiedPhone =
    user.phone_confirmed_at != null && user.phone
      ? normalizePhone(`+${user.phone}`)
      : null;
  if (verifiedPhone === null || verifiedPhone !== phoneE164) {
    throw new CustomerAccountError(
      "phone_not_verified",
      403,
      "Verifica tu teléfono antes de vincular tu cuenta.",
    );
  }
}

/**
 * Reconcilia una ficha YA EXISTENTE con la cuenta que se quiere enlazar:
 *   · misma cuenta            → no-op idempotente ("already_linked").
 *   · sin cuenta (user_id null) → la enlaza (UPDATE condicional a `user_id is null`).
 *   · otra cuenta             → CONFLICTO claro (409): el teléfono es de otra persona.
 * El UPDATE es condicional para no pisar una carrera con otro enlace concurrente.
 */
async function reconcileExisting(
  admin: AdminClient,
  existing: Customer,
  salonId: string,
  userId: string,
): Promise<LinkOrCreateCustomerResult> {
  if (existing.user_id === userId) {
    return { customer: existing, outcome: "already_linked" };
  }
  if (existing.user_id !== null) {
    throw new CustomerAccountError(
      "conflict",
      409,
      "Este teléfono ya está vinculado a otra cuenta en este salón.",
    );
  }

  // user_id === null → enlazar solo si SIGUE sin cuenta (guarda contra carreras).
  const { data: linked, error } = await admin
    .from("customers")
    .update({ user_id: userId })
    .eq("id", existing.id)
    .eq("salon_id", salonId)
    .is("user_id", null)
    .select("*")
    .maybeSingle();
  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo enlazar la ficha.");
  }
  if (linked !== null) {
    return { customer: linked, outcome: "linked" };
  }

  // Perdimos la carrera: otra petición enlazó la ficha entre la lectura y el UPDATE.
  // Releemos y decidimos: si acabó siendo nuestra cuenta, no-op; si no, conflicto.
  const current = await findCustomerById(admin, salonId, existing.id);
  if (current !== null && current.user_id === userId) {
    return { customer: current, outcome: "already_linked" };
  }
  throw new CustomerAccountError(
    "conflict",
    409,
    "Este teléfono ya está vinculado a otra cuenta en este salón.",
  );
}

// -----------------------------------------------------------------------------
// 1. findCustomerByPhone — ¿existe ya este número en MI salón? (staff)
// -----------------------------------------------------------------------------

/**
 * Busca la ficha del salón cuyo teléfono, normalizado a E.164, coincide con `phone`.
 * Pensada para que el STAFF detecte duplicados antes de dar de alta ("¿ya tengo a esta
 * persona?"). Devuelve la ficha o `null` (no hay coincidencia, o el teléfono no contiene
 * un número real).
 *
 * Aislamiento: exige que el usuario autenticado sea MIEMBRO de `salonId` y consulta con
 * el cliente RLS de la sesión, doblemente acotado por `salon_id`. Nunca devuelve fichas
 * de otro salón.
 *
 * @throws {CustomerAccountError} `invalid_request` si falta `salonId`; `unauthorized`
 *   sin sesión; `forbidden` si no es miembro del salón; `internal` ante fallo de consulta.
 */
export async function findCustomerByPhone(
  salonId: string,
  phone: string,
): Promise<Customer | null> {
  if (typeof salonId !== "string" || salonId.trim() === "") {
    throw new CustomerAccountError("invalid_request", 400, "salon_id es obligatorio.");
  }
  await requireMembershipForSalon(salonId);

  const phoneE164 = normalizePhone(phone);
  if (phoneE164 === null) {
    // Sin número real no puede haber coincidencia por teléfono canónico.
    return null;
  }

  const supabase = createClient(); // RLS: solo fichas del salón del usuario
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("salon_id", salonId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo buscar la ficha por teléfono.");
  }
  return data;
}

// -----------------------------------------------------------------------------
// 2. linkOrCreateCustomerAccount — enlaza/crea la ficha de la cuenta (self)
// -----------------------------------------------------------------------------

/**
 * Enlaza (o crea) la ficha de cliente correspondiente a una CUENTA de auth, identificando
 * a la persona por su TELÉFONO. Idempotente. Flujo:
 *   1. Autoservicio: la cuenta a enlazar (`user_id`) DEBE ser la del usuario autenticado.
 *   2. Se normaliza el teléfono a E.164; sin número real ⇒ `invalid_request`.
 *   3. El salón debe existir (`not_found`) y tener el add-on de fidelización
 *      (`feature_not_enabled`, 403).
 *   4. Gate OTP (fail-closed por salón): salvo válvula relajada, el teléfono debe ser el
 *      CONFIRMADO de la cuenta autenticada, o ⇒ `phone_not_verified` (403). Ver cabecera.
 *   5. Si ya existe ficha con ese teléfono en el salón:
 *        · sin cuenta        → se enlaza          (outcome "linked").
 *        · misma cuenta      → no-op idempotente  (outcome "already_linked").
 *        · otra cuenta       → conflicto 409.
 *   6. Si no existe, se CREA la ficha con `user_id`. El resto lo hace la BD sola: el
 *      DEFAULT rellena `qr_token`, la columna generada calcula `phone_e164` y el trigger
 *      `trg_customers_bootstrap_loyalty` crea la cuenta de puntos + el cupón de bienvenida.
 *
 * Devuelve la ficha final y si fue creada/enlazada/ya-enlazada.
 *
 * Idempotencia y carreras: si dos peticiones concurren, el índice único `(salon_id,
 * phone_e164)` / `(salon_id, user_id)` protege la BD; ante un `23505` re-resolvemos por
 * teléfono y por cuenta y aplicamos la misma lógica de enlace, de modo que el reintento
 * converge sin duplicar ni lanzar un error opaco.
 *
 * PROPIEDAD DEL TELÉFONO: la GARANTIZA esta capa (paso 4), en paridad con la RPC gemela
 * `register_my_customer_account`. Ver la nota de cabecera del módulo.
 *
 * @throws {CustomerAccountError} `invalid_request` (datos inválidos / teléfono sin número);
 *   `unauthorized` (sin sesión); `forbidden` (la cuenta no es la del usuario autenticado);
 *   `not_found` (salón inexistente); `feature_not_enabled` (salón sin fidelización);
 *   `phone_not_verified` (teléfono no confirmado o distinto del de la cuenta); `conflict`
 *   (teléfono de otra cuenta); `internal`.
 */
export async function linkOrCreateCustomerAccount(
  input: LinkOrCreateCustomerInput,
): Promise<LinkOrCreateCustomerResult> {
  const parsed = linkOrCreateSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Datos de la cuenta no válidos.";
    throw new CustomerAccountError("invalid_request", 400, message);
  }
  const { salon_id: salonId, user_id: userId, full_name: fullName, email } = parsed.data;

  // Autoservicio: solo puedes enlazar/crear TU PROPIA ficha. Impide que un usuario
  // autenticado enlace la cuenta de otra persona o cree fichas para cuentas ajenas.
  const sessionUser = await requireAuthenticatedUser();
  if (sessionUser.id !== userId) {
    throw new CustomerAccountError("forbidden", 403, "Solo puedes vincular tu propia cuenta.");
  }

  const phoneE164 = normalizePhone(parsed.data.phone);
  if (phoneE164 === null) {
    throw new CustomerAccountError("invalid_request", 400, "El teléfono no es válido.");
  }

  const admin = createAdminClient();
  await assertSalonExists(admin, salonId);
  await requireLoyaltyFeature(admin, salonId); // 403 si el salón no tiene el add-on
  // Gate OTP (propiedad del teléfono, fail-closed por salón): tras el feature-gate y antes
  // de tocar/crear fichas. 403 `phone_not_verified` si el número no está confirmado o no es
  // el de la cuenta (impide reclamar la ficha de otra persona). Espejo del paso 3.2 de la RPC.
  await requireVerifiedPhoneOwnership(admin, salonId, sessionUser, phoneE164);

  // ¿Ya existe la persona (por teléfono) en este salón?
  const existing = await findCustomerByPhoneE164(admin, salonId, phoneE164);
  if (existing !== null) {
    return reconcileExisting(admin, existing, salonId, userId);
  }

  // No existe: crear la ficha enlazada. phone_e164/qr_token/cuenta+cupón los pone la BD.
  const { data: created, error } = await admin
    .from("customers")
    .insert({
      salon_id: salonId,
      user_id: userId,
      phone: parsed.data.phone,
      full_name: fullName,
      email: email ?? null,
    })
    .select("*")
    .single();

  if (error === null && created !== null) {
    return { customer: created, outcome: "created" };
  }

  // Carrera / estado previo: el índice único rechazó la inserción. Re-resolvemos.
  if (error !== null && error.code === "23505") {
    const byPhone = await findCustomerByPhoneE164(admin, salonId, phoneE164);
    if (byPhone !== null) {
      return reconcileExisting(admin, byPhone, salonId, userId);
    }
    // El choque fue por (salon_id, user_id): la cuenta ya tenía ficha aquí (con otro
    // teléfono). Idempotente: devolvemos esa ficha sin crear una segunda.
    const byUser = await findCustomerByUserId(admin, salonId, userId);
    if (byUser !== null) {
      return { customer: byUser, outcome: "already_linked" };
    }
  }

  throw new CustomerAccountError("internal", 500, "No se pudo crear la ficha del cliente.");
}

// -----------------------------------------------------------------------------
// 3. getMyCustomer — la(s) ficha(s) del cliente autenticado
// -----------------------------------------------------------------------------

/**
 * Devuelve las fichas de cliente enlazadas a la cuenta autenticada. Es un ARRAY porque
 * Salón OS es multi-tenant: la misma persona puede ser cliente de VARIOS salones (una
 * ficha por salón, todas con el mismo `user_id`). Vacío si la cuenta aún no tiene ninguna
 * ficha enlazada.
 *
 * `userId` es opcional: por defecto se resuelve de la sesión. Si se pasa, DEBE coincidir
 * con el usuario autenticado (nunca se permite leer la ficha de otra persona).
 *
 * Aislamiento: consulta con el cliente RLS de la sesión y filtra por `user_id`; la política
 * `self_select_own_customer` (RLS) ya restringe a `user_id = auth.uid()`, de modo que es
 * imposible devolver la ficha de otro cliente o de otro salón ajeno.
 *
 * @throws {CustomerAccountError} `unauthorized` sin sesión; `forbidden` si `userId` no es
 *   el del usuario autenticado; `internal` ante fallo de consulta.
 */
export async function getMyCustomer(userId?: string): Promise<Customer[]> {
  const sessionUserId = await requireAuthenticatedUserId();
  if (userId !== undefined && userId !== sessionUserId) {
    throw new CustomerAccountError("forbidden", 403, "Solo puedes consultar tu propia ficha.");
  }

  const supabase = createClient(); // RLS: self_select_own_customer (user_id = auth.uid())
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", sessionUserId)
    .order("created_at", { ascending: true });

  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo consultar la ficha del cliente.");
  }
  return data ?? [];
}

// -----------------------------------------------------------------------------
// 4. getMyCustomerForSalon — la ficha del cliente autenticado en UN salón (self, suave)
// -----------------------------------------------------------------------------

/**
 * Ficha del cliente AUTENTICADO en un salón concreto, o `null`. Variante «suave» de
 * {@link getMyCustomer} pensada para contextos PÚBLICOS —la reserva en línea (sub-6)—,
 * donde precargar sus datos es una CONVENIENCIA, no un flujo autenticado:
 *
 *   · SIN sesión NO lanza `unauthorized`: devuelve `null`. La página `/reservar/[slug]`
 *     es pública y el visitante anónimo es el caso COMÚN y esperado; no debe tratarse
 *     como un error. (Es la única diferencia de contrato con `getMyCustomer`.)
 *   · CON sesión reutiliza la lectura self (RLS `self_select_own_customer`,
 *     `user_id = auth.uid()`) y, además, acota por `salon_id`. Como el único parcial
 *     `(salon_id, user_id)` garantiza una ficha por salón, `maybeSingle()` devuelve esa
 *     única ficha o `null` si esta cuenta aún no es cliente de ESTE salón.
 *
 * Doble aislamiento: RLS (solo `user_id = auth.uid()`) + filtro por `salon_id`. Nunca
 * puede devolver la ficha de otra cuenta ni la de otro salón. Un fallo REAL de consulta
 * sí se propaga (`internal` 500): la política de «best-effort, nunca romper la reserva»
 * la aplica quien llama (ver `@/lib/booking/prefill`), no esta primitiva.
 *
 * @throws {CustomerAccountError} `internal` ante fallo de consulta (nunca `unauthorized`).
 */
export async function getMyCustomerForSalon(salonId: string): Promise<Customer | null> {
  const supabase = createClient(); // RLS: self_select_own_customer (user_id = auth.uid())
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return null; // anónimo: sin datos que precargar, sin error

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .eq("salon_id", salonId)
    .maybeSingle();

  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo consultar la ficha del cliente.");
  }
  return data;
}
