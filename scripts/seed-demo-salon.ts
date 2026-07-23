/**
 * seed-demo-salon.ts — Scaffold del *seed* de datos demo de salón (sub-2).
 * ---------------------------------------------------------------------------
 * Crea (o reutiliza) un salón demo AISLADO, con su propio `salon_id`, sobre el
 * que las subtareas posteriores sembrarán clientes, citas, tickets, facturas y
 * fidelización de forma **additiva e idempotente** (ver `docs/seed-demo-contracts.md`).
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
 *   npm run seed:demo               # crea/reutiliza el salón demo
 *   npm run seed:demo -- --check    # valida entorno y credenciales SIN tocar la BD
 *   npm run seed:demo -- --dry-run  # simula sin escribir
 *
 * Variables de entorno opcionales (con valores por defecto seguros):
 *   SEED_DEMO_SALON_SLUG   (def. "salon-demo")   — NUNCA puede ser "denueveanueve"
 *   SEED_DEMO_SALON_NAME   (def. "Salón Demo (HAT3X)")
 *   SEED_DEMO_SALON_TZ     (def. "Europe/Madrid")
 *   SEED_DEMO_SALON_TAX_ID / _LEGAL_NAME / _FISCAL_ADDRESS  — datos fiscales demo
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

// ───────────────────────────────────────────────────────────────────────────
// Constantes de seguridad — el salón REAL jamás debe tocarse.
// ───────────────────────────────────────────────────────────────────────────

/** UUID del salón de producción "De Nueve a Nueve". VETADO para el seed demo. */
export const FORBIDDEN_SALON_ID = "abeef620-4fe3-4b29-a17b-6c51a8284f8f";
/** Slug del salón de producción. VETADO para el seed demo. */
export const FORBIDDEN_SALON_SLUG = "denueveanueve";

/** Slug por defecto del salón demo aislado. */
export const DEFAULT_DEMO_SLUG = "salon-demo";
/** Marca en `salons.settings` que identifica a un salón creado por este seed. */
export const DEMO_MARKER_KEY = "seed_demo";

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
    fiscal_address: config.fiscalAddress,
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

  return {
    slug: trimmedOr(process.env.SEED_DEMO_SALON_SLUG, DEFAULT_DEMO_SLUG),
    name: trimmedOr(process.env.SEED_DEMO_SALON_NAME, "Salón Demo (HAT3X)"),
    timezone: trimmedOr(process.env.SEED_DEMO_SALON_TZ, "Europe/Madrid"),
    taxId: trimmedOr(process.env.SEED_DEMO_SALON_TAX_ID, "B00000000"),
    legalName: trimmedOr(process.env.SEED_DEMO_SALON_LEGAL_NAME, "Salón Demo SL"),
    fiscalAddress: process.env.SEED_DEMO_SALON_FISCAL_ADDRESS?.trim() || null,
    dryRun: flags.has("--dry-run") || process.env.SEED_DRY_RUN === "1",
    checkOnly: flags.has("--check") || process.env.SEED_CHECK === "1",
  };
}

function log(scope: string, message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[seed-demo:${scope}] ${message}`);
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

  await seedDomainData(ctx);

  log(
    "done",
    "Seed demo (scaffold) completado. Los datos de dominio se añadirán en subtareas posteriores.",
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
