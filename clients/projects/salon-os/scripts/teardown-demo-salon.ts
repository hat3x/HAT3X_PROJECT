/**
 * teardown-demo-salon.ts — *Teardown* TOTAL e idempotente del salón demo (sub-10).
 * ---------------------------------------------------------------------------
 * Contrapartida destructiva del seed (`seed-demo-salon.ts`): BORRA por completo el
 * salón demo AISLADO ("Bella Studio", slug `demo`) y TODO lo que cuelga de él por
 * `salon_id` — clientes, citas, tickets/ventas, pagos, FACTURAS, fidelización,
 * marca, membership y add-ons — dejando la base de datos en un estado limpio, listo
 * para que `npm run seed:demo` la regenere desde cero.
 *
 * EL RETO: FACTURAS INMUTABLES (Veri*factu)
 * -----------------------------------------
 * `public.pos_invoices` es un registro fiscal INMUTABLE (RD 1007/2023). Su
 * inmutabilidad se refuerza a nivel de MOTOR con el trigger
 * `trg_pos_invoices_immutable` (BEFORE UPDATE OR DELETE), que aborta cualquier
 * borrado incluso para `service_role` y funciones `SECURITY DEFINER` — una barrera
 * que la RLS por sí sola no ofrece (ver `20260714100000_verifactu_invoices.sql`).
 * Como todas las tablas hijas llevan `salon_id … references salons(id) ON DELETE
 * CASCADE`, borrar la fila del salón dispararía el borrado en cascada de sus
 * facturas… que el trigger BLOQUEA. Por eso el borrado en cascada de un salón con
 * facturas está, por diseño, prohibido (la app usa soft-delete: `active = false`).
 *
 * Un TEARDOWN de datos DEMO es la excepción legítima a esa retención. La solución:
 * DESACTIVAR temporalmente el trigger, borrar el salón (la cascada arrastra las
 * facturas y el resto), y REACTIVARLO — todo DENTRO DE UNA TRANSACCIÓN, de modo que:
 *   · si algo falla, el `ROLLBACK` revierte también el `DISABLE TRIGGER` (es
 *     transaccional en Postgres) y la inmutabilidad queda intacta;
 *   · si todo va bien, el `ENABLE TRIGGER` restaura la barrera antes del `COMMIT`.
 * Un `finally` re-`ENABLE`a el trigger de forma idempotente pase lo que pase, y una
 * aserción post-commit comprueba en `pg_trigger` que quedó habilitado. La
 * inmutabilidad fiscal JAMÁS se queda desactivada tras este script.
 *
 * DOS CREDENCIALES, DOS PLANOS
 * ----------------------------
 * `DISABLE TRIGGER` es DDL: PostgREST / la service-role KEY (un JWT para las APIs
 * HTTP de Supabase) NO pueden ejecutarlo. Hace falta una conexión Postgres DIRECTA
 * con el rol dueño de la tabla. Por eso el teardown usa:
 *   1. `SUPABASE_DB_URL` — cadena de conexión directa (rol `postgres`, dueño de las
 *      tablas ⇒ puede togglear el trigger y saltarse la RLS). SOLO para la
 *      transacción trigger-toggle + `DELETE FROM salons` (cascada).
 *   2. `SUPABASE_SERVICE_ROLE_KEY` — para lo que vive FUERA de Postgres: borrar los
 *      BYTES del logo en Storage (bucket `salon-logos`) y el usuario auth del owner
 *      (`auth.admin.deleteUser`). Reutiliza `createAdminClient()` de la app.
 *
 * GARANTÍAS (mismas guardas que el seed — importadas, no reimplementadas)
 * ----------------------------------------------------------------------
 *  1. Es IMPOSIBLE tocar el salón REAL `denueveanueve`
 *     (`abeef620-4fe3-4b29-a17b-6c51a8284f8f`): la guarda maestra
 *     `assertNotProductionSalon` aborta por id y por slug, y el propio `DELETE`
 *     lleva la guarda re-afirmada EN SQL (`id <> <real>` + `settings.seed_demo`).
 *  2. Solo borra salones marcados por el seed (`settings.seed_demo === true`). Si el
 *     slug objetivo existe pero NO es demo → aborta (no toca algo que no creó él).
 *  3. Idempotente: si el salón ya no existe, es un no-op limpio (además intenta
 *     limpiar un usuario owner demo huérfano si quedara). Re-ejecutar no rompe.
 *
 * USO
 * ---
 *   npm run teardown:demo                 # borra el salón demo y todo lo suyo
 *   npm run teardown:demo:check           # valida entorno/credenciales y RESUELVE el
 *                                         #   salón demo SIN escribir (solo lectura)
 *   npm run teardown:demo -- --dry-run    # detalla el plan de borrado sin escribir
 *   npm run teardown:demo -- --keep-owner # borra el salón pero CONSERVA el usuario owner
 *
 * Variables de entorno:
 *   SUPABASE_DB_URL             (OBLIGATORIA para el borrado real) — cadena de conexión
 *                                Postgres directa. Panel: Project Settings › Database ›
 *                                Connection string (URI). No requerida en --check/--dry-run.
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (como el seed).
 *   SEED_DEMO_SALON_SLUG        (def. "demo")  — MISMO salón objetivo que el seed.
 *   SEED_DEMO_OWNER_ID          (def. "demo")  — ID de acceso del owner (→ email a borrar).
 */

