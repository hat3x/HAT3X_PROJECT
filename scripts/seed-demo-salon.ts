/**
 * seed-demo-salon.ts — *Seed* de datos demo de salón (sub-2 scaffold + sub-3 config).
 * ---------------------------------------------------------------------------
 * Crea (o reutiliza) un salón demo AISLADO ("Bella Studio", slug `demo`), con su
 * propio `salon_id`, y siembra su **configuración base** (sub-3): usuario auth OWNER,
 * membership, add-ons de producto y marca white-label. Sobre él, las subtareas
 * posteriores añaden clientes, citas, tickets, facturas y fidelización de forma
 * **additiva e idempotente** (ver `docs/seed-demo-contracts.md`).
 *
 * CONFIGURACIÓN BASE QUE SIEMBRA (sub-3)
 * --------------------------------------
 *  · `salons`         — datos fiscales ficticios (legal_name, tax_id, dirección).
 *  · `auth.users`     — owner vía `admin.createUser` (login por ID de acceso `demo`
 *                        → email sintético `demo@salonos.app`; contraseña generada).
 *  · `salon_members`  — el owner como `role='owner'`.
 *  · `salon_features` — TODOS los add-ons activos (loyalty, client_app, staff_app,
 *                        pos, ai_receptionist).
 *  · `salon_branding` — logo placeholder (SVG) en el bucket `salon-logos` + colores
 *                        de marca con buen contraste (WCAG AA/AAA sobre texto blanco).
 *
 * DISEÑO Y GARANTÍAS
 * ------------------
 *  1. SERVICE ROLE desde `.env.local`. La clave `SUPABASE_SERVICE_ROLE_KEY` se
 *     lee del entorno (cargado desde `.env.local` si no está ya presente). NUNCA
 *     se hardcodea ni se imprime. Reutiliza `createAdminClient()` de la app.
 *  2. Ejecución fuera del build de la app vía `tsx` (ver package.json →
 *     `npm run seed:demo`). Este archivo está EXCLUIDO del tsconfig de la app.
 *  3. Guardas duras: es IMPOSIBLE que el seed escriba sobre el salón real
 *     `denueveanueve` (abeef620-4fe3-4b29-a17b-6c51a8284f8f) o sobre cualquier
 *     salón que el propio seed no haya creado (marcado en `settings`).
 *  4. Idempotente: re-ejecutar no duplica el salón demo (se busca por slug y se
 *     reutiliza). Helper genérico `ensureRow` para las escrituras de dominio.
 *
 * USO
 * ---
 *   npm run seed:demo                     # crea/reutiliza el salón demo y su config
 *   npm run seed:demo -- --check          # valida entorno y credenciales SIN tocar la BD
 *   npm run seed:demo -- --dry-run        # simula sin escribir
 *   npm run seed:demo -- --reset-password # regenera la contraseña del owner si ya existe
 *
 * Variables de entorno opcionales (con valores por defecto seguros):
 *   SEED_DEMO_SALON_SLUG        (def. "demo")            — NUNCA puede ser "denueveanueve"
 *   SEED_DEMO_SALON_NAME        (def. "Bella Studio")
 *   SEED_DEMO_SALON_TZ          (def. "Europe/Madrid")
 *   SEED_DEMO_SALON_TAX_ID / _LEGAL_NAME / _FISCAL_ADDRESS / _ADDRESS — datos fiscales demo
 *   SEED_DEMO_PRIMARY_COLOR / _SECONDARY_COLOR (def. #9D174D / #0F766E) — marca (#rrggbb)
 *   SEED_DEMO_OWNER_ID          (def. "demo")            — ID de acceso del owner
 *   SEED_DEMO_OWNER_PASSWORD    (def. generada)          — contraseña fija del owner
 */

import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { idToEmail } from "@/lib/auth/id-email";
import { localDateInZone, zonedWallTimeToUtc } from "@/lib/booking/timezone";
import { normalizePhone } from "@/lib/customers/normalize-phone";
import {
  emitInvoice,
  verifyHashChain,
  InvoiceEmissionError,
  type HashableInvoiceRecord,
  type IssuerData,
  type RecipientData,
} from "@/lib/invoicing";
import {
  addDaysIso,
  computeVisitPoints,
  formatRewardCode,
  milestoneForVisitCount,
  randomRewardSuffix,
} from "@/lib/loyalty/points";
import { DEFAULT_LOYALTY_CONFIG } from "@/lib/loyalty/types";
import {
  computeLineTotals,
  computeSaleTotals,
  getPaymentGateway,
  type PaymentInsert,
  type SaleLineInput,
  type SaleTotals,
} from "@/lib/payments";
import {
  SALON_LOGOS_BUCKET,
  buildLogoObjectPath,
  isValidHexColor,
} from "@/lib/salon-branding/branding";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json, SalonFeature } from "@/types/database";

import {
  DEMO_LOCATIONS,
  DEMO_OPEN_WEEKDAYS,
  DEMO_PRODUCTS,
  DEMO_PROFESSIONALS,
  DEMO_SERVICES,
  professionalCoversService,
  type DemoLocation,
} from "./seed-demo-data";
import {
  generateDemoCustomers,
  resolveCustomerCount,
} from "./seed-demo-customers";
import {
  generateDemoAppointments,
  resolveAppointmentDensity,
  type DemoAppointmentPlan,
} from "./seed-demo-appointments";
import {
  generateDemoSales,
  saleLoyaltyLineItems,
  type DemoRetailProduct,
  type DemoSaleAppointmentInput,
  type DemoSalePlan,
} from "./seed-demo-sales";
import {
  DEFAULT_F1_RATE,
  DEMO_INVOICE_SERIES,
  resolveInvoiceCount,
  selectInvoicePlan,
  type DemoInvoiceSaleInput,
} from "./seed-demo-invoices";

// ───────────────────────────────────────────────────────────────────────────
// Constantes de seguridad — el salón REAL jamás debe tocarse.
// ───────────────────────────────────────────────────────────────────────────

/** UUID del salón de producción "De Nueve a Nueve". VETADO para el seed demo. */
export const FORBIDDEN_SALON_ID = "abeef620-4fe3-4b29-a17b-6c51a8284f8f";
/** Slug del salón de producción. VETADO para el seed demo. */
export const FORBIDDEN_SALON_SLUG = "denueveanueve";

/** Slug por defecto del salón demo aislado ("Bella Studio"). */
export const DEFAULT_DEMO_SLUG = "demo";
/** Marca en `salons.settings` que identifica a un salón creado por este seed. */
export const DEMO_MARKER_KEY = "seed_demo";

/** Nombre comercial por defecto del salón demo. */
export const DEFAULT_DEMO_NAME = "Bella Studio";
/** Razón social ficticia por defecto (dato fiscal demo). */
export const DEFAULT_DEMO_LEGAL_NAME = "Bella Studio Demo S.L.";
/** NIF/CIF ficticio por defecto (válido en forma, inexistente en la AEAT). */
export const DEFAULT_DEMO_TAX_ID = "B00000000";
/** Domicilio ficticio por defecto (dirección visible y fiscal del salón demo). */
export const DEFAULT_DEMO_ADDRESS = "Calle Gran Vía 28, 3.º B, 28013 Madrid, España";

/** ID de acceso por defecto del owner demo (→ email `demo@salonos.app`). */
export const DEFAULT_OWNER_ACCESS_ID = "demo";

/**
 * Paleta de marca por defecto de Bella Studio, elegida por CONTRASTE: ambos colores
 * superan WCAG AA con texto blanco encima (ratio ≥ 4.5:1), así sirven de fondo para
 * botones/acentos legibles y para el logo placeholder (iniciales blancas). Ratios
 * frente a #FFFFFF: primario ≈ 7.9:1 (AAA) · secundario ≈ 5.5:1 (AA). Ambos casan
 * con el CHECK `^#[0-9a-fA-F]{6}$` de `salon_branding`.
 */
export const DEFAULT_PRIMARY_BRAND_COLOR = "#9D174D"; // baya profunda
export const DEFAULT_SECONDARY_BRAND_COLOR = "#0F766E"; // verde azulado

/** Todos los add-ons de producto — el salón demo los lleva TODOS activos. */
export const ALL_SALON_FEATURES: readonly SalonFeature[] = [
  "loyalty",
  "client_app",
  "staff_app",
  "pos",
  "ai_receptionist",
];

// ───────────────────────────────────────────────────────────────────────────
// Errores tipados.
// ───────────────────────────────────────────────────────────────────────────

/** Se lanza cuando una guarda de seguridad impide una operación. */
export class SeedGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedGuardError";
    Object.setPrototypeOf(this, SeedGuardError.prototype);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Tipos.
// ───────────────────────────────────────────────────────────────────────────

export interface SeedConfig {
  slug: string;
  name: string;
  timezone: string;
  taxId: string | null;
  legalName: string | null;
  fiscalAddress: string | null;
  /** Dirección (visible) del salón. Se usa también como domicilio fiscal si falta. */
  address: string | null;
  /** Color de marca principal (`#rrggbb`). */
  primaryColor: string;
  /** Color de marca secundario/acento (`#rrggbb`). */
  secondaryColor: string;
  /** ID de acceso del owner demo (login = `idToEmail(accessId)`). */
  ownerAccessId: string;
  /** Contraseña del owner demo; si es `null`, se genera una segura. */
  ownerPassword: string | null;
  /** Si el owner ya existe, regenera y actualiza su contraseña. */
  resetOwnerPassword: boolean;
  /** Simula el seed sin escribir en la base de datos. */
  dryRun: boolean;
  /** Valida entorno/credenciales y termina sin tocar la base de datos. */
  checkOnly: boolean;
  /** Nº de clientes demo a sembrar (sub-5); saturado al rango pedido 80–150. */
  customerCount: number;
}

/** Referencia mínima al salón demo resuelto. */
export interface DemoSalonRef {
  id: string;
  slug: string;
  /** `true` si esta ejecución creó el salón; `false` si ya existía (reutilizado). */
  created: boolean;
}

/** Contexto que reciben los pasos de dominio (subtareas posteriores). */
export interface SeedContext {
  client: SupabaseClient<Database>;
  salonId: string;
  slug: string;
  dryRun: boolean;
  now: Date;
  /** Nº de clientes demo a sembrar (sub-5); saturado al rango 80–150. */
  customerCount: number;
}

type PublicTable = keyof Database["public"]["Tables"];

// ───────────────────────────────────────────────────────────────────────────
// Carga de entorno desde .env.local (sin dependencias externas).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Carga `.env.local` en `process.env` sin sobrescribir variables ya presentes
 * (así, en CI, los secretos del entorno tienen prioridad). Silencioso si el
 * archivo no existe. No usa `dotenv` para no añadir dependencias al proyecto.
 */
export function loadEnvLocal(rootDir: string = process.cwd()): void {
  const envPath = resolve(rootDir, ".env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    // Sin .env.local: se confía en el entorno ambiente (p. ej. CI).
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const unprefixed = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length)
      : trimmed;
    const eq = unprefixed.indexOf("=");
    if (eq === -1) continue;

    const key = unprefixed.slice(0, eq).trim();
    if (key.length === 0) continue;

    let value = unprefixed.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Devuelve una variable de entorno obligatoria o lanza (sin exponer su valor). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `Falta la variable de entorno ${name}. Añádela a .env.local (ver .env.example). ` +
        "Nunca la escribas en el código ni la subas al repositorio.",
    );
  }
  return value;
}

// ───────────────────────────────────────────────────────────────────────────
// Guardas de seguridad.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Guarda maestra: aborta si el objetivo (por id y/o slug) coincide con el salón
 * real. Debe invocarse antes de CUALQUIER escritura de dominio.
 */
export function assertNotProductionSalon(target: {
  id?: string | null;
  slug?: string | null;
}): void {
  if (target.id && target.id === FORBIDDEN_SALON_ID) {
    throw new SeedGuardError(
      `El seed demo tiene PROHIBIDO tocar el salón real ${FORBIDDEN_SALON_SLUG} ` +
        `(${FORBIDDEN_SALON_ID}).`,
    );
  }
  if (target.slug && target.slug === FORBIDDEN_SALON_SLUG) {
    throw new SeedGuardError(
      `El slug "${FORBIDDEN_SALON_SLUG}" pertenece al salón real y está vetado para el seed demo.`,
    );
  }
}

/** Genera un `salon_id` nuevo garantizando que no colisiona con el salón real. */
export function newSalonId(): string {
  const id = randomUUID();
  // Paranoia: `randomUUID` jamás produciría el UUID vetado, pero lo afirmamos.
  assertNotProductionSalon({ id });
  return id;
}

