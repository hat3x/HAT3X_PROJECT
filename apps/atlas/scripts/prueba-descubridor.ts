//
// Monta en la base LOCAL un «Kairos» de mentira para recorrer a mano el camino
// entero del descubridor. Solo para desarrollo: la aplicación no lo usa.
//
//   npx tsx scripts/prueba-descubridor.ts            # lo monta
//   select atlas_disparar_descubridor();             # dispara una pasada
//   npx tsx scripts/prueba-descubridor.ts --sembrar  # 4 pasadas, para ver la pantalla
//   npx tsx scripts/prueba-descubridor.ts --sesion   # cookie de propietario, con 2FA
//   npx tsx scripts/prueba-descubridor.ts --limpiar  # retira el lado Kairos
//
// El Supabase local hace las dos partes a la vez: es el Atlas que pregunta y el
// Kairos que responde. Lo único falso es que sean el mismo — la RPC, PostgREST,
// el revoke y el descifrado de la credencial son los de verdad.
//
// Existe porque esta prueba encontró lo que 517 tests no podían ver: la ruta
// estaba fuera de RUTAS_PUBLICAS, y el guardia devolvía a pg_net un 307 en vez
// de dejarla pasar. Los tests llaman a `POST` directamente y se saltan el
// middleware; solo el camino completo lo enseña.
//
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { cifrar } from "../src/lib/cripto/cifrado";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function entorno(nombre: string): string {
  const linea = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${nombre}=`));
  if (!linea) throw new Error(`Falta ${nombre} en .env.local`);
  return linea.slice(nombre.length + 1).trim();
}

function aBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

/**
 * Retira TODO lo que montan los tres modos de arriba.
 *
 * Deja la base como estaba, y no a medias: media limpieza es peor que ninguna
 * porque lo que queda parece de verdad. En concreto, la tabla `salons` vive en
 * el esquema `public` de Atlas, así que olvidarla mete una tabla ajena en el
 * siguiente `npm run tipos`.
 *
 * Borra `descubrimientos` ENTERA. En una base de desarrollo lo único que hay
 * ahí son las pasadas que este script provocó, y distinguirlas una a una no
 * merece el riesgo de dejar una mentira en pantalla.
 */
async function limpiar() {
  const { createClient } = await import("@supabase/supabase-js");
  const pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  await pg.query("drop function if exists atlas_list_salons()");
  await pg.query("drop table if exists salons");
  // En cascada se lleva sus enlaces, credenciales, servicios y checks, que los
  // creó este mismo script o el descubridor corriendo contra él.
  await pg.query("delete from proyectos where slug = 'kairos'");
  await pg.query("delete from descubrimientos");

  const admin = createClient(
    entorno("NEXT_PUBLIC_SUPABASE_URL"),
    entorno("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
  const { data: lista } = await admin.auth.admin.listUsers();
  for (const u of lista?.users ?? []) {
    if (u.email === "mirar@atlas.test") {
      await pg.query("delete from perfiles where id = $1", [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const { rowCount } = await pg.query(
    "select tablename from pg_tables where schemaname = $1 and tablename = $2",
    ["public", "salons"]
  );
  console.log(
    rowCount === 0
      ? "Retirado: salons, la RPC, el proyecto kairos con lo suyo, las pasadas y el usuario de mirar."
      : "La tabla salons sigue ahí."
  );
  await pg.end();
}

/**
 * Cuatro pasadas de mentira para poder MIRAR la pantalla sin esperar cuatro
 * horas. Cubren los cuatro casos que se pintan distinto: sin cambios, una
 * pausa, un fallo con su motivo, y altas con reactivación.
 */
async function sembrar() {
  const pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  const ahora = Date.now();
  const haceHoras = (n: number) => new Date(ahora - n * 3600_000).toISOString();

  const filas: [boolean, string, number, number, number, string | null][] = [
    [true, haceHoras(0), 0, 0, 0, null],
    [true, haceHoras(1), 0, 1, 0, null],
    [false, haceHoras(2), 0, 0, 0, "Kairos respondió 404 a atlas_list_salons."],
    [true, haceHoras(3), 2, 0, 1, null],
  ];
  for (const f of filas) {
    await pg.query(
      `insert into descubrimientos (ok, ejecutado_en, altas, pausados, reactivados, error)
       values ($1,$2,$3,$4,$5,$6)`,
      f
    );
  }
  console.log(`${filas.length} pasadas de prueba escritas.`);
  await pg.end();
}

/**
 * Una sesión de propietario, con su segundo factor superado, impresa como
 * cabecera `Cookie`. Es la única forma de MIRAR una pantalla desde fuera: el
 * guardia exige TOTP y no hay manera de teclearlo a mano desde un script.
 *
 * El mecanismo es el de `scripts/humo.mjs`, que ya lo resolvió.
 */
async function sesion() {
  const { createHmac } = await import("node:crypto");
  const { createClient } = await import("@supabase/supabase-js");
  const { createServerClient } = await import("@supabase/ssr");

  const api = entorno("NEXT_PUBLIC_SUPABASE_URL");
  const anon = entorno("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const servicio = entorno("SUPABASE_SERVICE_ROLE_KEY");
  const correo = "mirar@atlas.test";
  const contrasena = "contrasena-de-prueba";

  const deBase32 = (s: string) => {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const c of s.replace(/=+$/, "").toUpperCase()) {
      bits += abc.indexOf(c).toString(2).padStart(5, "0");
    }
    const bytes = bits.match(/.{8}/g) ?? [];
    return Buffer.from(bytes.map((b) => parseInt(b, 2)));
  };
  const totp = (semilla: string) => {
    const contador = Math.floor(Date.now() / 1000 / 30);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(contador / 2 ** 32), 0);
    buf.writeUInt32BE(contador >>> 0, 4);
    const h = createHmac("sha1", deBase32(semilla)).update(buf).digest();
    const d = h[h.length - 1]! & 0xf;
    const cod =
      ((h[d]! & 0x7f) << 24) | (h[d + 1]! << 16) | (h[d + 2]! << 8) | h[d + 3]!;
    return String(cod % 1_000_000).padStart(6, "0");
  };

  const admin = createClient(api, servicio, { auth: { persistSession: false } });
  const pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // Se rehace en cada llamada: un factor TOTP a medias de una ejecución
  // anterior deja la sesión atascada en /verificar sin decir por qué.
  const { data: lista } = await admin.auth.admin.listUsers();
  for (const u of lista?.users ?? []) {
    if (u.email === correo) {
      await pg.query(`delete from perfiles where id = $1`, [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const alta = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
  });
  if (alta.error) throw alta.error;
  await pg.query(
    `insert into perfiles (id, nombre, es_propietario) values ($1,'Mirar',true)`,
    [alta.data.user.id]
  );

  const galletas = new Map<string, string>();
  const sb = createServerClient(api, anon, {
    cookies: {
      getAll: () => [...galletas].map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach(({ name, value }) => galletas.set(name, value)),
    },
  });

  const entrada = await sb.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });
  if (entrada.error) throw entrada.error;

  const inscrito = await sb.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "mirar",
  });
  if (inscrito.error) throw inscrito.error;
  const reto = await sb.auth.mfa.challenge({ factorId: inscrito.data.id });
  if (reto.error) throw reto.error;
  const verificado = await sb.auth.mfa.verify({
    factorId: inscrito.data.id,
    challengeId: reto.data.id,
    code: totp(inscrito.data.totp.secret),
  });
  if (verificado.error) throw verificado.error;

  console.log([...galletas].map(([n, v]) => `${n}=${v}`).join("; "));
  await pg.end();
}

async function main() {
  const maestra = entorno("ATLAS_MASTER_KEY");
  const servicio = entorno("SUPABASE_SERVICE_ROLE_KEY");
  const urlSupabase = entorno("NEXT_PUBLIC_SUPABASE_URL");

  const pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // ---- el lado «Kairos»: su tabla y su RPC ----
  await pg.query(`
    create table if not exists salons (
      id       uuid primary key default gen_random_uuid(),
      name     text not null,
      slug     text not null unique,
      sector   text not null,
      timezone text not null default 'Europe/Madrid',
      active   boolean not null default true,
      settings jsonb not null default '{}'
    )`);
  // RLS activado y sin políticas: nadie lee la tabla directamente. La RPC es la
  // única puerta, que es justo lo que interesa comprobar.
  await pg.query(`alter table salons enable row level security`);

  // El fichero tal cual se pegaría en Kairos, sin retocar.
  await pg.query(readFileSync("supabase/kairos/atlas_list_salons.sql", "utf8"));

  await pg.query(`delete from salons`);
  await pg.query(`
    insert into salons (name, slug, sector, active) values
      ('Salón Uno',       'salon-uno',      'peluqueria',  true),
      ('Demo Peluquería', 'demo-peluqueria','peluqueria',  true),
      ('Se Dio De Baja',  'se-dio-de-baja', 'odontologia', false)`);

  // ---- el lado «Atlas»: proyecto, enlace y llavero ----
  await pg.query(`delete from proyectos where slug = 'kairos'`);
  const {
    rows: [proyecto],
  } = await pg.query(
    `insert into proyectos (nombre, slug, tipo, estado)
     values ('Kairos','kairos','producto-propio','produccion') returning id`
  );

  await pg.query(
    `insert into enlaces (proyecto_id, etiqueta, url, tipo)
     values ($1,'Supabase',$2,'supabase')`,
    [proyecto.id, urlSupabase]
  );

  const s = await cifrar(servicio, maestra);
  await pg.query(
    `insert into credenciales (proveedor, etiqueta, proyecto_id,
                               secreto_cifrado, iv, tag, prefijo)
     values ('Supabase','service_role',$1,$2,$3,$4,'local ••••prueba')`,
    [proyecto.id, aBytea(s.cifrado), aBytea(s.iv), aBytea(s.tag)]
  );

  console.log("Kairos de mentira listo.");
  console.log(`  proyecto: ${proyecto.id}`);
  console.log(`  censo:    3 salones, 2 activos (uno de ellos demo)`);
  console.log(`  enlace:   ${urlSupabase}`);
  await pg.end();
}

const MODOS = { "--limpiar": limpiar, "--sembrar": sembrar, "--sesion": sesion };

const bandera = process.argv.find((a): a is keyof typeof MODOS => a in MODOS);
const tarea = bandera ? MODOS[bandera] : main;

tarea().catch((e) => {
  console.error(e);
  process.exit(1);
});
