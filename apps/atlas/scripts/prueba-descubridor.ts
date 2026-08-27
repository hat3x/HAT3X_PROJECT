//
// Monta en la base LOCAL un «Kairos» de mentira para recorrer a mano el camino
// entero del descubridor. Solo para desarrollo: la aplicación no lo usa.
//
//   npx tsx scripts/prueba-descubridor.ts            # lo monta
//   select atlas_disparar_descubridor();             # dispara una pasada
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
 * Retira el lado «Kairos». La tabla vive en el esquema `public` de Atlas, así
 * que dejarla ahí contaminaría el siguiente `npm run tipos` con una tabla que
 * no es de Atlas. Lo que se queda: el proyecto, el enlace, la credencial y las
 * pasadas ya registradas, que sí son datos legítimos de Atlas.
 */
async function limpiar() {
  const pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  await pg.query("drop function if exists atlas_list_salons()");
  await pg.query("drop table if exists salons");
  const { rowCount } = await pg.query(
    "select tablename from pg_tables where schemaname = $1 and tablename = $2",
    ["public", "salons"]
  );
  console.log(
    rowCount === 0
      ? "Kairos de mentira retirado. El esquema de Atlas vuelve a estar limpio."
      : "La tabla salons sigue ahí."
  );
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

const tarea = process.argv.includes("--limpiar") ? limpiar : main;

tarea().catch((e) => {
  console.error(e);
  process.exit(1);
});