/** ¿El objeto `settings` de un salón lleva la marca de "creado por el seed demo"? */
function isDemoMarked(settings: Json): boolean {
  return (
    typeof settings === "object" &&
    settings !== null &&
    !Array.isArray(settings) &&
    (settings as Record<string, Json>)[DEMO_MARKER_KEY] === true
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Bootstrap idempotente del salón demo.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resuelve el salón demo de forma idempotente:
 *  - Si ya existe un salón con `config.slug` y está marcado como demo → lo reutiliza.
 *  - Si existe pero NO es demo (o es el salón real) → aborta (guarda).
 *  - Si no existe → genera un `salon_id` nuevo y lo crea con la marca demo.
 *
 * El trigger `trg_salons_register_payment_methods` crea automáticamente los
 * métodos de pago del salón al insertarlo (ver docs/seed-demo-contracts.md §6).
 */
export async function getOrCreateDemoSalon(
  client: SupabaseClient<Database>,
  config: SeedConfig,
): Promise<DemoSalonRef> {
  assertNotProductionSalon({ slug: config.slug });

  const { data: existing, error: findError } = await client
    .from("salons")
    .select("id, slug, settings")
    .eq("slug", config.slug)
    .maybeSingle();

  if (findError) {
    throw new Error(
      `No se pudo consultar salons por slug "${config.slug}": ${findError.message}`,
    );
  }

  if (existing) {
    assertNotProductionSalon({ id: existing.id, slug: existing.slug });
    if (!isDemoMarked(existing.settings)) {
      throw new SeedGuardError(
        `El salón "${config.slug}" (${existing.id}) YA existe y NO está marcado como ` +
          `demo (settings.${DEMO_MARKER_KEY} !== true). El seed se niega a escribir sobre ` +
          "un salón que no ha creado él mismo.",
      );
    }
    return { id: existing.id, slug: existing.slug, created: false };
  }

  const id = newSalonId();

  if (config.dryRun) {
    log("salon", `DRY-RUN: se crearía el salón demo "${config.slug}" con id ${id} (no se escribe).`);
    return { id, slug: config.slug, created: false };
  }

  const insert: Database["public"]["Tables"]["salons"]["Insert"] = {
    id,
    name: config.name,
    slug: config.slug,
    timezone: config.timezone,
    tax_id: config.taxId,
    legal_name: config.legalName,
    // Domicilio fiscal: usa el propio si se indicó, o cae a la dirección visible.
    fiscal_address: config.fiscalAddress ?? config.address,
    address: config.address,
    active: true,
    settings: {
      [DEMO_MARKER_KEY]: true,
      seeded_by: "seed-demo-salon",
      seeded_at: new Date().toISOString(),
    },
  };

  const { data: created, error: insertError } = await client
    .from("salons")
    .insert(insert)
    .select("id, slug")
    .single();

  if (insertError) {
    throw new Error(`No se pudo crear el salón demo "${config.slug}": ${insertError.message}`);
  }

  assertNotProductionSalon({ id: created.id, slug: created.slug });
  return { id: created.id, slug: created.slug, created: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Helper idempotente genérico para las escrituras de dominio (subtareas).
// ───────────────────────────────────────────────────────────────────────────

interface QueryResult {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}

/**
 * Idempotencia additiva por coincidencia de clave natural: busca una fila que
 * cumpla `match`; si existe, la devuelve; si no, inserta `values`. NUNCA hace
 * UPDATE (el contrato del seed demo es additivo: nunca altera filas existentes).
 *
 * Nota: al operar sobre nombres de tabla dinámicos se pierde el estrechamiento
 * de tipos de supabase-js; los `cast` son el único punto de escape de tipos y
 * están acotados a este helper. Las subtareas pueden usarlo o bien escribir
 * llamadas totalmente tipadas por tabla.
 */
export async function ensureRow(
  client: SupabaseClient<Database>,
  table: PublicTable,
  match: Readonly<Record<string, string | number | boolean | null>>,
  values: Readonly<Record<string, unknown>>,
): Promise<{ row: Record<string, unknown>; created: boolean }> {
  const base = client.from(table) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => FilterBuilder;
      limit: (count: number) => { maybeSingle: () => Promise<QueryResult> };
    };
    insert: (rows: unknown) => {
      select: (columns: string) => { single: () => Promise<QueryResult> };
    };
  };

  let query: FilterBuilder = base.select("*");
  for (const [column, value] of Object.entries(match)) {
    query = query.eq(column, value);
  }

  const { data: existing, error: findError } = await query.limit(1).maybeSingle();
  if (findError) {
    throw new Error(`ensureRow: fallo buscando en "${table}": ${findError.message}`);
  }
  if (existing) {
    return { row: existing, created: false };
  }

  const { data: created, error: insertError } = await base
    .insert(values)
    .select("*")
    .single();
  if (insertError) {
    throw new Error(`ensureRow: fallo insertando en "${table}": ${insertError.message}`);
  }
  if (!created) {
    throw new Error(`ensureRow: insert en "${table}" no devolvió fila.`);
  }
  return { row: created, created: true };
}

interface FilterBuilder {
  eq: (column: string, value: unknown) => FilterBuilder;
  limit: (count: number) => { maybeSingle: () => Promise<QueryResult> };
}

// ───────────────────────────────────────────────────────────────────────────
// Configuración base del salón demo (sub-3): owner auth, membership, add-ons, marca.
// ───────────────────────────────────────────────────────────────────────────

/** Credenciales resueltas del owner demo (para mostrarlas al operador). */
export interface OwnerCredentials {
  accessId: string;
  email: string;
  userId: string | null;
  /** `null` si el usuario ya existía y NO se regeneró su contraseña. */
  password: string | null;
  created: boolean;
}

/**
 * Genera una contraseña fuerte (por defecto 20 caracteres) con al menos un carácter
 * de cada grupo (mayúscula, minúscula, dígito, símbolo). Usa `crypto.randomInt`
 * (sin sesgo de módulo) y excluye caracteres ambiguos (0/O/1/l/I) por legibilidad.
 */
export function generatePassword(length = 20): string {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%*?-_",
  ] as const;
  const alphabet = groups.join("");
  const size = Math.max(length, groups.length);
  // `charAt` (no indexación) ⇒ siempre string bajo noUncheckedIndexedAccess.
  const pick = (source: string): string => source.charAt(randomInt(source.length));
  // Garantiza un carácter de cada grupo; el resto, del alfabeto completo.
  const chars: string[] = groups.map((group) => pick(group));
  while (chars.length < size) {
    chars.push(pick(alphabet));
  }
  // Baraja Fisher–Yates para no fijar los grupos garantizados en las primeras posiciones.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }
  return chars.join("");
}

/** Iniciales (hasta 2) en mayúscula a partir del nombre del salón, para el logo. */
export function salonInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  const first = words[0] ?? "S";
  const second = words[1];
  const source = second !== undefined ? [first, second] : [first];
  const letters = source.map((word) => word.charAt(0).toUpperCase()).join("");
  return letters.length > 0 ? letters : "S";
}

/**
 * SVG del logo placeholder: cuadro redondeado en el color primario con las iniciales
 * del salón en blanco (contraste AAA ≈ 7.9:1 sobre #9D174D). SVG = vectorial, ínfimo
 * y admitido por el bucket `salon-logos` (`image/svg+xml`). Sin dependencias externas.
 */
export function buildPlaceholderLogoSvg(
  initials: string,
  backgroundColor: string,
): string {
  const safe = initials.replace(/[<>&"']/g, "");
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" ' +
    `viewBox="0 0 256 256" role="img" aria-label="Logo ${safe}">` +
    `<rect width="256" height="256" rx="52" fill="${backgroundColor}"/>` +
    '<text x="128" y="128" text-anchor="middle" dominant-baseline="central" ' +
    "font-family=\"Georgia, 'Times New Roman', serif\" font-size=\"120\" " +
    `font-weight="600" fill="#FFFFFF">${safe}</text>` +
    "</svg>"
  );
}

/**
 * Localiza un usuario de auth por email paginando `admin.listUsers` (supabase-js
 * 2.49 no admite filtro por email en servidor). Recorre como mucho 50 páginas de
 * 1000 (tope de seguridad; en dev/demo hay muy pocos usuarios). Coincidencia
 * case-insensitive.
 */
async function findAuthUserByEmail(
  client: SupabaseClient<Database>,
  email: string,
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`No se pudo consultar los usuarios de auth: ${error.message}`);
    }
    const users = data?.users ?? [];
    const match = users.find((user) => (user.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) break; // última página
  }
  return null;
}

/**
 * Crea (o reutiliza) el usuario auth OWNER del salón demo vía `admin.createUser`.
 * El login es por ID de acceso (`idToEmail(accessId)` → `demo@salonos.app`, el email
 * sintético que el propio login de la app deriva). Idempotente: si el usuario ya
 * existe, lo reutiliza; solo regenera la contraseña si se pide (`--reset-password` o
 * `SEED_DEMO_OWNER_PASSWORD`). `email_confirm: true` ⇒ puede entrar sin verificación
 * (el dominio es sintético y jamás recibe correo).
 */
async function seedOwnerUser(
  client: SupabaseClient<Database>,
  config: SeedConfig,
): Promise<OwnerCredentials> {
  const accessId = config.ownerAccessId;
  const email = idToEmail(accessId);
  const existing = await findAuthUserByEmail(client, email);

  if (existing) {
    if (config.ownerPassword !== null || config.resetOwnerPassword) {
      const password = config.ownerPassword ?? generatePassword();
      const { error } = await client.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (error) {
        throw new Error(
          `No se pudo actualizar la contraseña del owner demo: ${error.message}`,
        );
      }
      log("owner", `Usuario owner "${accessId}" ya existía; contraseña regenerada.`);
      return { accessId, email, userId: existing.id, password, created: false };
    }
    log(
      "owner",
      `Usuario owner "${accessId}" ya existía; se conserva su contraseña ` +
        "(usa --reset-password o SEED_DEMO_OWNER_PASSWORD para fijarla).",
    );
    return { accessId, email, userId: existing.id, password: null, created: false };
  }

  const password = config.ownerPassword ?? generatePassword();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      seed_demo: true,
      display_name: `${config.name} (demo)`,
      salon_slug: config.slug,
    },
    app_metadata: { seed_demo: true },
  });
  if (error || !data?.user) {
    throw new Error(
      `No se pudo crear el usuario owner demo: ${error?.message ?? "sin usuario en la respuesta"}`,
    );
  }
  log("owner", `Creado usuario owner "${accessId}" (${email}).`);
  return { accessId, email, userId: data.user.id, password, created: true };
}

/** Alta idempotente de la membership OWNER del salón demo (additiva; no degrada rol). */
async function seedOwnerMembership(
  client: SupabaseClient<Database>,
  salonId: string,
  userId: string,
): Promise<void> {
  const { created } = await ensureRow(
    client,
    "salon_members",
    { salon_id: salonId, user_id: userId },
    { salon_id: salonId, user_id: userId, role: "owner" },
  );
  log("member", `Membership owner ${created ? "creada" : "ya existía"} (user ${userId}).`);
}

/**
 * Activa TODOS los add-ons del salón demo. Usa el UPSERT sancionado por la migración
 * `20260718100000_salon_features` (`on conflict (salon_id, feature) do update set
 * enabled = excluded.enabled, notes = excluded.notes`): crea los que falten y
 * garantiza `enabled = true` en los existentes ⇒ "TODAS activas", idempotente.
 */
async function seedFeatures(
  client: SupabaseClient<Database>,
  salonId: string,
): Promise<void> {
  const rows: Database["public"]["Tables"]["salon_features"]["Insert"][] =
    ALL_SALON_FEATURES.map((feature) => ({
      salon_id: salonId,
      feature,
      enabled: true,
      notes: "Activado por el seed demo (sub-3).",
    }));

  const { error } = await client
    .from("salon_features")
    .upsert(rows, { onConflict: "salon_id,feature" });
  if (error) {
    throw new Error(`No se pudieron activar los add-ons del salón demo: ${error.message}`);
  }
  log("features", `Add-ons activos: ${ALL_SALON_FEATURES.join(", ")}.`);
}

/**
 * Marca (white-label) del salón demo: sube un logo placeholder SVG al bucket
 * `salon-logos` bajo la clave canónica `{salon_id}/logo.svg` (upsert) y persiste
 * `salon_branding` (logo + colores). ADITIVO: si ya hay fila de marca, se conserva
 * (no pisa una personalización posterior); solo se re-asegura el objeto del logo.
 */
async function seedBranding(
  client: SupabaseClient<Database>,
  salonId: string,
  salonName: string,
  config: SeedConfig,
): Promise<void> {
  const { data: existing, error: findError } = await client
    .from("salon_branding")
    .select("salon_id, logo_url")
    .eq("salon_id", salonId)
    .maybeSingle();
  if (findError) {
    throw new Error(`No se pudo consultar salon_branding: ${findError.message}`);
  }

  // Sube el logo placeholder (upsert de objeto = idempotente, sobrescribe la clave).
  const logoPath = buildLogoObjectPath(salonId, "svg");
  const svg = buildPlaceholderLogoSvg(salonInitials(salonName), config.primaryColor);
  const { error: uploadError } = await client.storage
    .from(SALON_LOGOS_BUCKET)
    .upload(logoPath, svg, {
      contentType: "image/svg+xml",
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadError) {
    throw new Error(`No se pudo subir el logo demo a ${SALON_LOGOS_BUCKET}: ${uploadError.message}`);
  }
  const publicUrl = client.storage.from(SALON_LOGOS_BUCKET).getPublicUrl(logoPath)
    .data.publicUrl;

  if (existing) {
    log("branding", "Marca ya existía; se conserva (logo re-asegurado en el bucket).");
    return;
  }

  const insert: Database["public"]["Tables"]["salon_branding"]["Insert"] = {
    salon_id: salonId,
    logo_url: publicUrl,
    primary_color: config.primaryColor,
    secondary_color: config.secondaryColor,
  };
  const { error: insertError } = await client.from("salon_branding").insert(insert);
  if (insertError) {
    throw new Error(`No se pudo crear la marca del salón demo: ${insertError.message}`);
  }
  log(
    "branding",
    `Marca creada · logo ${logoPath} · primario ${config.primaryColor} · ` +
      `secundario ${config.secondaryColor}.`,
  );
}

/**
 * Configuración base del salón demo (sub-3): usuario owner + membership + add-ons +
 * marca. Idempotente y acotado por la guarda maestra. En `dryRun` describe el plan
 * sin escribir. Devuelve las credenciales del owner (para mostrarlas al final).
 */
async function seedSalonCoreConfig(
  ctx: SeedContext,
  config: SeedConfig,
): Promise<OwnerCredentials | null> {
  assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug });

  if (ctx.dryRun) {
    log(
      "core",
      `DRY-RUN: se crearía el owner "${config.ownerAccessId}" (${idToEmail(config.ownerAccessId)}), ` +
        `su membership owner, los add-ons [${ALL_SALON_FEATURES.join(", ")}] y la marca ` +
        `(logo placeholder + ${config.primaryColor}/${config.secondaryColor}).`,
    );
    return null;
  }

  const owner = await seedOwnerUser(ctx.client, config);
  if (owner.userId !== null) {
    await seedOwnerMembership(ctx.client, ctx.salonId, owner.userId);
  }
  await seedFeatures(ctx.client, ctx.salonId);
  await seedBranding(ctx.client, ctx.salonId, config.name, config);
  return owner;
}

// ───────────────────────────────────────────────────────────────────────────
// Configuración operativa del salón demo (sub-4): sedes, profesionales,
// servicios (3 fases), productos, servicios-por-profesional y horarios L–S.
// ───────────────────────────────────────────────────────────────────────────

