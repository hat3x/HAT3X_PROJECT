/**
 * Núcleo NATIVO de fidelización de Salón OS — acciones de SERVIDOR.
 *
 * Réplica sobre el esquema propio (migración `20260716120000_loyalty_base.sql`)
 * del comportamiento probado en denueveanueve (`verify-visit` / `loyalty-lookup`),
 * según el contrato de `docs/loyalty-rules-reference.md`.
 *
 * ── Seguridad (§4 de la nota) ────────────────────────────────────────────────
 * Los puntos son "casi dinero": el saldo NO debe poder fabricarse desde el
 * navegador. Por eso:
 *   · La AUTORIZACIÓN se hace con el cliente RLS de la sesión (pertenencia real
 *     del usuario al salón, vía `salon_members`).
 *   · La ESCRITURA sensible (acreditar puntos, generar recompensas, canjear
 *     cupones) se hace con el cliente ADMIN (service role) que omite RLS, SIEMPRE
 *     acotando a mano por `salon_id` —igual que `@/lib/booking/server`—.
 * `lookupByQr` es de solo lectura y usa el cliente RLS: un miembro solo puede
 * consultar clientes de SU salón (aislamiento multi-tenant).
 *
 * ── Atomicidad (limitación conocida) ─────────────────────────────────────────
 * `awardVisit` hace varias escrituras (cuenta + movimiento + recompensa + cupón)
 * con el cliente JS, que no abre una transacción multi-sentencia. El
 * incremento del saldo es un read-modify-write, con una pequeña ventana de
 * carrera bajo alta concurrencia sobre el MISMO cliente. Es "idempotencia/atomici-
 * dad razonable" (el requisito de la subtarea). Para blindarlo del todo, §5/§7 de
 * la nota recomiendan una RPC `SECURITY DEFINER` que haga `points_balance =
 * points_balance + X` y todas las inserciones en UNA transacción; esta capa TS
 * queda lista para reapuntarse a esa RPC sin cambiar su firma pública.
 *
 * USO EXCLUSIVO DE SERVIDOR (importa `node:crypto`, el cliente admin y cookies de
 * sesión). No importar desde componentes cliente.
 */
import { randomBytes as nodeRandomBytes } from "node:crypto";

import {
  addDaysIso,
  computeCouponDiscountCents,
  computeVisitPoints,
  formatRewardCode,
  milestoneForVisitCount,
  randomRewardSuffix,
} from "@/lib/loyalty/points";
import {
  DEFAULT_LOYALTY_CONFIG,
  type AwardVisitResult,
  type LoyaltyConfig,
  type LoyaltyCouponView,
  type LoyaltyLineItem,
  type LoyaltyLookupResult,
  type LoyaltyRefType,
  type LoyaltyRewardView,
} from "@/lib/loyalty/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Código de error de dominio → estado HTTP con el que traducirlo en el borde. */
export type LoyaltyActionErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "internal";

/**
 * Error de dominio de la fidelización nativa, con estado HTTP asociado (patrón de
 * `BookingError`). Nombre distinto del `LoyaltyError` de la capa proxy
 * (`@/lib/loyalty`) para no confundir ambos módulos.
 */
export class LoyaltyActionError extends Error {
  constructor(
    public readonly code: LoyaltyActionErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LoyaltyActionError";
  }
}

/** Snapshot mínimo de la cuenta de fidelización tras asegurarla. */
interface LoyaltyAccountSnapshot {
  id: string;
  points_balance: number;
  visits_total: number;
  last_visit_at: string | null;
}

// -----------------------------------------------------------------------------
// Autorización (cliente RLS de la sesión)
// -----------------------------------------------------------------------------

/** Salón activo del usuario autenticado, o 401 si no hay sesión/pertenencia. */
async function requireActiveSalonId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    throw new LoyaltyActionError("unauthorized", 401, "No autorizado.");
  }

  const { data, error } = await supabase
    .from("salon_members")
    .select("salon_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo resolver el salón activo.");
  }
  if (data === null) {
    throw new LoyaltyActionError("unauthorized", 401, "No autorizado.");
  }
  return data.salon_id;
}