import { Client as PgClient } from "pg";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { idToEmail } from "@/lib/auth/id-email";
import { SALON_LOGOS_BUCKET } from "@/lib/salon-branding/branding";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

import {
  DEFAULT_DEMO_SLUG,
  DEFAULT_OWNER_ACCESS_ID,
  DEMO_MARKER_KEY,
  FORBIDDEN_SALON_ID,
  FORBIDDEN_SALON_SLUG,
  SeedGuardError,
  assertNotProductionSalon,
  loadEnvLocal,
  requireEnv,
} from "./seed-demo-salon";

// ───────────────────────────────────────────────────────────────────────────
// Constantes del reto de inmutabilidad.
// ───────────────────────────────────────────────────────────────────────────

/** Tabla de facturación fiscal inmutable (Veri*factu). */
const INVOICES_TABLE = "public.pos_invoices";
/** Trigger que aborta UPDATE/DELETE sobre las facturas (barrera de inmutabilidad). */
const IMMUTABLE_TRIGGER = "trg_pos_invoices_immutable";

/**
 * Tablas hijas representativas de las que se informa el recuento en el plan de
 * borrado (--check/--dry-run). NO es la lista de borrado: el borrado lo hace la
 * CASCADA de `salons` (todas las tablas con `salon_id` cuelgan de ahí). Es solo
 * para que el operador vea qué volumen se va a arrastrar, con las facturas primero
 * (el caso que motiva el toggle del trigger).
 */
const REPORTED_CHILD_TABLES = [
  "pos_invoices",
  "pos_sales",
  "pos_payments",
  "appointments",
  "visits",
  "customers",
  "points_movements",
  "salon_members",
  "salon_features",
  "salon_branding",
] as const satisfies readonly (keyof Database["public"]["Tables"])[];

// ───────────────────────────────────────────────────────────────────────────
// Tipos.
// ───────────────────────────────────────────────────────────────────────────

interface TeardownConfig {
  /** Slug del salón demo a destruir (MISMO que el seed). Nunca `denueveanueve`. */
  slug: string;
  /** ID de acceso del owner demo → email `idToEmail(accessId)` a borrar de auth. */
  ownerAccessId: string;
  /** Simula el teardown detallando el plan, sin escribir. */
  dryRun: boolean;
  /** Valida entorno/credenciales y resuelve el salón SIN escribir. */
  checkOnly: boolean;
  /** Borra el salón pero conserva el usuario auth del owner. */
  keepOwnerUser: boolean;
}

/** Fila mínima del salón demo resuelto (con marca demo ya verificada). */
interface DemoSalonRow {
  id: string;
  slug: string;
  settings: Json;
}

// ───────────────────────────────────────────────────────────────────────────
// Guarda del marcador demo (misma semántica que el seed; el KEY se importa).
// ───────────────────────────────────────────────────────────────────────────

