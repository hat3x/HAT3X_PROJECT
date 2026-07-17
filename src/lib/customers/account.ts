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
 * ── Requisito previo NO cubierto aquí: PROPIEDAD del teléfono ─────────────────
 * `linkOrCreateCustomerAccount` confía en que el teléfono recibido ya ha sido
 * VERIFICADO como propiedad del usuario (p. ej. OTP por SMS) ANTES de llamar. Sin esa
 * verificación previa, cualquiera podría reclamar el teléfono de otra persona y
 * apropiarse de su ficha (robo de identidad). La verificación OTP es responsabilidad
 * de la capa que invoca esta función (fuera del alcance de esta subtarea); aquí solo
 * se implementa la lógica de enlace/creación una vez probada la posesión.
 *
 * USO EXCLUSIVO DE SERVIDOR (usa el cliente admin y cookies de sesión). No importar
 * desde componentes cliente.
 */
import { z } from "zod";

import { normalizePhone } from "@/lib/customers/normalize-phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Código de error de dominio → estado HTTP con el que traducirlo en el borde. */
export type CustomerAccountErrorCode =
  | "unauthorized"
  | "forbidden"
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
  /** Teléfono (en cualquier formato) YA verificado como del usuario; se normaliza a E.164. */
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

/** Id del usuario autenticado, o 401 si no hay sesión. */
async function requireAuthenticatedUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    throw new CustomerAccountError("unauthorized", 401, "No autorizado.");
  }
  return user.id;
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

/** Ficha del salón con ese teléfono canónico, o null. Usa el índice único (salon_id, phone_e164). */
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
    .maybeSingle();
  if (error !== null) {
    throw new CustomerAccountError("internal", 500, "No se pudo buscar la ficha por teléfono.");
  }
  return data;
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
 *   3. Si ya existe ficha con ese teléfono en el salón:
 *        · sin cuenta        → se enlaza          (outcome "linked").
 *        · misma cuenta      → no-op idempotente  (outcome "already_linked").
 *        · otra cuenta       → conflicto 409.
 *   4. Si no existe, se CREA la ficha con `user_id`. El resto lo hace la BD sola: el
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
 * PROPIEDAD DEL TELÉFONO: ver la nota de cabecera del módulo — se asume verificado (OTP)
 * aguas arriba.
 *
 * @throws {CustomerAccountError} `invalid_request` (datos inválidos / teléfono sin número);
 *   `unauthorized` (sin sesión); `forbidden` (la cuenta no es la del usuario autenticado);
 *   `not_found` (salón inexistente); `conflict` (teléfono de otra cuenta); `internal`.
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
  const sessionUserId = await requireAuthenticatedUserId();
  if (sessionUserId !== userId) {
    throw new CustomerAccountError("forbidden", 403, "Solo puedes vincular tu propia cuenta.");
  }

  const phoneE164 = normalizePhone(parsed.data.phone);
  if (phoneE164 === null) {
    throw new CustomerAccountError("invalid_request", 400, "El teléfono no es válido.");
  }

  const admin = createAdminClient();
  await assertSalonExists(admin, salonId);

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