/** Lee `row.id` (de `ensureRow`) como `string`, o lanza si falta/no es texto. */
function rowId(row: Record<string, unknown>, table: PublicTable): string {
  const id = row.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`La fila de "${table}" no devolvió un id de texto válido.`);
  }
  return id;
}

/** Resuelve un valor de un `Map` por clave, o lanza con un mensaje claro. */
function resolveOrThrow<V>(map: ReadonlyMap<string, V>, key: string, what: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`No se pudo resolver ${what} para la clave "${key}".`);
  }
  return value;
}

/**
 * Siembra las sedes del salón demo (idempotente por `(salon_id, slug)`). Devuelve
 * un mapa `slug → { id, location }` para que profesionales y horarios cuelguen de
 * la sede correcta.
 */
async function seedLocations(
  client: SupabaseClient<Database>,
  salonId: string,
): Promise<Map<string, { id: string; location: DemoLocation }>> {
  const bySlug = new Map<string, { id: string; location: DemoLocation }>();
  let created = 0;
  for (const location of DEMO_LOCATIONS) {
    const values = {
      salon_id: salonId,
      name: location.name,
      slug: location.slug,
      address: location.address,
      phone: location.phone,
      active: true,
    } satisfies Database["public"]["Tables"]["locations"]["Insert"];
    const result = await ensureRow(
      client,
      "locations",
      { salon_id: salonId, slug: location.slug },
      values,
    );
    if (result.created) created += 1;
    bySlug.set(location.slug, { id: rowId(result.row, "locations"), location });
  }
  log("locations", `Sedes: ${DEMO_LOCATIONS.length} (${created} nuevas). `);
  return bySlug;
}

/**
 * Siembra los profesionales (idempotente por `(salon_id, full_name)`; los nombres
 * del catálogo demo son únicos). Cada profesional cuelga de su sede. Devuelve un
 * mapa `full_name → professional_id`.
 */
async function seedProfessionals(
  client: SupabaseClient<Database>,
  salonId: string,
  locationsBySlug: ReadonlyMap<string, { id: string; location: DemoLocation }>,
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  let created = 0;
  for (const professional of DEMO_PROFESSIONALS) {
    const sede = resolveOrThrow(
      locationsBySlug,
      professional.locationSlug,
      `la sede del profesional "${professional.fullName}"`,
    );
    const values = {
      salon_id: salonId,
      location_id: sede.id,
      full_name: professional.fullName,
      specialties: [...professional.specialties],
      color: professional.color,
      active: true,
    } satisfies Database["public"]["Tables"]["professionals"]["Insert"];
    const result = await ensureRow(
      client,
      "professionals",
      { salon_id: salonId, full_name: professional.fullName },
      values,
    );
    if (result.created) created += 1;
    byName.set(professional.fullName, rowId(result.row, "professionals"));
  }
  log("professionals", `Profesionales: ${DEMO_PROFESSIONALS.length} (${created} nuevos).`);
  return byName;
}

/**
 * Siembra el catálogo de servicios con el modelo de 3 fases (idempotente por
 * `(salon_id, name)`). `duration_minutes(_total)` son columnas generadas: NO se
 * insertan (las calcula Postgres). Devuelve un mapa `name → service_id`.
 */
async function seedServices(
  client: SupabaseClient<Database>,
  salonId: string,
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  let created = 0;
  for (const service of DEMO_SERVICES) {
    const values = {
      salon_id: salonId,
      name: service.name,
      category: service.category,
      application_min: service.applicationMin,
      exposure_min: service.exposureMin,
      post_exposure_min: service.postExposureMin,
      price_cents: service.priceCents,
      active: true,
    } satisfies Database["public"]["Tables"]["services"]["Insert"];
    const result = await ensureRow(
      client,
      "services",
      { salon_id: salonId, name: service.name },
      values,
    );
    if (result.created) created += 1;
    byName.set(service.name, rowId(result.row, "services"));
  }
  log("services", `Servicios (3 fases): ${DEMO_SERVICES.length} (${created} nuevos).`);
  return byName;
}

/** Siembra el catálogo de productos retail (idempotente por `(salon_id, name)`). */
async function seedProducts(
  client: SupabaseClient<Database>,
  salonId: string,
): Promise<void> {
  let created = 0;
  for (const product of DEMO_PRODUCTS) {
    const values = {
      salon_id: salonId,
      name: product.name,
      description: product.description,
      price_cents: product.priceCents,
      vat_rate: product.vatRate,
      stock: product.stock,
      active: true,
    } satisfies Database["public"]["Tables"]["products"]["Insert"];
    const result = await ensureRow(
      client,
      "products",
      { salon_id: salonId, name: product.name },
      values,
    );
    if (result.created) created += 1;
  }
  log("products", `Productos: ${DEMO_PRODUCTS.length} (${created} nuevos).`);
}

/**
 * Enlaza qué servicios presta cada profesional (`professional_services`, N:M). Se
 * deriva de las especialidades (espejo de `professionalCoversService`). Idempotente
 * vía UPSERT `ON CONFLICT (professional_id, service_id) DO NOTHING`. Es lo que hace
 * reservable cada servicio (la disponibilidad filtra por esta tabla).
 */
async function seedProfessionalServices(
  client: SupabaseClient<Database>,
  salonId: string,
  professionalIdByName: ReadonlyMap<string, string>,
  serviceIdByName: ReadonlyMap<string, string>,
): Promise<void> {
  const rows: Database["public"]["Tables"]["professional_services"]["Insert"][] = [];
  for (const professional of DEMO_PROFESSIONALS) {
    const professionalId = resolveOrThrow(
      professionalIdByName,
      professional.fullName,
      `el id del profesional "${professional.fullName}"`,
    );
    for (const service of DEMO_SERVICES) {
      if (!professionalCoversService(professional, service)) continue;
      const serviceId = resolveOrThrow(
        serviceIdByName,
        service.name,
        `el id del servicio "${service.name}"`,
      );
      rows.push({ salon_id: salonId, professional_id: professionalId, service_id: serviceId });
    }
  }

  const { error } = await client
    .from("professional_services")
    .upsert(rows, { onConflict: "professional_id,service_id", ignoreDuplicates: true });
  if (error) {
    throw new Error(`No se pudieron enlazar servicios↔profesionales: ${error.message}`);
  }
  log("prof-services", `Enlaces servicio↔profesional asegurados: ${rows.length}.`);
}

/**
 * Siembra los horarios recurrentes L–S de cada profesional con las horas de
 * apertura de SU sede (`professional_schedules`). Idempotente por profesional:
 * si ya tiene algún tramo, se respeta (additivo, no duplica). weekday 1..6 = L..S.
 */
async function seedSchedules(
  client: SupabaseClient<Database>,
  salonId: string,
  professionalIdByName: ReadonlyMap<string, string>,
  locationsBySlug: ReadonlyMap<string, { id: string; location: DemoLocation }>,
): Promise<void> {
  let seeded = 0;
  for (const professional of DEMO_PROFESSIONALS) {
    const professionalId = resolveOrThrow(
      professionalIdByName,
      professional.fullName,
      `el id del profesional "${professional.fullName}"`,
    );
    const sede = resolveOrThrow(
      locationsBySlug,
      professional.locationSlug,
      `la sede del profesional "${professional.fullName}"`,
    );

    // Guarda de idempotencia: si el profesional ya tiene horario, no lo re-siembra.
    const { data: existing, error: findError } = await client
      .from("professional_schedules")
      .select("id")
      .eq("salon_id", salonId)
      .eq("professional_id", professionalId)
      .limit(1)
      .maybeSingle();
    if (findError) {
      throw new Error(
        `No se pudo consultar el horario de "${professional.fullName}": ${findError.message}`,
      );
    }
    if (existing) continue;

    const rows: Database["public"]["Tables"]["professional_schedules"]["Insert"][] =
      DEMO_OPEN_WEEKDAYS.map((weekday) => ({
        salon_id: salonId,
        professional_id: professionalId,
        weekday,
        start_time: sede.location.openStart,
        end_time: sede.location.openEnd,
      }));

    const { error: insertError } = await client
      .from("professional_schedules")
      .insert(rows);
    if (insertError) {
      throw new Error(
        `No se pudo sembrar el horario de "${professional.fullName}": ${insertError.message}`,
      );
    }
    seeded += 1;
  }
  log(
    "schedules",
    `Horarios L–S sembrados para ${seeded} profesional(es) ` +
      `(${DEMO_PROFESSIONALS.length - seeded} ya tenían).`,
  );
}

/**
 * Configuración operativa del salón demo (sub-4). Additiva e idempotente y acotada
 * por la guarda maestra. En `dryRun` describe el plan sin escribir. Orden: sedes →
 * profesionales → servicios → productos → enlaces servicio↔profesional → horarios
 * (las dependencias de FK obligan este orden).
 */
async function seedOperationalConfig(ctx: SeedContext): Promise<void> {
  assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug });

  if (ctx.dryRun) {
    log(
      "ops",
      `DRY-RUN: se sembrarían ${DEMO_LOCATIONS.length} sedes, ` +
        `${DEMO_PROFESSIONALS.length} profesionales, ${DEMO_SERVICES.length} servicios ` +
        `(3 fases), ${DEMO_PRODUCTS.length} productos y horarios L–S por sede (no se escribe).`,
    );
    return;
  }

  const { client, salonId } = ctx;
  const locationsBySlug = await seedLocations(client, salonId);
  const professionalIdByName = await seedProfessionals(client, salonId, locationsBySlug);
  const serviceIdByName = await seedServices(client, salonId);
  await seedProducts(client, salonId);
  await seedProfessionalServices(client, salonId, professionalIdByName, serviceIdByName);
  await seedSchedules(client, salonId, professionalIdByName, locationsBySlug);
}

// ───────────────────────────────────────────────────────────────────────────
// Clientes del salón demo (sub-5): fichas con teléfono único → puntos + cupón + qr.
// ───────────────────────────────────────────────────────────────────────────

/** Resultado de la siembra de clientes (para el log; útil también en tests). */
interface CustomerSeedResult {
  /** Nº de fichas generadas (= recuento pedido). */
  planned: number;
  /** Nº de fichas nuevas insertadas en esta ejecución. */
  inserted: number;
  /** Nº de fichas ya presentes (dedup por `phone_e164`), no reinsertadas. */
  skipped: number;
}

/**
 * Siembra 80–150 clientes demo con nombres españoles realistas y teléfonos ÚNICOS
 * y normalizables. Al INSERTAR cada ficha, los disparadores del esquema hacen el
 * resto GRATIS (ver docs/seed-demo-contracts.md §5.1):
 *   · `customers.qr_token`             — token de fidelización (DEFAULT de la columna).
 *   · `trg_customers_bootstrap_loyalty` → `loyalty_accounts` + `welcome_coupons`.
 *
 * ADITIVO E IDEMPOTENTE: el dedup se hace por `phone_e164` (columna GENERADA =
 * `app.normalize_phone(phone)`, con único parcial `(salon_id, phone_e164)`). El
 * generador es DETERMINISTA, así que al reejecutar produce los mismos números y
 * ninguno se reinserta. Nunca hace UPDATE/DELETE.
 */
async function seedCustomers(ctx: SeedContext): Promise<CustomerSeedResult> {
  assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug });

  const seeds = generateDemoCustomers(ctx.customerCount);
  const withEmail = seeds.filter((seed) => seed.email !== null).length;

  if (ctx.dryRun) {
    log(
      "customers",
      `DRY-RUN: se sembrarían ${seeds.length} clientes (${withEmail} con email, ` +
        `${seeds.length - withEmail} sin), con teléfonos E.164 únicos. El trigger crearía ` +
        "por cada uno su cuenta de puntos + cupón de bienvenida (no se escribe).",
    );
    return { planned: seeds.length, inserted: 0, skipped: seeds.length };
  }

  // Dedup por teléfono canónico ya presente en el salón (idempotencia additiva).
  const { data: existingRows, error: findError } = await ctx.client
    .from("customers")
    .select("phone_e164")
    .eq("salon_id", ctx.salonId);
  if (findError) {
    throw new Error(`No se pudieron consultar los clientes existentes: ${findError.message}`);
  }
  const existing = new Set<string>(
    (existingRows ?? [])
      .map((row) => row.phone_e164)
      .filter((value): value is string => value !== null),
  );

  // Construye las filas a insertar, saltando las que ya existen o colisionarían.
  const seenE164 = new Set<string>();
  const toInsert: Database["public"]["Tables"]["customers"]["Insert"][] = [];
  for (const seed of seeds) {
    const e164 = normalizePhone(seed.phone); // espejo TS de la columna generada
    if (e164 === null || existing.has(e164) || seenE164.has(e164)) continue;
    seenE164.add(e164);
    toInsert.push({
      salon_id: ctx.salonId,
      full_name: seed.fullName,
      phone: seed.phone,
      email: seed.email,
      birth_date: seed.birthDate,
      marketing_consent: seed.marketingConsent,
      notes: seed.notes,
      // qr_token: lo pone el DEFAULT; cuenta+cupón: el trigger AFTER INSERT.
    });
  }

  if (toInsert.length === 0) {
    log(
      "customers",
      `Clientes ya sembrados (${existing.size} en el salón); nada que insertar (idempotente).`,
    );
    return { planned: seeds.length, inserted: 0, skipped: seeds.length };
  }

  const { error: insertError } = await ctx.client.from("customers").insert(toInsert);
  if (insertError) {
    throw new Error(`No se pudieron sembrar los clientes demo: ${insertError.message}`);
  }

  const inserted = toInsert.length;
  const skipped = seeds.length - inserted;
  log(
    "customers",
    `Clientes: +${inserted} nuevos de ${seeds.length} (${withEmail} con email) → el trigger ` +
      `creó su cuenta de puntos + cupón de bienvenida; qr_token por DEFAULT. ${skipped} ya existían.`,
  );
  return { planned: seeds.length, inserted, skipped };
}

// ───────────────────────────────────────────────────────────────────────────
// Citas del salón demo (sub-6): ~12 meses con estacionalidad, 3 fases y agenda futura.
// ───────────────────────────────────────────────────────────────────────────

/** Info de servicio necesaria para materializar una cita (fases + precio snapshot). */
interface ServiceTiming {
  id: string;
  /** Duración total (minutos) = application_min + exposure_min + post_exposure_min. */
  totalMinutes: number;
  priceCents: number;
}