/**
 * Verifica que el usuario autenticado pertenece a `salonId` (y, si se pasa
 * `allowedRoles`, que tiene uno de esos roles). Devuelve su rol. Maneja
 * correctamente usuarios con pertenencia a varios salones.
 */
async function requireMembershipForSalon(
  salonId: string,
  allowedRoles?: readonly MemberRole[],
): Promise<MemberRole> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    throw new LoyaltyActionError("unauthorized", 401, "No autorizado.");
  }

  const { data, error } = await supabase
    .from("salon_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("salon_id", salonId)
    .maybeSingle();

  if (error !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo verificar la pertenencia.");
  }
  if (data === null) {
    throw new LoyaltyActionError("forbidden", 403, "Sin permiso en este salón.");
  }
  if (allowedRoles !== undefined && !allowedRoles.includes(data.role)) {
    throw new LoyaltyActionError("forbidden", 403, "Rol sin permiso para esta operación.");
  }
  return data.role;
}

// -----------------------------------------------------------------------------
// Helpers de datos (cliente admin — service role, acotado a mano por salon_id)
// -----------------------------------------------------------------------------

interface CustomerRow {
  id: string;
  full_name: string;
  qr_token: string;
}

/** Cliente por id o por token QR, SIEMPRE dentro de `salonId`. 404 si no existe. */
async function resolveCustomer(
  admin: AdminClient,
  salonId: string,
  customerId: string | undefined,
  qrToken: string | undefined,
): Promise<CustomerRow> {
  let query = admin
    .from("customers")
    .select("id, full_name, qr_token")
    .eq("salon_id", salonId);

  query =
    customerId !== undefined
      ? query.eq("id", customerId)
      : query.eq("qr_token", (qrToken ?? "").trim());

  const { data, error } = await query.maybeSingle();
  if (error !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo resolver el cliente.");
  }
  if (data === null) {
    throw new LoyaltyActionError("not_found", 404, "Cliente no encontrado.");
  }
  return data;
}

/** Confirma que el cliente pertenece al salón (defensa del cliente admin). */
async function assertCustomerInSalon(
  admin: AdminClient,
  customerId: string,
  salonId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (error !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo verificar el cliente.");
  }
  if (data === null) {
    throw new LoyaltyActionError("not_found", 404, "Cliente no encontrado en el salón.");
  }
}

/**
 * Asegura (idempotentemente) la cuenta de fidelización del cliente y devuelve su
 * snapshot. El trigger de bootstrap ya la crea al dar de alta al cliente; este
 * upsert `DO NOTHING` cubre clientes anteriores al add-on o reintentos.
 */
async function upsertLoyaltyAccount(
  admin: AdminClient,
  salonId: string,
  customerId: string,
): Promise<LoyaltyAccountSnapshot> {
  const { error: upsertError } = await admin
    .from("loyalty_accounts")
    .upsert(
      { salon_id: salonId, customer_id: customerId },
      { onConflict: "salon_id,customer_id", ignoreDuplicates: true },
    );
  if (upsertError !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo crear la cuenta de fidelización.");
  }

  const { data, error } = await admin
    .from("loyalty_accounts")
    .select("id, points_balance, visits_total, last_visit_at")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .single();
  if (error !== null || data === null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo leer la cuenta de fidelización.");
  }
  return data;
}

// -----------------------------------------------------------------------------
// 1. lookupByQr — SOLO LECTURA (§1.9)
// -----------------------------------------------------------------------------

/**
 * Estado de fidelización de un cliente por su token QR. Solo lectura: no escribe
 * nada. Acotado al salón activo del usuario (aislamiento multi-tenant vía RLS).
 *
 * @throws {LoyaltyActionError} `unauthorized` sin sesión; `not_found` si el QR no
 *   corresponde a ningún cliente del salón del usuario.
 */
