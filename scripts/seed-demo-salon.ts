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

import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { idToEmail } from "@/lib/auth/id-email";
import {
  SALON_LOGOS_BUCKET,
  buildLogoObjectPath,
  isValidHexColor,
} from "@/lib/salon-branding/branding";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json, SalonFeature } from "@/types/database";

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

  // TODO(subtarea clientes):       await seedCustomers(ctx);
  // TODO(subtarea citas):          await seedAppointments(ctx);
  // TODO(subtarea tickets/ventas): await seedSales(ctx);
  // TODO(subtarea facturas):       await seedInvoices(ctx);
  // TODO(subtarea fidelización):   await seedLoyaltyHistory(ctx);

  log("domain", "Sin pasos de dominio en el scaffold (pendientes de subtareas).");
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

  const ctx: SeedContext = {
    client,
    salonId: salon.id,
    slug: salon.slug,
    dryRun: config.dryRun,
    now: new Date(),
  };

  // Configuración base del salón demo (sub-3): owner + membership + add-ons + marca.
  const owner = await seedSalonCoreConfig(ctx, config);

  await seedDomainData(ctx);

  if (owner !== null) {
    logOwnerCredentials(owner);
  }

  log(
    "done",
    "Seed demo completado: salón, owner, membership, add-ons y marca listos. " +
      "Los datos de dominio (clientes, citas, ventas…) se añaden en subtareas posteriores.",
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