/** Resultado de la siembra de citas (para el log y los tests de integración). */
interface AppointmentSeedResult {
  /** Nº de citas del plan generado (antes de dedup/resolución). */
  planned: number;
  /** Nº de citas nuevas insertadas en esta ejecución. */
  inserted: number;
  /** Nº de citas ya presentes (dedup por (professional_id, starts_at)), no reinsertadas. */
  skipped: number;
  /** Nº de citas pasadas llevadas a `completed` (⇒ fila en `visits` por trigger). */
  completed: number;
}

/** Parte una lista en trozos de `size` (para inserts/updates por lotes). */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Clave natural estable de una cita: `${professional_id}|${epochMs(starts_at)}`. */
function appointmentKey(professionalId: string, startsAtIso: string): string {
  return `${professionalId}|${new Date(startsAtIso).getTime()}`;
}

/** Cuenta las citas del plan por estado (para los logs de resumen). */
function countByStatus(
  plan: readonly DemoAppointmentPlan[],
): Record<DemoAppointmentPlan["status"], number> {
  const counts: Record<DemoAppointmentPlan["status"], number> = {
    completed: 0,
    cancelled: 0,
    no_show: 0,
    confirmed: 0,
    pending: 0,
  };
  for (const item of plan) counts[item.status] += 1;
  return counts;
}

/**
 * Siembra ~12 meses de CITAS del salón demo (sub-6) con estacionalidad (más
 * viernes/sábado + picos en fechas señaladas), vinculadas a profesionales,
 * servicios y sedes REALES ya sembrados. Reutiliza el contrato de citas de
 * `docs/seed-demo-contracts.md` §4:
 *
 *  · Plan DETERMINISTA de `seed-demo-appointments` (hora local de pared + claves
 *    naturales), que garantiza que las citas de un MISMO profesional NO se solapan.
 *  · `starts_at` (UTC) se deriva con `zonedWallTimeToUtc` (el mismo helper del motor
 *    de reservas, respeta DST); `ends_at = starts_at + (application+exposure+post)`
 *    minutos, EXACTAMENTE como calcula el servidor (§4.4).
 *  · MODELO DE 3 FASES + anti-solape: NO se tocan `appointment_blocks` (los genera
 *    el trigger `trg_appointment_blocks_sync` por fase). Como el plan no solapa por
 *    profesional, la exclusión `appointment_blocks_no_overlap` (23P01) nunca salta.
 *  · MEZCLA DE ESTADOS: las citas se insertan ACTIVAS y las pasadas `completed` se
 *    transicionan con `UPDATE status='completed'` para que el trigger
 *    `trg_appointments_create_visit` cree su fila en `public.visits` (un INSERT
 *    directo con `completed` NO la crearía). Las `cancelled`/`no_show` se insertan
 *    con su estado final (no generan bloques ni visita).
 *
 * ADITIVO E IDEMPOTENTE: dedup por la clave natural `(professional_id, starts_at)`.
 * El plan es determinista, así que reejecutar reconoce las citas ya sembradas y no
 * inserta duplicados. Nunca hace UPDATE/DELETE de citas ajenas.
 */
async function seedAppointments(ctx: SeedContext): Promise<AppointmentSeedResult> {
  assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug });
  const { client, salonId } = ctx;
  const density = resolveAppointmentDensity(process.env.SEED_DEMO_APPOINTMENT_DENSITY);

  if (ctx.dryRun) {
    // En dry-run no se consulta la BD; la zona del salón se aproxima a Europe/Madrid
    // (el valor real solo cambia el reparto horario, no el recuento del plan).
    const todayStr = localDateInZone("Europe/Madrid", ctx.now);
    const plan = generateDemoAppointments({
      todayStr,
      customerCount: ctx.customerCount,
      density,
    });
    const byStatus = countByStatus(plan);
    log(
      "appointments",
      `DRY-RUN: se sembrarían ~${plan.length} citas (${byStatus.completed} completed, ` +
        `${byStatus.cancelled} cancelled, ${byStatus.no_show} no_show, ${byStatus.confirmed} ` +
        `confirmed, ${byStatus.pending} pending) en ~12 meses con estacionalidad. Las ` +
        "completed se transicionarían para generar su visita (no se escribe).",
    );
    return { planned: plan.length, inserted: 0, skipped: plan.length, completed: 0 };
  }

  // Zona del salón demo: base de la conversión hora local → instante UTC.
  const { data: salonRow, error: salonError } = await client
    .from("salons")
    .select("timezone")
    .eq("id", salonId)
    .single();
  if (salonError || !salonRow) {
    throw new Error(
      `No se pudo leer la zona horaria del salón demo: ${salonError?.message ?? "sin fila"}.`,
    );
  }
  const timezone = salonRow.timezone;
  const todayStr = localDateInZone(timezone, ctx.now);

  // Mapas de resolución: profesional/servicio por clave natural.
  const { data: pros, error: prosError } = await client
    .from("professionals")
    .select("id, full_name")
    .eq("salon_id", salonId);
  if (prosError) throw new Error(`No se pudieron leer los profesionales: ${prosError.message}`);
  const proIdByName = new Map<string, string>((pros ?? []).map((p) => [p.full_name, p.id]));

  const { data: svcs, error: svcsError } = await client
    .from("services")
    .select("id, name, application_min, exposure_min, post_exposure_min, price_cents")
    .eq("salon_id", salonId);
  if (svcsError) throw new Error(`No se pudieron leer los servicios: ${svcsError.message}`);
  const svcByName = new Map<string, ServiceTiming>(
    (svcs ?? []).map((s) => [
      s.name,
      {
        id: s.id,
        totalMinutes: s.application_min + s.exposure_min + s.post_exposure_min,
        priceCents: s.price_cents,
      },
    ]),
  );

  // Clientes por índice: se regeneran de forma determinista (misma lista que sembró
  // `seedCustomers`) y se resuelven a su id por el teléfono canónico `phone_e164`.
  const customerSeeds = generateDemoCustomers(ctx.customerCount);
  const { data: custRows, error: custError } = await client
    .from("customers")
    .select("id, phone_e164")
    .eq("salon_id", salonId);
  if (custError) throw new Error(`No se pudieron leer los clientes: ${custError.message}`);
  const idByE164 = new Map<string, string>(
    (custRows ?? [])
      .filter((c): c is { id: string; phone_e164: string } => c.phone_e164 !== null)
      .map((c) => [c.phone_e164, c.id]),
  );
  const customerIdByIndex = customerSeeds.map((seed) => {
    const e164 = normalizePhone(seed.phone);
    return e164 !== null ? idByE164.get(e164) ?? null : null;
  });

  // Citas ya existentes en el salón → dedup por clave natural (idempotencia).
  const { data: existingAppts, error: existingError } = await client
    .from("appointments")
    .select("professional_id, starts_at")
    .eq("salon_id", salonId);
  if (existingError) {
    throw new Error(`No se pudieron leer las citas existentes: ${existingError.message}`);
  }
  const existingKeys = new Set<string>(
    (existingAppts ?? []).map((a) => appointmentKey(a.professional_id, a.starts_at)),
  );

  // Materializa el plan → filas de `appointments` (resolviendo IDs y tiempos UTC).
  const plan = generateDemoAppointments({
    todayStr,
    customerCount: ctx.customerCount,
    density,
  });
  const inserts: Database["public"]["Tables"]["appointments"]["Insert"][] = [];
  const completedKeys = new Set<string>();
  const seenKeys = new Set<string>();
  let skippedExisting = 0;
  let unresolved = 0;

  for (const item of plan) {
    const professionalId = proIdByName.get(item.professionalName);
    const service = svcByName.get(item.serviceName);
    const customerId = customerIdByIndex[item.customerIndex] ?? null;
    if (professionalId === undefined || service === undefined || customerId === null) {
      unresolved += 1;
      continue;
    }

    const startsAt = zonedWallTimeToUtc(item.dateStr, item.startTime, timezone);
    const startsAtIso = startsAt.toISOString();
    const key = appointmentKey(professionalId, startsAtIso);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    seenKeys.add(key);

    const endsAtIso = new Date(
      startsAt.getTime() + service.totalMinutes * 60_000,
    ).toISOString();
    // Las `completed` se insertan ACTIVAS (`confirmed`) y luego se transicionan para
    // que el trigger cree la `visits`; el resto se inserta con su estado final.
    const insertStatus = item.status === "completed" ? "confirmed" : item.status;
    inserts.push({
      salon_id: salonId,
      customer_id: customerId,
      professional_id: professionalId,
      service_id: service.id,
      status: insertStatus,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      price_cents: service.priceCents,
      cancelled_reason: item.status === "cancelled" ? "Cancelada por el cliente." : null,
    });
    if (item.status === "completed") completedKeys.add(key);
  }

  if (inserts.length === 0) {
    log(
      "appointments",
      `Citas ya sembradas (${existingKeys.size} en el salón); nada que insertar (idempotente).` +
        (unresolved > 0
          ? ` ${unresolved} del plan sin resolver (cliente/servicio/profesional).`
          : ""),
    );
    return { planned: plan.length, inserted: 0, skipped: skippedExisting, completed: 0 };
  }

  // INSERT por lotes; se capturan los ids por clave natural para la transición.
  const idByKey = new Map<string, string>();
  for (const batch of chunk(inserts, 500)) {
    const { data: created, error: insertError } = await client
      .from("appointments")
      .insert(batch)
      .select("id, professional_id, starts_at");
    if (insertError) {
      throw new Error(`No se pudieron sembrar las citas demo: ${insertError.message}`);
    }
    for (const row of created ?? []) {
      idByKey.set(appointmentKey(row.professional_id, row.starts_at), row.id);
    }
  }

  // Transición de las pasadas → `completed` (dispara `trg_appointments_create_visit`).
  const completedIds = [...completedKeys]
    .map((key) => idByKey.get(key))
    .filter((id): id is string => id !== undefined);
  for (const batch of chunk(completedIds, 200)) {
    const { error: updateError } = await client
      .from("appointments")
      .update({ status: "completed" })
      .eq("salon_id", salonId)
      .in("id", batch);
    if (updateError) {
      throw new Error(`No se pudieron completar las citas pasadas demo: ${updateError.message}`);
    }
  }

  const byStatus = countByStatus(plan);
  log(
    "appointments",
    `Citas: +${inserts.length} nuevas de ${plan.length} planificadas ` +
      `(${completedIds.length} completed → visita; ${byStatus.cancelled} cancelled, ` +
      `${byStatus.no_show} no_show, ${byStatus.confirmed} confirmed, ${byStatus.pending} pending). ` +
      `${skippedExisting} ya existían.` +
      (unresolved > 0 ? ` ${unresolved} sin resolver.` : ""),
  );
  return {
    planned: plan.length,
    inserted: inserts.length,
    skipped: skippedExisting,
    completed: completedIds.length,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Ventas del salón demo (sub-7): tickets del TPV sobre sesiones de caja (arqueo)
// por día/sede, con pagos reales y acreditación de puntos de fidelización.
// ───────────────────────────────────────────────────────────────────────────

/** Resultado de la siembra de ventas (para el log y los tests de integración). */
interface SalesSeedResult {
  /** Nº de citas completadas elegibles como base de venta (tras dedup). */
  eligible: number;
  /** Nº de tickets (pos_sales) insertados en esta ejecución. */
  sales: number;
  /** Nº de sesiones de caja (pos_sessions) creadas en esta ejecución. */
  sessions: number;
  /** Nº de citas ya facturadas como ticket (dedup por appointment_id), no reinsertadas. */
  skipped: number;
  /** Puntos de fidelización acreditados en esta ejecución. */
  pointsAwarded: number;
  /** Recompensas de hito (3/5/8/10 visitas) generadas en esta ejecución. */
  rewards: number;
}

/** Motivo del movimiento EARN a partir de las etiquetas de línea (espejo de awardVisit). */
function buildSaleEarnReason(items: readonly { label: string }[]): string {
  const labels = items
    .map((item) => item.label.trim())
    .filter((label) => label.length > 0);
  const detail = labels.length > 0 ? labels.join(", ") : `${items.length} línea(s)`;
  return `Venta TPV: ${detail}`.slice(0, 500);
}

/**
 * Inserta la recompensa de un hito reintentando ante colisión del código único
 * `(salon_id, code)` (espejo de `maybeCreateMilestoneReward` de `@/lib/loyalty/server`).
 * Devuelve `true` si se creó; `false` si se agotan los 5 intentos (astronómicamente
 * improbable) sin abortar la acreditación ya realizada.
 */
async function insertMilestoneReward(
  client: SupabaseClient<Database>,
  salonId: string,
  reward: { customerId: string; type: string; expiresAt: string; createdAt: string },
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = formatRewardCode(
      reward.type,
      randomRewardSuffix((n) => randomBytes(n)),
    );
    const insert: Database["public"]["Tables"]["rewards"]["Insert"] = {
      salon_id: salonId,
      customer_id: reward.customerId,
      type: reward.type,
      code,
      status: "AVAILABLE",
      expires_at: reward.expiresAt,
      created_at: reward.createdAt,
    };
    const { error } = await client.from("rewards").insert(insert);
    if (error === null) return true;
    // 23505 = unique_violation → reintentar con otro código; otro error → aborta.
    if (error.code !== "23505") {
      throw new Error(`No se pudo crear la recompensa de hito: ${error.message}`);
    }
  }
  return false;
}

/**
 * Acredita los puntos de fidelización de las ventas recién creadas REPLICANDO las
 * escrituras de `awardVisit` (`@/lib/loyalty/server`) con el cliente admin, sin
 * reimplementar la aritmética (usa `computeVisitPoints` y los hitos puros). No es
 * invocable el orquestador de servidor desde un seed headless (exige sesión), así
 * que se replican sus efectos (contratos §5.4):
 *   · Recorre las ventas en ORDEN CRONOLÓGICO por cliente: los hitos 3/5/8/10
 *     dependen del recuento acumulado de visitas.
 *   · Ancla la IDEMPOTENCIA en `(ref_type='pos_sale', ref_id=saleId)`: una venta ya
 *     acreditada (EARN existente) no vuelve a sumar (patrón `findExistingEarn`).
 *   · Suma sobre el saldo REAL leído de `loyalty_accounts` (no inventa saldos): el
 *     upsert final deja el saldo/visitas correctos aunque se reejecute parcialmente.
 *   · Backdatea el movimiento y la recompensa al instante de la venta (histórico).
 */