export async function lookupByQr(qrToken: string): Promise<LoyaltyLookupResult> {
  const token = qrToken.trim();
  if (token === "") {
    throw new LoyaltyActionError("invalid_request", 400, "El QR es obligatorio.");
  }

  const salonId = await requireActiveSalonId();
  const supabase = createClient(); // RLS: solo clientes del salón del usuario

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name, qr_token")
    .eq("salon_id", salonId)
    .eq("qr_token", token)
    .maybeSingle();

  if (customerError !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo consultar el cliente.");
  }
  if (customer === null) {
    throw new LoyaltyActionError("not_found", 404, "QR de fidelización no encontrado.");
  }

  const nowIso = new Date().toISOString();

  const [accountRes, couponsRes, rewardsRes] = await Promise.all([
    supabase
      .from("loyalty_accounts")
      .select("points_balance, visits_total, last_visit_at")
      .eq("salon_id", salonId)
      .eq("customer_id", customer.id)
      .maybeSingle(),
    supabase
      .from("welcome_coupons")
      .select("id, percent_off, expires_at")
      .eq("salon_id", salonId)
      .eq("customer_id", customer.id)
      .eq("status", "ACTIVE")
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: true }),
    supabase
      .from("rewards")
      .select("id, type, code, expires_at")
      .eq("salon_id", salonId)
      .eq("customer_id", customer.id)
      .eq("status", "AVAILABLE")
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: true }),
  ]);

  if (accountRes.error !== null || couponsRes.error !== null || rewardsRes.error !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo consultar la fidelización.");
  }

  return {
    customer,
    points_balance: accountRes.data?.points_balance ?? 0,
    visits_total: accountRes.data?.visits_total ?? 0,
    last_visit_at: accountRes.data?.last_visit_at ?? null,
    welcome_coupons: couponsRes.data ?? [],
    rewards: rewardsRes.data ?? [],
  };
}

/**
 * Re-resuelve el `percent_off` AUTORITATIVO de un cupón de bienvenida para
 * aplicarlo como descuento en el TPV. El cliente NUNCA fija el porcentaje: envía
 * el `couponId` (+ su `customerId`) y aquí se comprueba, con el cliente RLS de la
 * sesión (aislamiento multi-tenant), que el cupón EXISTE en el salón activo,
 * pertenece a ese cliente, está `ACTIVE` y no ha caducado.
 *
 * Devuelve el `percent_off` del cupón vigente, o `null` si no cumple (caducado,
 * ya usado, ajeno o inexistente) —el llamador debe entonces cobrar SIN descuento
 * o pedir que se retire el cupón, nunca inventarse un porcentaje—.
 *
 * De solo lectura: NO transiciona el cupón a `USED` (ese canje, junto con la
 * acreditación de puntos de la venta, es responsabilidad de {@link awardVisit}).
 *
 * @throws {LoyaltyActionError} `unauthorized` sin sesión/pertenencia; `internal`
 *   ante un fallo de consulta.
 */
export async function resolveActiveCouponPercentOff(
  couponId: string,
  customerId: string,
): Promise<number | null> {
  const salonId = await requireActiveSalonId();
  const supabase = createClient(); // RLS: solo cupones del salón del usuario
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("welcome_coupons")
    .select("percent_off")
    .eq("salon_id", salonId)
    .eq("id", couponId)
    .eq("customer_id", customerId)
    .eq("status", "ACTIVE")
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo validar el cupón.");
  }
  return data?.percent_off ?? null;
}

// -----------------------------------------------------------------------------
// 2. ensureLoyaltyAccount — asegura la cuenta (idempotente)
// -----------------------------------------------------------------------------

/**
 * Asegura que el cliente tiene cuenta de fidelización y devuelve su snapshot.
 * Idempotente: no duplica si ya existe. `salonId` por defecto = salón activo del
 * usuario; se verifica pertenencia y que el cliente sea de ese salón.
 */