/** ¿El `settings` de un salón lleva la marca `seed_demo === true` del seed? */
function isDemoMarked(settings: Json): boolean {
  return (
    typeof settings === "object" &&
    settings !== null &&
    !Array.isArray(settings) &&
    (settings as Record<string, Json>)[DEMO_MARKER_KEY] === true
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Resolución idempotente del salón demo (solo lectura, service role).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resuelve el salón demo por slug con TODAS las guardas:
 *  - No existe → `null` (teardown = no-op idempotente).
 *  - Existe y es el salón real → aborta (guarda maestra por id/slug).
 *  - Existe pero NO está marcado como demo → aborta (no borra lo que no creó el seed).
 *  - Existe y es demo → devuelve la fila.
 */
async function resolveDemoSalon(
  client: SupabaseClient<Database>,
  slug: string,
): Promise<DemoSalonRow | null> {
  assertNotProductionSalon({ slug });

  const { data, error } = await client
    .from("salons")
    .select("id, slug, settings")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo consultar salons por slug "${slug}": ${error.message}`);
  }
  if (!data) {
    return null;
  }

  // Guarda maestra con el id ya conocido + marca demo obligatoria.
  assertNotProductionSalon({ id: data.id, slug: data.slug });
  if (!isDemoMarked(data.settings)) {
    throw new SeedGuardError(
      `El salón "${slug}" (${data.id}) existe pero NO está marcado como demo ` +
        `(settings.${DEMO_MARKER_KEY} !== true). El teardown se niega a borrar un salón ` +
        "que el seed no ha creado.",
    );
  }
  return { id: data.id, slug: data.slug, settings: data.settings };
}

/** Recuento (solo lectura) de filas hijas por tabla, para el plan de borrado. */
async function countChildren(
  client: SupabaseClient<Database>,
  salonId: string,
): Promise<Array<{ table: string; count: number | null }>> {
  const results: Array<{ table: string; count: number | null }> = [];
  for (const table of REPORTED_CHILD_TABLES) {
    const { count, error } = await client
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salonId);
    results.push({ table, count: error ? null : (count ?? 0) });
  }
  return results;
}

// ───────────────────────────────────────────────────────────────────────────
// Borrado transaccional del salón (conexión Postgres directa) — el núcleo.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Borra el salón y TODO lo suyo en una transacción, manejando la inmutabilidad de
 * las facturas: `DISABLE TRIGGER` → `DELETE FROM salons` (cascada) → `ENABLE TRIGGER`.
 * La guarda de seguridad va re-afirmada EN SQL (id vetado + marca demo), así que ni
 * un `salonId` erróneo podría borrar el salón real o uno que no sea demo.
 *
 * Devuelve el nº de filas de `salons` borradas (debe ser 1). Deja SIEMPRE el trigger
 * de inmutabilidad habilitado (rollback transaccional + `finally` + aserción).
 */
async function deleteSalonCascade(dbUrl: string, salonId: string): Promise<number> {
  assertNotProductionSalon({ id: salonId });

  const pg = new PgClient({
    connectionString: dbUrl,
    // Supabase exige TLS; para un script operativo aceptamos el cert gestionado.
    ssl: { rejectUnauthorized: false },
    // Cierra rápido si la conexión cuelga (evita procesos zombis en CI).
    connectionTimeoutMillis: 15_000,
    statement_timeout: 60_000,
  });

  await pg.connect();
  try {
    await pg.query("begin");

    // 1. Baja la barrera de inmutabilidad SOLO dentro de esta transacción.
    await pg.query(`alter table ${INVOICES_TABLE} disable trigger ${IMMUTABLE_TRIGGER}`);

    // 2. Borra el salón; la cascada arrastra facturas, ventas, citas, clientes,
    //    fidelización, marca, membership y add-ons. Guarda re-afirmada en SQL:
    //    id ≠ salón real  Y  settings.seed_demo = true.
    const del = await pg.query<{ id: string }>(
      `delete from public.salons
        where id = $1
          and id <> $2
          and (settings->>'${DEMO_MARKER_KEY}') = 'true'
        returning id`,
      [salonId, FORBIDDEN_SALON_ID],
    );

    if (del.rowCount !== 1) {
      // Ni 0 (no era demo / no existía / era el real) ni >1: aborta y revierte todo,
      // incluida la reactivación implícita del trigger por rollback.
      throw new SeedGuardError(
        `El DELETE guardado afectó a ${del.rowCount ?? 0} fila(s) de salons (se esperaba 1). ` +
          "Se aborta y revierte la transacción sin tocar nada (guarda de seguridad SQL).",
      );
    }

    // 3. Restaura la barrera de inmutabilidad ANTES del commit.
    await pg.query(`alter table ${INVOICES_TABLE} enable trigger ${IMMUTABLE_TRIGGER}`);

    await pg.query("commit");

    // 4. Aserción post-commit: el trigger DEBE estar habilitado ('D' = deshabilitado).
    const check = await pg.query<{ tgenabled: string }>(
      "select tgenabled from pg_trigger where tgname = $1",
      [IMMUTABLE_TRIGGER],
    );
    const state = check.rows[0]?.tgenabled;
    if (state === "D") {
      throw new Error(
        `¡ALERTA! El trigger de inmutabilidad ${IMMUTABLE_TRIGGER} quedó DESHABILITADO ` +
          "tras el commit. Reactívalo manualmente: " +
          `alter table ${INVOICES_TABLE} enable trigger ${IMMUTABLE_TRIGGER};`,
      );
    }

    return del.rowCount;
  } catch (error) {
    // Revierte la transacción (esto por sí solo ya reactiva el trigger).
    await pg.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    // Red de seguridad idempotente: pase lo que pase, deja el trigger habilitado.
    // (Sobre un trigger ya habilitado, ENABLE es un no-op inofensivo.)
    await pg
      .query(`alter table ${INVOICES_TABLE} enable trigger ${IMMUTABLE_TRIGGER}`)
      .catch(() => undefined);
    await pg.end().catch(() => undefined);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Limpieza fuera de Postgres (service role): Storage + usuario auth del owner.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Borra los BYTES del logo del salón en el bucket `salon-logos` (clave
 * `{salon_id}/…`). La fila `salon_branding` ya la arrastra la cascada; esto elimina
 * el objeto de Storage, que vive fuera de Postgres. Idempotente: si no hay objetos,
 * es un no-op. Devuelve el nº de objetos borrados.
 */
async function deleteLogoObjects(
  client: SupabaseClient<Database>,
  salonId: string,
): Promise<number> {
  const { data: objects, error: listError } = await client.storage
    .from(SALON_LOGOS_BUCKET)
    .list(salonId);
  if (listError) {
    throw new Error(
      `No se pudieron listar los logos del salón demo en ${SALON_LOGOS_BUCKET}: ${listError.message}`,
    );
  }
  if (!objects || objects.length === 0) {
    return 0;
  }

  const paths = objects.map((object) => `${salonId}/${object.name}`);
  const { error: removeError } = await client.storage.from(SALON_LOGOS_BUCKET).remove(paths);
  if (removeError) {
    throw new Error(
      `No se pudieron borrar los logos del salón demo en ${SALON_LOGOS_BUCKET}: ${removeError.message}`,
    );
  }
  return paths.length;
}

/**
 * Localiza un usuario de auth por email paginando `admin.listUsers` (supabase-js 2.49
 * no filtra por email en servidor). Espejo del helper del seed. Case-insensitive.
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
    if (users.length < perPage) break;
  }
  return null;
}

/** ¿El usuario lleva la marca `seed_demo` que le puso el seed (en app/user metadata)? */
function isSeedDemoUser(user: User): boolean {
  const appMeta = user.app_metadata as Record<string, unknown> | null | undefined;
  const userMeta = user.user_metadata as Record<string, unknown> | null | undefined;
  return appMeta?.seed_demo === true || userMeta?.seed_demo === true;
}

/** Resultado de la limpieza del usuario owner (para el reporte final). */
interface OwnerCleanup {
  email: string;
  userId: string | null;
  deleted: boolean;
  reason: string;
}

/**
 * Borra el usuario auth del owner demo, con guardas:
 *  - Debe existir y estar marcado `seed_demo` (si no, no se toca — podría ser un real).
 *  - No debe conservar membership en NINGÚN otro salón (si la tiene, se conserva el
 *    usuario para no romper otras pertenencias). Tras la cascada, su membership demo
 *    ya no existe, así que cualquier resto es de OTRO salón.
 * Idempotente: si no existe, informa y no falla.
 */
async function deleteOwnerUser(
  client: SupabaseClient<Database>,
  ownerAccessId: string,
): Promise<OwnerCleanup> {
  const email = idToEmail(ownerAccessId);
  const user = await findAuthUserByEmail(client, email);

  if (!user) {
    return { email, userId: null, deleted: false, reason: "no existe (ya limpio)" };
  }
  if (!isSeedDemoUser(user)) {
    return {
      email,
      userId: user.id,
      deleted: false,
      reason: "no lleva la marca seed_demo — se conserva por seguridad",
    };
  }

  // ¿Le queda pertenencia a algún otro salón tras la cascada? Si sí, no se borra.
  const { data: memberships, error: membershipError } = await client
    .from("salon_members")
    .select("salon_id")
    .eq("user_id", user.id);
  if (membershipError) {
    throw new Error(
      `No se pudieron comprobar las membership restantes del owner demo: ${membershipError.message}`,
    );
  }
  if (memberships && memberships.length > 0) {
    return {
      email,
      userId: user.id,
      deleted: false,
      reason: `conserva ${memberships.length} membership(s) en otro(s) salón(es) — se conserva`,
    };
  }

  const { error: deleteError } = await client.auth.admin.deleteUser(user.id);
  if (deleteError) {
    throw new Error(`No se pudo borrar el usuario owner demo: ${deleteError.message}`);
  }
  return { email, userId: user.id, deleted: true, reason: "borrado" };
}

// ───────────────────────────────────────────────────────────────────────────
// Configuración, logging y orquestación.
// ───────────────────────────────────────────────────────────────────────────

function readConfig(argv: readonly string[]): TeardownConfig {
  const flags = new Set(argv);
  const trimmedOr = (envValue: string | undefined, fallback: string): string => {
    const value = envValue?.trim();
    return value && value.length > 0 ? value : fallback;
  };
  return {
    slug: trimmedOr(process.env.SEED_DEMO_SALON_SLUG, DEFAULT_DEMO_SLUG),
    ownerAccessId: trimmedOr(process.env.SEED_DEMO_OWNER_ID, DEFAULT_OWNER_ACCESS_ID),
    dryRun: flags.has("--dry-run") || process.env.TEARDOWN_DRY_RUN === "1",
    checkOnly: flags.has("--check") || process.env.TEARDOWN_CHECK === "1",
    keepOwnerUser: flags.has("--keep-owner") || process.env.TEARDOWN_KEEP_OWNER === "1",
  };
}

function log(scope: string, message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[teardown-demo:${scope}] ${message}`);
}

function logBanner(config: TeardownConfig): void {
  const modes = [config.dryRun ? "DRY-RUN" : null, config.checkOnly ? "CHECK" : null]
    .filter(Boolean)
    .join(" · ");
  log(
    "init",
    `Salón objetivo a DESTRUIR: "${config.slug}" · owner "${config.ownerAccessId}"` +
      `${modes ? ` · ${modes}` : ""}`,
  );
  log(
    "guard",
    `Salón REAL vetado permanentemente: "${FORBIDDEN_SALON_SLUG}" (${FORBIDDEN_SALON_ID}). ` +
      "El teardown jamás lo borra.",
  );
}

function logDeletionPlan(
  salon: DemoSalonRow,
  children: Array<{ table: string; count: number | null }>,
  ownerEmail: string,
  logoCount: number,
): void {
  log("plan", `Salón demo: "${salon.slug}" (${salon.id}).`);
  for (const { table, count } of children) {
    const shown = count === null ? "?" : String(count);
    const note = table === "pos_invoices" ? "  ← inmutable: requiere DISABLE TRIGGER" : "";
    log("plan", `    ${table.padEnd(18)} ${shown.padStart(6)} fila(s)${note}`);
  }
  log("plan", `    logo(s) en Storage ${String(logoCount).padStart(6)} objeto(s)`);
  log("plan", `    usuario owner       ${ownerEmail}`);
}

export async function main(argv: readonly string[] = []): Promise<void> {
  loadEnvLocal();
  const config = readConfig(argv);

  logBanner(config);
  assertNotProductionSalon({ slug: config.slug });

  // Credenciales HTTP (service role) — necesarias siempre (resolución + Storage + auth).
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const client = createAdminClient();

  // 1. Resolver el salón demo (con todas las guardas). null ⇒ nada que borrar.
  const salon = await resolveDemoSalon(client, config.slug);
  if (!salon) {
    log("salon", `No existe ningún salón con slug "${config.slug}": nada que borrar.`);
    // Idempotencia: intenta limpiar un usuario owner demo huérfano si quedara.
    if (!config.keepOwnerUser && !config.dryRun && !config.checkOnly) {
      const owner = await deleteOwnerUser(client, config.ownerAccessId);
      log("owner", `Usuario owner ${owner.email}: ${owner.reason}.`);
    }
    log("done", "Teardown idempotente: el entorno ya estaba limpio.");
    return;
  }

  // 2. Reafirmar la guarda con el id resuelto antes de cualquier plan/escritura.
  assertNotProductionSalon({ id: salon.id, slug: salon.slug });

  // 3. Plan de borrado (recuentos + owner + logos), solo lectura.
  const children = await countChildren(client, salon.id);
  const ownerEmail = idToEmail(config.ownerAccessId);
  const { data: logoObjects } = await client.storage.from(SALON_LOGOS_BUCKET).list(salon.id);
  const logoCount = logoObjects?.length ?? 0;
  logDeletionPlan(salon, children, ownerEmail, logoCount);

  // 4. Modos sin escritura.
  if (config.checkOnly) {
    const hasDbUrl = Boolean(process.env.SUPABASE_DB_URL?.trim());
    log(
      "check",
      `Entorno OK. SUPABASE_DB_URL ${hasDbUrl ? "presente" : "AUSENTE"} ` +
        `(${hasDbUrl ? "listo para el borrado real" : "requerida para el borrado real"}).`,
    );
    log("check", "Modo --check: no se ha escrito nada. Fin.");
    return;
  }
  if (config.dryRun) {
    log("dry-run", "DRY-RUN: no se ha borrado nada. Ejecuta sin --dry-run para destruir.");
    return;
  }

  // 5. Borrado real. La transacción trigger-toggle exige conexión Postgres directa.
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) {
    throw new Error(
      "Falta SUPABASE_DB_URL (cadena de conexión Postgres directa). Es OBLIGATORIA para el " +
        "borrado real: desactivar el trigger de inmutabilidad de las facturas es DDL y la " +
        "service-role KEY (JWT de PostgREST) no puede ejecutarlo. Panel: Project Settings › " +
        "Database › Connection string (URI). Añádela a .env.local (ver .env.example).",
    );
  }

  const deleted = await deleteSalonCascade(dbUrl, salon.id);
  log(
    "salon",
    `Salón demo "${salon.slug}" (${salon.id}) borrado (${deleted} fila) con su cascada ` +
      `— facturas incluidas. Trigger ${IMMUTABLE_TRIGGER} reactivado y verificado.`,
  );

  // 6. Limpieza fuera de Postgres: logos en Storage + usuario owner.
  const removedLogos = await deleteLogoObjects(client, salon.id);
  log("storage", `Logos del salón demo borrados de ${SALON_LOGOS_BUCKET}: ${removedLogos} objeto(s).`);

  if (config.keepOwnerUser) {
    log("owner", "Se conserva el usuario owner demo (--keep-owner).");
  } else {
    const owner = await deleteOwnerUser(client, config.ownerAccessId);
    log("owner", `Usuario owner ${owner.email}: ${owner.reason}.`);
  }

  log(
    "done",
    "Teardown completado: salón demo y todo lo suyo eliminado. Regenéralo con `npm run seed:demo`.",
  );
}

// Ejecuta solo cuando se invoca directamente (no al importarse desde un test).
if (require.main === module) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`\n✖ [teardown-demo] ${message}`);
    process.exitCode = 1;
  });
}