async function creditSalesLoyalty(
  client: SupabaseClient<Database>,
  salonId: string,
  sales: readonly DemoSalePlan[],
  saleIdByAppointment: ReadonlyMap<string, string>,
): Promise<{ pointsAwarded: number; rewards: number }> {
  // Solo las ventas realmente insertadas (con saleId resuelto).
  const created = sales
    .map((sale) => ({ sale, saleId: saleIdByAppointment.get(sale.appointmentId) }))
    .filter((x): x is { sale: DemoSalePlan; saleId: string } => x.saleId !== undefined);
  if (created.length === 0) return { pointsAwarded: 0, rewards: 0 };

  // Idempotencia: EARN de tipo pos_sale ya presentes → saleIds ya acreditados.
  const { data: earns, error: earnError } = await client
    .from("points_movements")
    .select("ref_id")
    .eq("salon_id", salonId)
    .eq("type", "EARN")
    .eq("ref_type", "pos_sale");
  if (earnError !== null) {
    throw new Error(`No se pudieron leer los movimientos de puntos: ${earnError.message}`);
  }
  const alreadyEarned = new Set<string>(
    (earns ?? []).map((e) => e.ref_id).filter((id): id is string => id !== null),
  );

  // Saldos actuales de las cuentas del salón (base del read-modify-write). El trigger
  // de bootstrap ya crea la cuenta al alta del cliente; el upsert final cubre huecos.
  const { data: accounts, error: accError } = await client
    .from("loyalty_accounts")
    .select("customer_id, points_balance, visits_total")
    .eq("salon_id", salonId);
  if (accError !== null) {
    throw new Error(`No se pudieron leer las cuentas de fidelización: ${accError.message}`);
  }
  interface AccountState {
    points: number;
    visits: number;
    lastVisitAt: string | null;
    touched: boolean;
  }
  const state = new Map<string, AccountState>();
  for (const account of accounts ?? []) {
    state.set(account.customer_id, {
      points: account.points_balance,
      visits: account.visits_total,
      lastVisitAt: null,
      touched: false,
    });
  }

  // Orden cronológico estable por instante de cobro (empates → orden de entrada).
  const ordered = [...created].sort((a, b) =>
    a.sale.soldAtIso < b.sale.soldAtIso ? -1 : a.sale.soldAtIso > b.sale.soldAtIso ? 1 : 0,
  );

  const movementInserts: Database["public"]["Tables"]["points_movements"]["Insert"][] = [];
  const rewardPlans: { customerId: string; type: string; expiresAt: string; createdAt: string }[] =
    [];
  let pointsAwarded = 0;

  for (const { sale, saleId } of ordered) {
    if (alreadyEarned.has(saleId)) continue; // no-op idempotente

    let account = state.get(sale.customerId);
    if (account === undefined) {
      account = { points: 0, visits: 0, lastVisitAt: null, touched: false };
      state.set(sale.customerId, account);
    }

    // Puntos sobre lo REALMENTE cobrado (bruto por línea), regla ceil(price/200).
    const lineItems = saleLoyaltyLineItems(sale);
    const { pointsTotal } = computeVisitPoints(lineItems);

    account.points += pointsTotal;
    account.visits += 1;
    account.lastVisitAt = sale.soldAtIso;
    account.touched = true;
    pointsAwarded += pointsTotal;
    alreadyEarned.add(saleId);

    movementInserts.push({
      salon_id: salonId,
      customer_id: sale.customerId,
      type: "EARN",
      points: pointsTotal,
      reason: buildSaleEarnReason(lineItems),
      ref_type: "pos_sale",
      ref_id: saleId,
      created_at: sale.soldAtIso,
    });

    // Hito 3/5/8/10 → recompensa AVAILABLE (a lo sumo una por visita).
    const milestone = milestoneForVisitCount(account.visits);
    if (milestone !== null) {
      rewardPlans.push({
        customerId: sale.customerId,
        type: milestone.rewardType,
        expiresAt: addDaysIso(new Date(sale.soldAtIso), DEFAULT_LOYALTY_CONFIG.rewardValidityDays),
        createdAt: sale.soldAtIso,
      });
    }
  }

  // Libro mayor: movimientos EARN (append-only), en lotes.
  for (const batch of chunk(movementInserts, 500)) {
    const { error } = await client.from("points_movements").insert(batch);
    if (error !== null) {
      throw new Error(`No se pudieron registrar los movimientos de puntos: ${error.message}`);
    }
  }

  // Cuentas: upsert al saldo/visitas finales de los clientes tocados (idempotente
  // por `unique (salon_id, customer_id)`). Los no tocados no se alteran.
  const accountUpserts = [...state.entries()]
    .filter(([, account]) => account.touched)
    .map(([customerId, account]) => ({
      salon_id: salonId,
      customer_id: customerId,
      points_balance: account.points,
      visits_total: account.visits,
      last_visit_at: account.lastVisitAt,
      last_activity_at: account.lastVisitAt,
    }));
  for (const batch of chunk(accountUpserts, 500)) {
    const { error } = await client
      .from("loyalty_accounts")
      .upsert(batch, { onConflict: "salon_id,customer_id" });
    if (error !== null) {
      throw new Error(`No se pudieron actualizar las cuentas de fidelización: ${error.message}`);
    }
  }

  // Recompensas de hito (pocas; una a una con reintento de código único).
  let rewardsCreated = 0;
  for (const reward of rewardPlans) {
    if (await insertMilestoneReward(client, salonId, reward)) rewardsCreated += 1;
  }

  return { pointsAwarded, rewards: rewardsCreated };
}

/**
 * Siembra las VENTAS del salón demo (sub-7): un ticket del TPV por cada cita PASADA
 * completada, agrupados en SESIONES DE CAJA (arqueo) por sede y día. Reutiliza los
 * contratos de `docs/seed-demo-contracts.md`:
 *
 *  · IMPORTES — `generateDemoSales` (puro) calcula los totales con `computeSaleTotals`
 *    (la MISMA fuente que el TPV real), así cabecera, líneas y pagos cuadran al
 *    céntimo. Cada ticket lleva su línea de servicio y, a veces, un producto retail.
 *  · PAGOS — filas de `pos_payments` construidas por la pasarela `manual`
 *    (`getPaymentGateway`), que valida que los tenders cubren EXACTAMENTE el total
 *    (mezcla real de efectivo/tarjeta/bizum + algún pago mixto).
 *  · ARQUEO — cada sesión (`pos_sessions`) lleva fondo de caja, efectivo esperado
 *    (= fondo + ventas en efectivo), contado y descuadre; snapshot de totales por
 *    método en `closing_totals`. Las sesiones nacen CERRADAS (histórico).
 *  · FIDELIZACIÓN — se acreditan los puntos replicando `awardVisit` (contratos §5.4),
 *    reutilizando la matemática pura de puntos e hitos. No se inventan saldos.
 *  · FACTURAS — NO se emiten aquí: todas las ventas quedan como ticket simple; una
 *    subtarea posterior factura un subconjunto (así "algunas ventas sin factura").
 *
 * ADITIVO E IDEMPOTENTE: dedup de ventas por `appointment_id` (una venta por cita) y
 * de sesiones por la marca `notes='seed_demo_session:<clave>'`; la fidelización por
 * el EARN existente `(ref_type='pos_sale', ref_id)`. Reejecutar no duplica nada.
 */