export async function ensureLoyaltyAccount(
  customerId: string,
  salonId?: string,
): Promise<LoyaltyAccountSnapshot> {
  const resolvedSalonId = salonId ?? (await requireActiveSalonId());
  await requireMembershipForSalon(resolvedSalonId);

  const admin = createAdminClient();
  await assertCustomerInSalon(admin, customerId, resolvedSalonId);
  return upsertLoyaltyAccount(admin, resolvedSalonId, customerId);
}

// -----------------------------------------------------------------------------
// 3. grantWelcomeCoupon — emite/reactiva el cupón de bienvenida (§1.7)
// -----------------------------------------------------------------------------

/**
 * Emite (o reactiva) el cupón de bienvenida del cliente con un `percentOff`
 * configurable. Un cupón por cliente (`unique (salon_id, customer_id)`): el
 * upsert deja el cupón ACTIVE, sin usar, con caducidad renovada. Restringido a
 * owner/manager (matriz RLS §4.1: alta de cupones = owner/manager).
 */
export async function grantWelcomeCoupon(
  customerId: string,
  percentOff: number = DEFAULT_LOYALTY_CONFIG.defaultWelcomePercentOff,
  options?: { salonId?: string; validityDays?: number },
): Promise<LoyaltyCouponView> {
  if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
    throw new LoyaltyActionError(
      "invalid_request",
      400,
      "El descuento debe estar entre 0 y 100.",
    );
  }

  const salonId = options?.salonId ?? (await requireActiveSalonId());
  await requireMembershipForSalon(salonId, ["owner", "manager"]);

  const admin = createAdminClient();
  await assertCustomerInSalon(admin, customerId, salonId);

  const validityDays = options?.validityDays ?? DEFAULT_LOYALTY_CONFIG.couponValidityDays;
  const expiresAt = addDaysIso(new Date(), validityDays);

  const { data, error } = await admin
    .from("welcome_coupons")
    .upsert(
      {
        salon_id: salonId,
        customer_id: customerId,
        percent_off: percentOff,
        status: "ACTIVE",
        expires_at: expiresAt,
        used_at: null,
      },
      { onConflict: "salon_id,customer_id" },
    )
    .select("id, percent_off, expires_at")
    .single();

  if (error !== null || data === null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo emitir el cupón de bienvenida.");
  }
  return data;
}

// -----------------------------------------------------------------------------
// 4. awardVisit — acredita puntos, evalúa hitos y canjea cupón (§1.1–§1.7)
// -----------------------------------------------------------------------------

/** Entrada de `awardVisit`. */
export interface AwardVisitInput {
  /** Salón en el que se registra la visita (obligatorio; se verifica pertenencia). */
  salon_id: string;
  /** Cliente por id (uno de `customer_id` / `qr_token` es obligatorio). */
  customer_id?: string;
  /** Cliente por token QR (alternativa a `customer_id`). */
  qr_token?: string;
  /** Líneas de la visita (precio en céntimos + override opcional de puntos). */
  line_items: readonly LoyaltyLineItem[];
  /** Si `true`, canjea el cupón de bienvenida ACTIVE del cliente (→ USED). */
  redeem_coupon?: boolean;
  /**
   * Ancla de idempotencia y auditoría. Con `id`, una segunda llamada con el mismo
   * `(ref_type, ref_id)` NO vuelve a acreditar (equivalente a
   * `appointments.points_awarded`; §1.3/§3.6). Sin `id` no hay deduplicación.
   */
  ref?: { type: LoyaltyRefType; id: string | null };
  /** Overrides de configuración (ratio de puntos, caducidades). */
  config?: Partial<LoyaltyConfig>;
}

/**
 * Registra una visita: calcula puntos por línea, incrementa saldo y visitas,
 * inserta el movimiento EARN, evalúa el hito 3/5/8/10 (genera recompensa) y, si
 * se indica, canjea el cupón de bienvenida. Idempotente por `ref` (§1.3/§3.6).
 */