async function seedSales(ctx: SeedContext): Promise<SalesSeedResult> {
  assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug });
  const { client, salonId } = ctx;

  if (ctx.dryRun) {
    // En dry-run no se consulta la BD; se estima con el plan de citas (puro), igual
    // que `seedAppointments`: la base de ventas = citas `completed`.
    const todayStr = localDateInZone("Europe/Madrid", ctx.now);
    const plan = generateDemoAppointments({
      todayStr,
      customerCount: ctx.customerCount,
      density: resolveAppointmentDensity(process.env.SEED_DEMO_APPOINTMENT_DENSITY),
    });
    const completed = plan.filter((item) => item.status === "completed").length;
    log(
      "sales",
      `DRY-RUN: se generarían ~${completed} ventas (tickets) sobre las citas completadas, ` +
        "agrupadas en sesiones de caja (arqueo) por sede/día, con mezcla real de métodos de " +
        "pago y acreditación de puntos. No se emiten facturas (ticket simple). (no se escribe).",
    );
    return {
      eligible: completed,
      sales: 0,
      sessions: 0,
      skipped: completed,
      pointsAwarded: 0,
      rewards: 0,
    };
  }

  // 1) Zona horaria del salón (fecha local de sesión + horas de apertura de la sede).
  const { data: salonRow, error: salonError } = await client
    .from("salons")
    .select("timezone")
    .eq("id", salonId)
    .single();
  if (salonError !== null || salonRow === null) {
    throw new Error(
      `No se pudo leer la zona horaria del salón demo: ${salonError?.message ?? "sin fila"}.`,
    );
  }
  const timezone = salonRow.timezone;

  // 2) Un usuario del salón (owner) para sold_by/opened_by/closed_by (opcional; NULL si falta).
  const { data: memberRow, error: memberError } = await client
    .from("salon_members")
    .select("user_id")
    .eq("salon_id", salonId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError !== null) {
    throw new Error(`No se pudo leer el personal del salón demo: ${memberError.message}`);
  }
  const staffUserId = memberRow?.user_id ?? null;

  // 3) Profesional → sede (la venta cuelga de la sesión de caja de esa sede).
  const { data: pros, error: prosError } = await client
    .from("professionals")
    .select("id, location_id")
    .eq("salon_id", salonId);
  if (prosError !== null) {
    throw new Error(`No se pudieron leer los profesionales: ${prosError.message}`);
  }
  const locationByPro = new Map<string, string | null>(
    (pros ?? []).map((p) => [p.id, p.location_id]),
  );

  // 4) Sede → horas de apertura (se derivan del catálogo DEMO_LOCATIONS por slug).
  const { data: locs, error: locsError } = await client
    .from("locations")
    .select("id, slug")
    .eq("salon_id", salonId);
  if (locsError !== null) {
    throw new Error(`No se pudieron leer las sedes: ${locsError.message}`);
  }
  const openHoursByLocation = new Map<string, { open: string; close: string }>();
  for (const loc of locs ?? []) {
    const demo = DEMO_LOCATIONS.find((l) => l.slug === loc.slug);
    if (demo !== undefined) {
      openHoursByLocation.set(loc.id, { open: demo.openStart, close: demo.openEnd });
    }
  }

  // 5) Servicio → nombre (snapshot de la descripción de la línea de servicio).
  const { data: svcs, error: svcsError } = await client
    .from("services")
    .select("id, name")
    .eq("salon_id", salonId);
  if (svcsError !== null) {
    throw new Error(`No se pudieron leer los servicios: ${svcsError.message}`);
  }
  const serviceNameById = new Map<string, string>((svcs ?? []).map((s) => [s.id, s.name]));

  // 6) Productos retail activos → catálogo de venta cruzada del generador.
  const { data: prods, error: prodsError } = await client
    .from("products")
    .select("id, name, price_cents, vat_rate")
    .eq("salon_id", salonId)
    .eq("active", true);
  if (prodsError !== null) {
    throw new Error(`No se pudieron leer los productos: ${prodsError.message}`);
  }
  const products: DemoRetailProduct[] = (prods ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.price_cents,
    vatRate: p.vat_rate,
  }));

  // 7) Citas completadas del salón (base de las ventas).
  const { data: appts, error: apptsError } = await client
    .from("appointments")
    .select("id, customer_id, professional_id, service_id, starts_at, ends_at, price_cents")
    .eq("salon_id", salonId)
    .eq("status", "completed");
  if (apptsError !== null) {
    throw new Error(`No se pudieron leer las citas completadas: ${apptsError.message}`);
  }

  // 8) Ventas ya existentes → dedup por appointment_id (idempotencia additiva).
  const { data: existingSales, error: existingSalesError } = await client
    .from("pos_sales")
    .select("appointment_id")
    .eq("salon_id", salonId);
  if (existingSalesError !== null) {
    throw new Error(`No se pudieron leer las ventas existentes: ${existingSalesError.message}`);
  }
  const soldAppointmentIds = new Set<string>(
    (existingSales ?? [])
      .map((s) => s.appointment_id)
      .filter((id): id is string => id !== null),
  );

  // Materializa las entradas del generador (resuelve sede, fecha local y servicio).
  const inputs: DemoSaleAppointmentInput[] = [];
  let unresolved = 0;
  for (const appt of appts ?? []) {
    if (soldAppointmentIds.has(appt.id)) continue; // ya facturada como ticket
    const serviceName = serviceNameById.get(appt.service_id);
    if (serviceName === undefined || appt.price_cents <= 0) {
      unresolved += 1;
      continue;
    }
    inputs.push({
      appointmentId: appt.id,
      customerId: appt.customer_id,
      professionalId: appt.professional_id,
      serviceId: appt.service_id,
      serviceName,
      servicePriceCents: appt.price_cents,
      locationId: locationByPro.get(appt.professional_id) ?? null,
      localDateStr: localDateInZone(timezone, new Date(appt.starts_at)),
      soldAtIso: appt.ends_at, // el cobro ocurre al terminar el servicio
    });
  }

  if (inputs.length === 0) {
    log(
      "sales",
      `Ventas ya sembradas (${soldAppointmentIds.size} citas con ticket); nada que insertar ` +
        `(idempotente).` +
        (unresolved > 0 ? ` ${unresolved} citas sin resolver (servicio/precio).` : ""),
    );
    return {
      eligible: soldAppointmentIds.size,
      sales: 0,
      sessions: 0,
      skipped: soldAppointmentIds.size,
      pointsAwarded: 0,
      rewards: 0,
    };
  }

  // Plan de ventas + sesiones (puro y determinista).
  const plan = generateDemoSales({ appointments: inputs, products });

  // 9) Sesiones de caja: dedup por la marca `notes='seed_demo_session:<clave>'`.
  const { data: existingSessions, error: sessError } = await client
    .from("pos_sessions")
    .select("id, notes")
    .eq("salon_id", salonId);
  if (sessError !== null) {
    throw new Error(`No se pudieron leer las sesiones de caja: ${sessError.message}`);
  }
  const sessionIdByKey = new Map<string, string>();
  const sessionMarker = /^seed_demo_session:(.+)$/;
  for (const session of existingSessions ?? []) {
    const match = typeof session.notes === "string" ? session.notes.match(sessionMarker) : null;
    if (match?.[1] !== undefined) sessionIdByKey.set(match[1], session.id);
  }

  // Crea las sesiones que falten (CERRADAS, con su arqueo del plan). Las ventas de una
  // sesión reutilizada (reejecución parcial) se cuelgan de la existente sin rehacer su
  // arqueo (additivo: no altera filas de ejecuciones anteriores).
  const sessionInserts: Database["public"]["Tables"]["pos_sessions"]["Insert"][] = [];
  for (const session of plan.sessions) {
    if (sessionIdByKey.has(session.sessionKey)) continue;
    const hours = session.locationId
      ? openHoursByLocation.get(session.locationId)
      : undefined;
    const openTime = hours?.open ?? "09:00";
    const closeTime = hours?.close ?? "21:00";
    sessionInserts.push({
      salon_id: salonId,
      location_id: session.locationId,
      status: "closed",
      currency: "EUR",
      opened_by: staffUserId,
      opened_at: zonedWallTimeToUtc(session.localDateStr, openTime, timezone).toISOString(),
      opening_float_cents: session.openingFloatCents,
      closed_by: staffUserId,
      closed_at: zonedWallTimeToUtc(session.localDateStr, closeTime, timezone).toISOString(),
      expected_cash_cents: session.expectedCashCents,
      counted_cash_cents: session.countedCashCents,
      cash_variance_cents: session.cashVarianceCents,
      closing_totals: {
        efectivo: session.totalsByMethod.efectivo,
        tarjeta: session.totalsByMethod.tarjeta,
        bizum: session.totalsByMethod.bizum,
      },
      notes: `seed_demo_session:${session.sessionKey}`,
    });
  }
  for (const batch of chunk(sessionInserts, 500)) {
    const { data: created, error } = await client
      .from("pos_sessions")
      .insert(batch)
      .select("id, notes");
    if (error !== null) {
      throw new Error(`No se pudieron crear las sesiones de caja: ${error.message}`);
    }
    for (const row of created ?? []) {
      const match = typeof row.notes === "string" ? row.notes.match(sessionMarker) : null;
      if (match?.[1] !== undefined) sessionIdByKey.set(match[1], row.id);
    }
  }

  // 10) Cabeceras de venta (pos_sales), capturando el id por appointment_id.
  const saleInserts: Database["public"]["Tables"]["pos_sales"]["Insert"][] = plan.sales.map(
    (sale) => ({
      salon_id: salonId,
      session_id: sessionIdByKey.get(sale.sessionKey) ?? null,
      appointment_id: sale.appointmentId,
      customer_id: sale.customerId,
      professional_id: sale.professionalId,
      status: "completed",
      subtotal_cents: sale.subtotalCents,
      discount_cents: sale.discountCents,
      tax_cents: sale.taxCents,
      total_cents: sale.totalCents,
      currency: "EUR",
      sold_by: staffUserId,
      sold_at: sale.soldAtIso,
    }),
  );
  const saleIdByAppointment = new Map<string, string>();
  for (const batch of chunk(saleInserts, 500)) {
    const { data: created, error } = await client
      .from("pos_sales")
      .insert(batch)
      .select("id, appointment_id");
    if (error !== null) {
      throw new Error(`No se pudieron crear las ventas demo: ${error.message}`);
    }
    for (const row of created ?? []) {
      if (row.appointment_id !== null) saleIdByAppointment.set(row.appointment_id, row.id);
    }
  }

  // 11) Líneas (snapshot de importe por línea) y cobros (pasarela manual valida el total).
  const gateway = getPaymentGateway(); // 'manual' — registro, sin cobro real
  const lineInserts: Database["public"]["Tables"]["pos_sale_lines"]["Insert"][] = [];
  const paymentInserts: PaymentInsert[] = [];
  for (const sale of plan.sales) {
    const saleId = saleIdByAppointment.get(sale.appointmentId);
    if (saleId === undefined) continue; // (no debería: se acaba de insertar)
    const sessionId = sessionIdByKey.get(sale.sessionKey) ?? null;

    for (const line of sale.lines) {
      const lineTotals = computeLineTotals({
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        vatRate: line.vatRate,
      });
      lineInserts.push({
        salon_id: salonId,
        sale_id: saleId,
        service_id: line.kind === "service" ? line.refId : null,
        product_id: line.kind === "product" ? line.refId : null,
        description: line.description,
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        discount_cents: 0,
        vat_rate: line.vatRate,
        line_total_cents: lineTotals.grossCents,
      });
    }

    const result = await gateway.registerPayment({
      salonId,
      saleId,
      sessionId,
      totalCents: sale.totalCents,
      tenders: sale.tenders.map((tender) => ({
        method: tender.method,
        amountCents: tender.amountCents,
      })),
      paidAt: sale.soldAtIso,
    });
    paymentInserts.push(...result.payments);
  }

  for (const batch of chunk(lineInserts, 500)) {
    const { error } = await client.from("pos_sale_lines").insert(batch);
    if (error !== null) {
      throw new Error(`No se pudieron guardar las líneas de venta: ${error.message}`);
    }
  }
  for (const batch of chunk(paymentInserts, 500)) {
    const { error } = await client.from("pos_payments").insert(batch);
    if (error !== null) {
      throw new Error(`No se pudieron registrar los cobros: ${error.message}`);
    }
  }

  // 12) Fidelización: acredita los puntos de las ventas (replica awardVisit).
  const loyalty = await creditSalesLoyalty(client, salonId, plan.sales, saleIdByAppointment);

  const withProduct = plan.sales.filter((sale) => sale.lines.length > 1).length;
  const mixedPayments = plan.sales.filter((sale) => sale.tenders.length > 1).length;
  log(
    "sales",
    `Ventas: +${plan.sales.length} tickets en ${sessionInserts.length} sesiones de caja nuevas ` +
      `(${plan.sessions.length - sessionInserts.length} reutilizadas) · ${withProduct} con producto · ` +
      `${mixedPayments} pago mixto · +${loyalty.pointsAwarded} puntos, ${loyalty.rewards} recompensas de hito. ` +
      `${soldAppointmentIds.size} citas ya tenían ticket.` +
      (unresolved > 0 ? ` ${unresolved} sin resolver.` : ""),
  );

  return {
    eligible: inputs.length,
    sales: plan.sales.length,
    sessions: sessionInserts.length,
    skipped: soldAppointmentIds.size,
    pointsAwarded: loyalty.pointsAwarded,
    rewards: loyalty.rewards,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Facturas del salón demo (sub-8): factura un SUBCONJUNTO de las ventas creando
// registros Veri*factu (pos_invoices) inmutables y encadenados por huella SHA-256
// por (salon_id, series), reutilizando @/lib/invoicing (NO se reimplementa la huella).
// ───────────────────────────────────────────────────────────────────────────

/** Resultado de la siembra de facturas (para el log y los tests de integración). */
interface InvoicesSeedResult {
  /** Serie de facturación demo empleada (cadena de huella por `(salon_id, series)`). */
  series: string;
  /** Nº de facturas del plan (subconjunto seleccionado de las ventas). */
  planned: number;
  /** Nº de facturas emitidas en esta ejecución (alta nueva en la serie). */
  emitted: number;
  /** De las emitidas, cuántas son F1/completa (con destinatario). */
  completa: number;
  /** De las emitidas, cuántas son F2/ticket (simplificadas). */
  ticket: number;
  /** Ventas del plan ya facturadas antes (dedup por `sale_id`), no reemitidas. */
  skipped: number;
}

/** Extrae el NIF del emisor del snapshot jsonb `issuer_data` (o "" si falta/no es texto). */
function issuerTaxIdFromSnapshot(issuerData: Json): string {
  if (
    typeof issuerData === "object" &&
    issuerData !== null &&
    !Array.isArray(issuerData)
  ) {
    const taxId = (issuerData as Record<string, Json>).tax_id;
    if (typeof taxId === "string") return taxId;
  }
  return "";
}

/** Resuelve la serie de facturación demo del entorno o cae al valor por defecto. */
function resolveInvoiceSeries(): string {
  const seriesEnv = process.env.SEED_DEMO_INVOICE_SERIES?.trim();
  return seriesEnv !== undefined && seriesEnv.length > 0 ? seriesEnv : DEMO_INVOICE_SERIES;
}

/**
 * Registro de la cadena de huella reconstruido desde la BD: el `HashableInvoiceRecord`
 * firmado + el `current_hash` persistido (para reverificar la huella) + el `issued_at`
 * ISO original (para el rango de fechas del resumen de verificación de sub-9).
 */
type LoadedInvoiceRecord = HashableInvoiceRecord & {
  currentHash: string;
  issuedAtIso: string;
};

/**
 * Relee TODOS los registros de la serie de la BD (ordenados por número ascendente) y
 * reconstruye el `HashableInvoiceRecord` EXACTAMENTE con los campos que se firmaron
 * (emisor, número visible, fechas, tipo, cuota/total, eslabón) — sin reimplementar la
 * huella. Base COMPARTIDA por la aserción de integridad (sub-8) y el resumen de
 * verificación final (sub-9), para releer la serie una sola vez por consumidor.
 */
async function loadInvoiceChainRecords(
  client: SupabaseClient<Database>,
  salonId: string,
  series: string,
): Promise<LoadedInvoiceRecord[]> {
  const { data, error } = await client
    .from("pos_invoices")
    .select(
      "full_number, issued_at, invoice_type, tax_cents, total_cents, previous_hash, current_hash, created_at, issuer_data",
    )
    .eq("salon_id", salonId)
    .eq("series", series)
    .order("sequential_number", { ascending: true });
  if (error !== null) {
    throw new Error(
      `No se pudo releer la serie "${series}" para verificar la cadena: ${error.message}`,
    );
  }
  return (data ?? []).map(
    (row) =>
      ({
        issuerTaxId: issuerTaxIdFromSnapshot(row.issuer_data),
        invoiceNumber: row.full_number,
        issuedAt: new Date(row.issued_at),
        invoiceCode: row.invoice_type === "completa" ? "F1" : "F2",
        taxCents: row.tax_cents,
        totalCents: row.total_cents,
        previousHash: row.previous_hash,
        generatedAt: new Date(row.created_at),
        currentHash: row.current_hash,
        issuedAtIso: row.issued_at,
      }) satisfies LoadedInvoiceRecord,
  );
}

/**
 * Reverifica que la cadena de huella de la serie es ÍNTEGRA releyendo TODOS sus
 * registros de la BD y pasándolos por `verifyHashChain` (`@/lib/invoicing`), que
 * recalcula la huella de cada registro y comprueba el eslabón `previous_hash`.
 * Aserción post-seed exigida por el contrato (docs/seed-demo-contracts.md §3.4):
 * debe devolver -1.
 */
async function assertInvoiceChainIntact(
  client: SupabaseClient<Database>,
  salonId: string,
  series: string,
): Promise<void> {
  const records = await loadInvoiceChainRecords(client, salonId, series);
  if (records.length === 0) return;

  const corruptIndex = verifyHashChain(records);
  if (corruptIndex !== -1) {
    throw new Error(
      `La cadena de huella de la serie "${series}" está CORRUPTA en el índice ${corruptIndex} ` +
        "(verifyHashChain !== -1). Aborta para no dejar una cadena de facturación inválida.",
    );
  }
}

/**
 * Siembra las FACTURAS del salón demo (sub-8): emite un SUBCONJUNTO de las ventas ya
 * sembradas como registros de facturación Veri*factu (`pos_invoices`), REUTILIZANDO
 * `@/lib/invoicing` (docs/seed-demo-contracts.md §3) — sin reimplementar la huella:
 *
 *  · EMISIÓN — `emitInvoice(adminClient, …)` resuelve por cada factura la NUMERACIÓN
 *    correlativa sin huecos, el `previous_hash` y la HUELLA SHA-256 encadenada por
 *    `(salon_id, series)`, y persiste el alta inmutable. Se emite en ORDEN CRONOLÓGICO
 *    con `issuedAt` retrodatado al cobro ⇒ `issued_at` ASCENDENTE dentro de la serie.
 *  · IMPORTES — los totales/IVA salen de `computeSaleTotals` sobre las líneas REALES de
 *    la venta (fuente única; la misma aritmética de la caja y el TPV), así base/cuota/
 *    total cuadran al céntimo con `pos_sale_lines`.
 *  · MEZCLA — `selectInvoicePlan` (puro) elige el subconjunto (~100–300) y asigna la
 *    MAYORÍA a F2/ticket (simplificada, anónima) y una MINORÍA a F1/completa con
 *    DESTINATARIO ficticio (nombre del cliente demo + NIF de forma válida).
 *  · EMISOR — snapshot de los datos fiscales FICTICIOS del salón demo (tax_id/legal_name/
 *    fiscal_address, sub-3); sin ellos `emitInvoice` no puede firmar (se omite con aviso).
 *  · VERIFICACIÓN — al final relee la serie y exige `verifyHashChain === -1` (cadena
 *    íntegra); si no, aborta.
 *
 * ADITIVO E IDEMPOTENTE: las facturas son INMUTABLES (no se borran ni rehacen), así que
 * el dedup es por `sale_id` ya facturado en la serie: reejecutar NO reemite (la serie
 * solo crece). La selección es determinista ⇒ estable entre ejecuciones. El resto de
 * ventas queda SIN factura (solo ticket), como pidió el cliente.
 */
async function seedInvoices(ctx: SeedContext): Promise<InvoicesSeedResult> {
  assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug });
  const { client, salonId } = ctx;

  const series = resolveInvoiceSeries();
  const targetCount = resolveInvoiceCount(process.env.SEED_DEMO_INVOICE_COUNT);

  if (ctx.dryRun) {
    // Sin BD: estima con el plan de citas (base de las ventas), igual que seedSales.
    const todayStr = localDateInZone("Europe/Madrid", ctx.now);
    const plan = generateDemoAppointments({
      todayStr,
      customerCount: ctx.customerCount,
      density: resolveAppointmentDensity(process.env.SEED_DEMO_APPOINTMENT_DENSITY),
    });
    const completed = plan.filter((item) => item.status === "completed").length;
    const estimate = Math.min(targetCount, completed);
    log(
      "invoices",
      `DRY-RUN: se emitirían ~${estimate} facturas en la serie "${series}" (mayoría F2/ticket + ` +
        `~${Math.round(DEFAULT_F1_RATE * 100)} % F1/completa con destinatario) sobre las ventas, con la ` +
        "numeración correlativa y la huella encadenada de @/lib/invoicing. El resto de ventas queda sin factura. No se escribe.",
    );
    return { series, planned: estimate, emitted: 0, completa: 0, ticket: 0, skipped: 0 };
  }

  // 1) Emisor: datos fiscales (ficticios) del salón demo. Obligatorio para firmar la huella.
  const { data: salonRow, error: salonError } = await client
    .from("salons")
    .select("tax_id, legal_name, fiscal_address")
    .eq("id", salonId)
    .maybeSingle();
  if (salonError !== null) {
    throw new Error(`No se pudo leer el emisor del salón demo: ${salonError.message}`);
  }
  if (salonRow === null || salonRow.tax_id === null || salonRow.legal_name === null) {
    log(
      "invoices",
      "El salón demo no tiene datos fiscales (tax_id/legal_name); no se emiten facturas. " +
        "Los siembra sub-3; complétalos y reejecuta.",
    );
    return { series, planned: 0, emitted: 0, completa: 0, ticket: 0, skipped: 0 };
  }
  const issuer: IssuerData = {
    taxId: salonRow.tax_id,
    legalName: salonRow.legal_name,
    fiscalAddress: salonRow.fiscal_address,
  };

  // 2) Ventas completadas del salón (base de las facturas).
  const { data: sales, error: salesError } = await client
    .from("pos_sales")
    .select("id, customer_id, sold_at")
    .eq("salon_id", salonId)
    .eq("status", "completed");
  if (salesError !== null) {
    throw new Error(`No se pudieron leer las ventas para facturar: ${salesError.message}`);
  }

  // 3) Líneas de venta → totales por venta con `computeSaleTotals` (fuente única de IVA).
  const { data: saleLines, error: linesError } = await client
    .from("pos_sale_lines")
    .select("sale_id, quantity, unit_price_cents, discount_cents, vat_rate")
    .eq("salon_id", salonId);
  if (linesError !== null) {
    throw new Error(`No se pudieron leer las líneas de venta: ${linesError.message}`);
  }
  const lineInputsBySale = new Map<string, SaleLineInput[]>();
  for (const line of saleLines ?? []) {
    const list = lineInputsBySale.get(line.sale_id) ?? [];
    list.push({
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
      vatRate: line.vat_rate,
      discountCents: line.discount_cents,
    });
    lineInputsBySale.set(line.sale_id, list);
  }

  // 4) Clientes → nombre/dirección para el DESTINATARIO de las facturas completas (F1).
  const { data: customers, error: custError } = await client
    .from("customers")
    .select("id, full_name, address")
    .eq("salon_id", salonId);
  if (custError !== null) {
    throw new Error(`No se pudieron leer los clientes: ${custError.message}`);
  }
  const customerById = new Map(
    (customers ?? []).map(
      (c): [string, { fullName: string | null; address: string | null }] => [
        c.id,
        { fullName: c.full_name, address: c.address },
      ],
    ),
  );

  // 5) Facturas ya emitidas en la serie → dedup por sale_id (inmutables; la serie solo crece).
  const { data: existingInvoices, error: existingError } = await client
    .from("pos_invoices")
    .select("sale_id")
    .eq("salon_id", salonId)
    .eq("series", series);
  if (existingError !== null) {
    throw new Error(`No se pudieron leer las facturas existentes: ${existingError.message}`);
  }
  const invoicedSaleIds = new Set<string>(
    (existingInvoices ?? [])
      .map((r) => r.sale_id)
      .filter((id): id is string => id !== null),
  );

  // 6) Entradas del planificador: ventas con líneas → total calculable (> 0).
  const inputs: DemoInvoiceSaleInput[] = [];
  const totalsBySale = new Map<string, SaleTotals>();
  for (const sale of sales ?? []) {
    const lineInputs = lineInputsBySale.get(sale.id);
    if (lineInputs === undefined || lineInputs.length === 0) continue;
    const totals = computeSaleTotals(lineInputs);
    if (totals.totalCents <= 0) continue;
    totalsBySale.set(sale.id, totals);
    const customer = sale.customer_id !== null ? customerById.get(sale.customer_id) : undefined;
    inputs.push({
      saleId: sale.id,
      soldAtIso: sale.sold_at,
      customerId: sale.customer_id,
      customerName: customer?.fullName ?? null,
      customerAddress: customer?.address ?? null,
      totalCents: totals.totalCents,
    });
  }

  if (inputs.length === 0) {
    log("invoices", "No hay ventas facturables (con líneas y total > 0); nada que emitir.");
    return { series, planned: 0, emitted: 0, completa: 0, ticket: 0, skipped: 0 };
  }

  // 7) Selección determinista del subconjunto a facturar (F2 mayoría + algunas F1).
  const plan = selectInvoicePlan({ sales: inputs, targetCount });

  // 8) Emisión en ORDEN CRONOLÓGICO ascendente; salta las ventas ya facturadas.
  let emitted = 0;
  let completa = 0;
  let ticket = 0;
  let skipped = 0;
  for (const item of plan) {
    if (invoicedSaleIds.has(item.saleId)) {
      skipped += 1;
      continue;
    }
    const totals = totalsBySale.get(item.saleId);
    if (totals === undefined) continue; // inalcanzable: el plan sale de estos mismos ids

    try {
      await emitInvoice(client, {
        salonId,
        saleId: item.saleId,
        invoiceType: item.invoiceType,
        series,
        totals,
        issuer,
        recipient: item.recipient,
        issuedAt: new Date(item.issuedAtIso),
      });
    } catch (error) {
      const detail =
        error instanceof InvoiceEmissionError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      throw new Error(`No se pudo emitir la factura demo de la venta ${item.saleId}: ${detail}`);
    }
    emitted += 1;
    if (item.invoiceType === "completa") completa += 1;
    else ticket += 1;
  }

  // 9) Aserción post-seed: la cadena de huella de la serie es ÍNTEGRA (verifyHashChain === -1).
  await assertInvoiceChainIntact(client, salonId, series);

  log(
    "invoices",
    `Facturas: +${emitted} en la serie "${series}" (${completa} F1/completa con destinatario, ` +
      `${ticket} F2/ticket) · ${skipped} ventas ya facturadas · cadena de huella verificada ` +
      "(verifyHashChain === -1). El resto de ventas queda sin factura.",
  );

  return { series, planned: plan.length, emitted, completa, ticket, skipped };
}

// ───────────────────────────────────────────────────────────────────────────
// Pasos de dominio — punto de extensión para subtareas posteriores.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Punto de extensión para las subtareas de dominio (clientes, citas, tickets,
 * facturas, fidelización). Cada paso DEBE:
 *  1. Llamar `assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug })`
 *     antes de cualquier escritura.
 *  2. Ser additivo e idempotente (usar `ensureRow` o guardas por clave natural).
 *  3. Reutilizar la lógica pura/servidor documentada en
 *     `docs/seed-demo-contracts.md` (computeSaleTotals, emitInvoice,
 *     createBookingForSalon, matemática de puntos…) en vez de reimplementar
 *     reglas de negocio.
 */
async function seedDomainData(ctx: SeedContext): Promise<void> {
  assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug });

  // Configuración operativa (sub-4): prerrequisito de clientes/citas/ventas.
  await seedOperationalConfig(ctx);

  // Clientes (sub-5): fichas con teléfono único → cuenta de puntos + cupón + qr_token.
  await seedCustomers(ctx);

  // Citas (sub-6): ~12 meses con estacionalidad (más viernes/sábado + picos), mayoría
  // pasadas (completed → visita) y algunas futuras (confirmed/pending). Requiere
  // profesionales, servicios y clientes ya sembrados.
  await seedAppointments(ctx);

  // Ventas (sub-7): un ticket del TPV por cita completada, agrupados en sesiones de
  // caja (arqueo) por sede/día, con mezcla real de métodos de pago y acreditación de
  // puntos de fidelización. Requiere clientes, citas y catálogo ya sembrados.
  await seedSales(ctx);

  // Facturas (sub-8): factura un SUBCONJUNTO de las ventas (~100–300) creando registros
  // Veri*factu (pos_invoices), mezcla F2/ticket (mayoría) + algunas F1/completa con
  // destinatario, reutilizando @/lib/invoicing (emitInvoice → numeración correlativa +
  // huella SHA-256 encadenada por (salon_id, series)). Requiere ventas ya sembradas y
  // datos fiscales del salón. El resto de ventas queda sin factura (solo ticket).
  await seedInvoices(ctx);

  // TODO(subtarea fidelización):   await seedLoyaltyHistory(ctx);
}

// ───────────────────────────────────────────────────────────────────────────
// Verificación y resumen final (sub-9): relee la BD para (a) confirmar que NINGÚN
// salón existente fue modificado y (b) imprimir el estado del salón demo (identidad,
// credenciales del owner, recuentos + rango de fechas, y verifyHashChain === -1).
// ───────────────────────────────────────────────────────────────────────────

/** Huella mínima de un salón ajeno para detectar cualquier modificación posterior. */
interface SalonFingerprint {
  slug: string;
  /** `updated_at` (ISO). El seed es additivo y jamás hace UPDATE sobre `salons`. */
  updatedAt: string;
}

/**
 * Fotografía TODOS los salones distintos del demo (`id ≠ salonId`) por su
 * `(slug, updated_at)`. Sirve de LÍNEA BASE: al terminar el seed se relee y se exige
 * que ninguno haya cambiado (ver `assertOtherSalonsUntouched`). Como el seed solo
 * escribe filas colgadas del salón demo (por `salon_id`) y nunca hace UPDATE/DELETE
 * sobre `salons`, la línea base debe quedar intacta byte a byte.
 */
async function snapshotOtherSalons(
  client: SupabaseClient<Database>,
  salonId: string,
): Promise<Map<string, SalonFingerprint>> {
  const { data, error } = await client
    .from("salons")
    .select("id, slug, updated_at")
    .neq("id", salonId);
  if (error !== null) {
    throw new Error(`No se pudo fotografiar los salones existentes: ${error.message}`);
  }
  return new Map(
    (data ?? []).map((row) => [row.id, { slug: row.slug, updatedAt: row.updated_at }]),
  );
}

/**
 * Reafirma por RELECTURA que ningún salón existente (los de la línea base) fue
 * modificado ni borrado durante el seed: cada uno debe seguir presente con el MISMO
 * `updated_at`. Es la comprobación en caliente de la garantía "solo se toca el salón
 * demo" del contrato (docs/seed-demo-contracts.md §1). Lanza si detecta cualquier
 * cambio. Devuelve cuántos salones ajenos se verificaron intactos.
 */
async function assertOtherSalonsUntouched(
  client: SupabaseClient<Database>,
  salonId: string,
  baseline: ReadonlyMap<string, SalonFingerprint>,
): Promise<number> {
  const { data, error } = await client
    .from("salons")
    .select("id, slug, updated_at")
    .neq("id", salonId);
  if (error !== null) {
    throw new Error(
      `No se pudo releer los salones existentes para verificarlos: ${error.message}`,
    );
  }
  const current = new Map(
    (data ?? []).map(
      (row) => [row.id, { slug: row.slug, updatedAt: row.updated_at }] as const,
    ),
  );
  for (const [id, fingerprint] of baseline) {
    const now = current.get(id);
    if (now === undefined) {
      throw new Error(
        `El salón existente "${fingerprint.slug}" (${id}) DESAPARECIÓ durante el seed: ` +
          "el seed demo jamás debe borrar salones ajenos.",
      );
    }
    if (now.updatedAt !== fingerprint.updatedAt) {
      throw new Error(
        `El salón existente "${fingerprint.slug}" (${id}) fue MODIFICADO durante el seed ` +
          `(updated_at ${fingerprint.updatedAt} → ${now.updatedAt}): el seed demo solo puede ` +
          "tocar el salón demo.",
      );
    }
  }
  return baseline.size;
}

/**
 * Filtro encadenable + thenable de un COUNT de PostgREST. Al operar con nombres de
 * tabla dinámicos se pierde el estrechamiento de supabase-js; el `cast` es el único
 * escape de tipos y queda acotado a los helpers de recuento (mismo patrón sancionado
 * que `ensureRow`).
 */
type CountQuery = {
  eq: (column: string, value: unknown) => CountQuery;
} & PromiseLike<{ count: number | null; error: { message: string } | null }>;

/**
 * Cuenta filas de `table` que cumplen `match` mediante COUNT exact SIN traer filas
 * (`head: true`). Se usa para los totales del resumen (clientes/citas/ventas/facturas)
 * releídos de la BD, de modo que reflejen el estado ACUMULADO (no solo el alta de esta
 * ejecución, que en una reejecución idempotente sería 0).
 */
async function countRows(
  client: SupabaseClient<Database>,
  table: PublicTable,
  match: Readonly<Record<string, string>>,
): Promise<number> {
  let query = client
    .from(table)
    .select("*", { count: "exact", head: true }) as unknown as CountQuery;
  for (const [column, value] of Object.entries(match)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error !== null) {
    throw new Error(`No se pudo contar "${table}": ${error.message}`);
  }
  return count ?? 0;
}

/** Rango temporal (ISO) de un conjunto de filas, o `null` en cada extremo si está vacío. */
interface DateRange {
  from: string | null;
  to: string | null;
}

/** Filtro encadenable de una lectura ordenada de PostgREST (escape de tipos localizado). */
type RangeQuery = {
  eq: (column: string, value: unknown) => RangeQuery;
  order: (column: string, options: { ascending: boolean }) => RangeQuery;
  limit: (count: number) => {
    maybeSingle: () => Promise<{
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    }>;
  };
};