export async function awardVisit(input: AwardVisitInput): Promise<AwardVisitResult> {
  const salonId = input.salon_id;
  if (typeof salonId !== "string" || salonId === "") {
    throw new LoyaltyActionError("invalid_request", 400, "salon_id es obligatorio.");
  }
  if (input.customer_id === undefined && input.qr_token === undefined) {
    throw new LoyaltyActionError("invalid_request", 400, "Falta customer_id o qr_token.");
  }
  if (input.line_items.length === 0) {
    // §1.2: no se otorgan puntos "a ciegas" sin ninguna línea de precio.
    throw new LoyaltyActionError("invalid_request", 400, "La visita no tiene líneas.");
  }

  await requireMembershipForSalon(salonId); // cualquier rol: es operación de TPV

  const config: LoyaltyConfig = { ...DEFAULT_LOYALTY_CONFIG, ...input.config };
  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const customer = await resolveCustomer(admin, salonId, input.customer_id, input.qr_token);

  const refType = input.ref?.type ?? null;
  const refId = input.ref?.id ?? null;

  // Idempotencia: si esta referencia ya generó un EARN, devolvemos el estado
  // actual sin volver a sumar (no-op idempotente).
  if (refId !== null) {
    const already = await findExistingEarn(admin, salonId, customer.id, refType, refId);
    if (already) {
      const account = await upsertLoyaltyAccount(admin, salonId, customer.id);
      return {
        points_earned: 0,
        points_balance: account.points_balance,
        visits_total: account.visits_total,
        redeemed_coupon: null,
        discount_cents: 0,
        reward: null,
        already_awarded: true,
      };
    }
  }

  // Puntos y precio total de la visita.
  let pointsTotal: number;
  let priceCentsTotal: number;
  try {
    ({ pointsTotal, priceCentsTotal } = computeVisitPoints(input.line_items, config.centsPerPoint));
  } catch {
    throw new LoyaltyActionError("invalid_request", 400, "Líneas de visita no válidas.");
  }

  // Cuenta + nuevos totales (read-modify-write; ver nota de atomicidad).
  const account = await upsertLoyaltyAccount(admin, salonId, customer.id);
  const newBalance = account.points_balance + pointsTotal;
  const newVisits = account.visits_total + 1;

  const { error: updateError } = await admin
    .from("loyalty_accounts")
    .update({
      points_balance: newBalance,
      visits_total: newVisits,
      last_visit_at: nowIso,
      last_activity_at: nowIso,
    })
    .eq("id", account.id)
    .eq("salon_id", salonId);
  if (updateError !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo actualizar el saldo de puntos.");
  }

  // Libro mayor: movimiento EARN (§1.5).
  const { error: movementError } = await admin.from("points_movements").insert({
    salon_id: salonId,
    customer_id: customer.id,
    type: "EARN",
    points: pointsTotal,
    reason: buildEarnReason(input.line_items),
    ref_type: refType,
    ref_id: refId,
  });
  if (movementError !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo registrar el movimiento de puntos.");
  }

  // Hito 3/5/8/10 → recompensa AVAILABLE (a lo sumo una) (§1.6).
  const reward = await maybeCreateMilestoneReward(
    admin,
    salonId,
    customer.id,
    newVisits,
    now,
    config,
  );

  // Canje del cupón de bienvenida si procede (§1.7).
  const { redeemedCoupon, discountCents } =
    input.redeem_coupon === true
      ? await redeemWelcomeCoupon(admin, salonId, customer.id, priceCentsTotal, nowIso)
      : { redeemedCoupon: null, discountCents: 0 };

  return {
    points_earned: pointsTotal,
    points_balance: newBalance,
    visits_total: newVisits,
    redeemed_coupon: redeemedCoupon,
    discount_cents: discountCents,
    reward,
    already_awarded: false,
  };
}

// -----------------------------------------------------------------------------
// Helpers internos de awardVisit
// -----------------------------------------------------------------------------

/** ¿Existe ya un EARN para esta referencia? (ancla de idempotencia). */
async function findExistingEarn(
  admin: AdminClient,
  salonId: string,
  customerId: string,
  refType: string | null,
  refId: string,
): Promise<boolean> {
  let query = admin
    .from("points_movements")
    .select("id")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .eq("type", "EARN")
    .eq("ref_id", refId);
  query = refType !== null ? query.eq("ref_type", refType) : query.is("ref_type", null);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo comprobar la idempotencia.");
  }
  return data !== null;
}

/** Motivo del movimiento EARN a partir de las etiquetas de línea. */
function buildEarnReason(lines: readonly LoyaltyLineItem[]): string {
  const labels = lines
    .map((line) => line.label?.trim())
    .filter((label): label is string => label !== undefined && label !== "");
  const detail = labels.length > 0 ? labels.join(", ") : `${lines.length} línea(s)`;
  return `Visita verificada: ${detail}`.slice(0, 500);
}

/**
 * Genera la recompensa del hito alcanzado, o `null` si no hay hito. Reintenta
 * ante colisión del código único `(salon_id, code)`. Si (astronómicamente
 * improbable) se agotan los reintentos, registra el aviso y devuelve `null` sin
 * abortar la acreditación ya realizada.
 */
async function maybeCreateMilestoneReward(
  admin: AdminClient,
  salonId: string,
  customerId: string,
  visitsTotal: number,
  now: Date,
  config: LoyaltyConfig,
): Promise<LoyaltyRewardView | null> {
  const milestone = milestoneForVisitCount(visitsTotal);
  if (milestone === null) {
    return null;
  }

  const expiresAt = addDaysIso(now, config.rewardValidityDays);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = formatRewardCode(
      milestone.rewardType,
      randomRewardSuffix((n) => nodeRandomBytes(n)),
    );
    const { data, error } = await admin
      .from("rewards")
      .insert({
        salon_id: salonId,
        customer_id: customerId,
        type: milestone.rewardType,
        code,
        status: "AVAILABLE",
        expires_at: expiresAt,
      })
      .select("id, type, code, expires_at")
      .single();

    if (error === null && data !== null) {
      return data;
    }
    // 23505 = unique_violation → reintentar con otro código.
    if (error !== null && error.code !== "23505") {
      throw new LoyaltyActionError("internal", 500, "No se pudo generar la recompensa.");
    }
  }

  console.error("[loyalty/awardVisit] recompensa de hito sin código único tras 5 intentos", {
    salonId,
    visitsTotal,
  });
  return null;
}

/**
 * Canjea el cupón de bienvenida ACTIVE y no caducado del cliente (→ USED) y
 * calcula el descuento aplicable. El UPDATE es condicional (`status = 'ACTIVE'`)
 * para no pisar una carrera con otro canje concurrente.
 */
async function redeemWelcomeCoupon(
  admin: AdminClient,
  salonId: string,
  customerId: string,
  totalCents: number,
  nowIso: string,
): Promise<{ redeemedCoupon: LoyaltyCouponView | null; discountCents: number }> {
  const { data: coupon, error } = await admin
    .from("welcome_coupons")
    .select("id, percent_off, expires_at")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .eq("status", "ACTIVE")
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (error !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo consultar el cupón.");
  }
  if (coupon === null) {
    return { redeemedCoupon: null, discountCents: 0 };
  }

  const { data: updated, error: updateError } = await admin
    .from("welcome_coupons")
    .update({ status: "USED", used_at: nowIso })
    .eq("id", coupon.id)
    .eq("salon_id", salonId)
    .eq("status", "ACTIVE")
    .select("id, percent_off, expires_at")
    .maybeSingle();
  if (updateError !== null) {
    throw new LoyaltyActionError("internal", 500, "No se pudo canjear el cupón.");
  }
  if (updated === null) {
    // Otro proceso lo canjeó primero: sin descuento.
    return { redeemedCoupon: null, discountCents: 0 };
  }

  // Descuento 0 si la visita no tiene importe (no hay nada sobre lo que aplicar).
  const discountCents =
    totalCents > 0 ? computeCouponDiscountCents(totalCents, updated.percent_off) : 0;
  return { redeemedCoupon: updated, discountCents };
}