/**
 * Devuelve el rango `[from, to]` (mínimo y máximo) de una columna temporal de `table`
 * acotada al salón demo, o `null` en el extremo correspondiente si la tabla está
 * vacía. Usa dos lecturas `ORDER BY column {asc|desc} LIMIT 1` (amigables con el
 * índice, sin traer todas las filas).
 */
async function salonColumnRange(
  client: SupabaseClient<Database>,
  table: PublicTable,
  salonId: string,
  column: string,
): Promise<DateRange> {
  const readEdge = async (ascending: boolean): Promise<string | null> => {
    const base = client.from(table).select(column) as unknown as RangeQuery;
    const { data, error } = await base
      .eq("salon_id", salonId)
      .order(column, { ascending })
      .limit(1)
      .maybeSingle();
    if (error !== null) {
      throw new Error(`No se pudo leer el rango de "${table}.${column}": ${error.message}`);
    }
    const value = data?.[column];
    return typeof value === "string" ? value : null;
  };
  const [from, to] = await Promise.all([readEdge(true), readEdge(false)]);
  return { from, to };
}

/** Rango `[min, max]` de `issued_at` sobre los registros de factura ya cargados. */
function invoiceDateRange(records: readonly LoadedInvoiceRecord[]): DateRange {
  let from: string | null = null;
  let to: string | null = null;
  for (const record of records) {
    const epoch = new Date(record.issuedAtIso).getTime();
    if (from === null || epoch < new Date(from).getTime()) from = record.issuedAtIso;
    if (to === null || epoch > new Date(to).getTime()) to = record.issuedAtIso;
  }
  return { from, to };
}

/** Estado final verificado del salón demo (deliverable del resumen de sub-9). */
interface SeedSummary {
  salon: DemoSalonRef;
  customers: number;
  appointments: DateRange & { count: number };
  sales: DateRange & { count: number };
  invoices: DateRange & { count: number; series: string; chainResult: number };
  /** Nº de salones ajenos verificados INTACTOS (sin cambios) tras el seed. */
  otherSalonsUntouched: number;
}

/**
 * Construye el resumen de verificación releyendo la BD: recuentos y rango de fechas de
 * clientes/citas/ventas, la cadena de facturas (recuento + `verifyHashChain` + rango) y
 * la confirmación de que los salones ajenos siguen intactos. Las lecturas son
 * independientes ⇒ se lanzan en paralelo. Si algún salón ajeno cambió,
 * `assertOtherSalonsUntouched` lanza y aborta el seed (fail-loud).
 */
async function buildSeedSummary(
  ctx: SeedContext,
  salon: DemoSalonRef,
  otherSalonsBaseline: ReadonlyMap<string, SalonFingerprint>,
): Promise<SeedSummary> {
  const { client, salonId } = ctx;
  const series = resolveInvoiceSeries();

  const [
    customers,
    appointmentsCount,
    salesCount,
    appointmentsRange,
    salesRange,
    invoiceRecords,
    otherSalonsUntouched,
  ] = await Promise.all([
    countRows(client, "customers", { salon_id: salonId }),
    countRows(client, "appointments", { salon_id: salonId }),
    countRows(client, "pos_sales", { salon_id: salonId }),
    salonColumnRange(client, "appointments", salonId, "starts_at"),
    salonColumnRange(client, "pos_sales", salonId, "sold_at"),
    loadInvoiceChainRecords(client, salonId, series),
    assertOtherSalonsUntouched(client, salonId, otherSalonsBaseline),
  ]);

  const chainResult = invoiceRecords.length > 0 ? verifyHashChain(invoiceRecords) : -1;
  const invoicesRange = invoiceDateRange(invoiceRecords);

  return {
    salon,
    customers,
    appointments: { count: appointmentsCount, ...appointmentsRange },
    sales: { count: salesCount, ...salesRange },
    invoices: {
      count: invoiceRecords.length,
      series,
      from: invoicesRange.from,
      to: invoicesRange.to,
      chainResult,
    },
    otherSalonsUntouched,
  };
}

/** Formatea un rango temporal (ISO) como `YYYY-MM-DD … YYYY-MM-DD` en la zona del salón. */
function formatDateRange(range: DateRange, timezone: string): string {
  if (range.from === null || range.to === null) return "(sin datos)";
  const fromDay = localDateInZone(timezone, new Date(range.from));
  const toDay = localDateInZone(timezone, new Date(range.to));
  return fromDay === toDay ? fromDay : `${fromDay} … ${toDay}`;
}

/**
 * Imprime el RESUMEN DE VERIFICACIÓN final (sub-9): identidad del salón demo,
 * credenciales del owner (ID de acceso + contraseña si el seed la fijó), recuentos y
 * rango de fechas de clientes/citas/ventas/facturas, el resultado de `verifyHashChain`
 * (debe ser -1 ⇒ cadena de huella íntegra) y la confirmación de que ningún salón
 * existente fue modificado.
 */
function logSeedSummary(
  summary: SeedSummary,
  owner: OwnerCredentials | null,
  timezone: string,
): void {
  const rule = "─".repeat(66);
  const chainOk = summary.invoices.chainResult === -1;

  log("summary", rule);
  log("summary", "RESUMEN DE VERIFICACIÓN DEL SALÓN DEMO (sub-9)");
  log("summary", rule);
  log(
    "summary",
    `Salón demo     · "${summary.salon.slug}" (${summary.salon.id})` +
      `${summary.salon.created ? " · CREADO en esta ejecución" : " · reutilizado (idempotente)"}`,
  );

  if (owner !== null) {
    log("summary", `Owner acceso   · ID "${owner.accessId}" · login ${owner.email}`);
    log(
      "summary",
      owner.password !== null
        ? `Owner clave    · ${owner.password}  (guárdala: no se puede recuperar)`
        : "Owner clave    · (sin cambios; el usuario ya existía) — usa --reset-password para fijarla",
    );
  } else {
    log("summary", "Owner          · (no resuelto en esta ejecución)");
  }

  log("summary", `Clientes       · ${summary.customers}`);
  log(
    "summary",
    `Citas          · ${summary.appointments.count} · ` +
      formatDateRange(summary.appointments, timezone),
  );
  log(
    "summary",
    `Ventas (TPV)   · ${summary.sales.count} · ${formatDateRange(summary.sales, timezone)}`,
  );
  log(
    "summary",
    `Facturas       · ${summary.invoices.count} en serie "${summary.invoices.series}" · ` +
      formatDateRange(summary.invoices, timezone),
  );
  log(
    "summary",
    `Cadena huella  · verifyHashChain === ${summary.invoices.chainResult} ` +
      `${chainOk ? "(-1 ⇒ cadena ÍNTEGRA ✓)" : "(¡CORRUPTA! ✗)"}`,
  );
  log(
    "summary",
    `Salones ajenos · ${summary.otherSalonsUntouched} verificado(s) INTACTO(s) · ` +
      `salón real "${FORBIDDEN_SALON_SLUG}" jamás modificado`,
  );
  log("summary", rule);
}

// ───────────────────────────────────────────────────────────────────────────
// Configuración y orquestación.
// ───────────────────────────────────────────────────────────────────────────

function readConfig(argv: readonly string[]): SeedConfig {
  const flags = new Set(argv);
  const trimmedOr = (envValue: string | undefined, fallback: string): string => {
    const value = envValue?.trim();
    return value && value.length > 0 ? value : fallback;
  };
  /** Color hex del entorno o el por defecto; valida forma `#rrggbb` y falla claro. */
  const colorOr = (envValue: string | undefined, fallback: string, label: string): string => {
    const value = trimmedOr(envValue, fallback);
    if (!isValidHexColor(value)) {
      throw new Error(`${label} debe ser un color hex #RRGGBB (recibido: "${value}").`);
    }
    return value;
  };

  return {
    slug: trimmedOr(process.env.SEED_DEMO_SALON_SLUG, DEFAULT_DEMO_SLUG),
    name: trimmedOr(process.env.SEED_DEMO_SALON_NAME, DEFAULT_DEMO_NAME),
    timezone: trimmedOr(process.env.SEED_DEMO_SALON_TZ, "Europe/Madrid"),
    taxId: trimmedOr(process.env.SEED_DEMO_SALON_TAX_ID, DEFAULT_DEMO_TAX_ID),
    legalName: trimmedOr(process.env.SEED_DEMO_SALON_LEGAL_NAME, DEFAULT_DEMO_LEGAL_NAME),
    fiscalAddress: process.env.SEED_DEMO_SALON_FISCAL_ADDRESS?.trim() || null,
    address: trimmedOr(process.env.SEED_DEMO_SALON_ADDRESS, DEFAULT_DEMO_ADDRESS),
    primaryColor: colorOr(
      process.env.SEED_DEMO_PRIMARY_COLOR,
      DEFAULT_PRIMARY_BRAND_COLOR,
      "El color de marca principal",
    ),
    secondaryColor: colorOr(
      process.env.SEED_DEMO_SECONDARY_COLOR,
      DEFAULT_SECONDARY_BRAND_COLOR,
      "El color de marca secundario",
    ),
    ownerAccessId: trimmedOr(process.env.SEED_DEMO_OWNER_ID, DEFAULT_OWNER_ACCESS_ID),
    ownerPassword: process.env.SEED_DEMO_OWNER_PASSWORD?.trim() || null,
    resetOwnerPassword:
      flags.has("--reset-password") || process.env.SEED_DEMO_RESET_PASSWORD === "1",
    dryRun: flags.has("--dry-run") || process.env.SEED_DRY_RUN === "1",
    checkOnly: flags.has("--check") || process.env.SEED_CHECK === "1",
    customerCount: resolveCustomerCount(process.env.SEED_DEMO_CUSTOMER_COUNT),
  };
}

function log(scope: string, message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[seed-demo:${scope}] ${message}`);
}

/**
 * Muestra las credenciales del owner demo. La contraseña se imprime SOLO cuando el
 * seed la ha fijado (alta o regeneración): es una credencial de demo pensada para
 * USARSE, no un secreto de infraestructura (a diferencia de la service-role key, que
 * jamás se imprime). Si el usuario ya existía y no se regeneró, no se puede recuperar.
 */
function logOwnerCredentials(owner: OwnerCredentials): void {
  log("owner", "Credenciales del owner demo (acceso al panel):");
  log("owner", `    ID de acceso : ${owner.accessId}`);
  log("owner", `    Email login  : ${owner.email}`);
  if (owner.password !== null) {
    log("owner", `    Contraseña   : ${owner.password}`);
    log("owner", "    (guárdala: no se puede recuperar; regénérala con --reset-password)");
  } else {
    log(
      "owner",
      "    Contraseña   : (sin cambios; el usuario ya existía) — usa --reset-password para fijarla.",
    );
  }
}

function logBanner(config: SeedConfig): void {
  const modes = [config.dryRun ? "DRY-RUN" : null, config.checkOnly ? "CHECK" : null]
    .filter(Boolean)
    .join(" · ");
  log(
    "init",
    `Slug objetivo: "${config.slug}" · TZ: ${config.timezone}${modes ? ` · ${modes}` : ""}`,
  );
  log(
    "guard",
    `Salón REAL vetado permanentemente: "${FORBIDDEN_SALON_SLUG}" (${FORBIDDEN_SALON_ID}). ` +
      "El seed jamás lo modifica.",
  );
}

export async function main(argv: readonly string[] = []): Promise<void> {
  loadEnvLocal();
  const config = readConfig(argv);

  logBanner(config);
  assertNotProductionSalon({ slug: config.slug });

  // Falla temprano si faltan credenciales, sin exponer su valor.
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const client = createAdminClient(); // No abre conexión hasta la primera query.

  if (config.checkOnly) {
    const sampleId = newSalonId();
    log("check", `Entorno y credenciales OK. UUID de salón de ejemplo: ${sampleId}.`);
    log("check", "Modo --check: no se toca la base de datos. Fin.");
    return;
  }

  const salon = await getOrCreateDemoSalon(client, config);
  log(
    "salon",
    `${salon.created ? "Creado" : "Reutilizado"} salón demo "${salon.slug}" (${salon.id}).`,
  );

  // Reafirma la guarda con el id ya resuelto antes de delegar en el dominio.
  assertNotProductionSalon({ id: salon.id, slug: salon.slug });

  // Línea base para la verificación final (sub-9): fotografía de los salones AJENOS
  // (incluido el salón real) ANTES de sembrar nada de dominio, para confirmar al
  // terminar que ninguno cambió. Solo en ejecución real (en dry-run no se escribe).
  const otherSalonsBaseline = config.dryRun
    ? null
    : await snapshotOtherSalons(client, salon.id);

  const ctx: SeedContext = {
    client,
    salonId: salon.id,
    slug: salon.slug,
    dryRun: config.dryRun,
    now: new Date(),
    customerCount: config.customerCount,
  };

  // Configuración base del salón demo (sub-3): owner + membership + add-ons + marca.
  const owner = await seedSalonCoreConfig(ctx, config);

  await seedDomainData(ctx);

  if (owner !== null) {
    logOwnerCredentials(owner);
  }

  // Verificación y resumen final (sub-9): relee la BD para imprimir el estado del
  // salón demo (recuentos + rango de fechas + verifyHashChain === -1) y CONFIRMAR que
  // ningún salón existente fue modificado. Solo en ejecución real (en dry-run no se
  // ha escrito nada, así que un resumen reflejaría el estado previo y confundiría).
  if (!config.dryRun && otherSalonsBaseline !== null) {
    const summary = await buildSeedSummary(ctx, salon, otherSalonsBaseline);
    logSeedSummary(summary, owner, config.timezone);
  }

  log(
    "done",
    config.dryRun
      ? "Seed demo (DRY-RUN) completado: no se ha escrito en la base de datos."
      : "Seed demo completado y verificado: salón demo, configuración, clientes, citas, " +
          "ventas y facturas sembrados · cadena de huella íntegra · ningún salón existente modificado.",
  );
}

// Ejecuta solo cuando se invoca directamente (no al importarse desde un test).
if (require.main === module) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`\n✖ [seed-demo] ${message}`);
    process.exitCode = 1;
  });
}
