// apps/atlas/scripts/migrar/fichajes.ts
//
// Vuelca el histórico de `apps/fichaje/data/fichaje.json` a `fichajes`, como
// lo que es: dato reconstruido, `origen='anadido'`, con nota de procedencia.
//
//   npx tsx scripts/migrar/fichajes.ts            # vuelca (idempotente)
//   npx tsx scripts/migrar/fichajes.ts --limpiar  # retira lo importado
//
// El usuario es el propietario. Si hubiera más de uno (o ninguno), hay que
// decir cuál con --usuario <uuid>: adivinar a quién atribuir horas es peor
// que parar.
//
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const NOTA = "[importado de apps/fichaje]";
const RUTA = resolve(__dirname, "../../../fichaje/data/fichaje.json");
const TOPE_MS = 16 * 3_600_000;
const MINIMO_MS = 60_000;

export type FichajeViejo = { entrada: string; salida: string | null; cliente_principal: string | null };

export type FilaNueva = { inicio: string; fin: string; clienteId: string | null; clienteSlug: string | null };

export function convertir(
  viejos: FichajeViejo[],
  clientes: Map<string, string>
): { filas: FilaNueva[]; sinCliente: string[]; descartados: number } {
  const filas: FilaNueva[] = [];
  const sinCliente = new Set<string>();
  let descartados = 0;
  for (const v of viejos) {
    if (!v.salida) {
      descartados++; // un abierto de la app vieja no se puede reconstruir
      continue;
    }
    let ini = Date.parse(v.entrada);
    const fin = Date.parse(v.salida);
    if (Number.isNaN(ini) || Number.isNaN(fin) || fin - ini < MINIMO_MS) {
      descartados++;
      continue;
    }
    const slug = v.cliente_principal;
    const clienteId = slug ? (clientes.get(slug) ?? null) : null;
    if (slug && clienteId === null) sinCliente.add(slug);
    // Un tramo de 20 horas no cabe en la regla del tope. Se parte, sin
    // perder ni un minuto: la suma es la misma, el histórico no se inventa.
    while (fin - ini > TOPE_MS) {
      filas.push({ inicio: new Date(ini).toISOString(), fin: new Date(ini + TOPE_MS).toISOString(), clienteId, clienteSlug: slug });
      ini += TOPE_MS;
    }
    // El resto de la partición pasa por la misma regla que un tramo entero:
    // 16 h y 30 s deja un resto de 30 s, y eso no es trabajo, es ruido. Se
    // descarta en vez de insertar una fila de menos de un minuto.
    if (fin - ini < MINIMO_MS) {
      descartados++;
    } else {
      filas.push({ inicio: new Date(ini).toISOString(), fin: new Date(fin).toISOString(), clienteId, clienteSlug: slug });
    }
  }
  return { filas, sinCliente: [...sinCliente], descartados };
}

async function main() {
  const pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  try {
    if (process.argv.includes("--limpiar")) {
      // `nota` sola no basta de guarda: alguien podría escribir a mano esa
      // misma frase en la nota de un fichaje real. `origen = 'anadido'` es la
      // marca que solo este script pone, así que solo eso es lo que retira.
      const r = await pg.query(`DELETE FROM fichajes WHERE nota = $1 AND origen = 'anadido'`, [NOTA]);
      console.log(`Retirados ${r.rowCount} tramos importados.`);
      return;
    }

    const i = process.argv.indexOf("--usuario");
    let usuario = i >= 0 ? process.argv[i + 1] : null;
    if (!usuario) {
      const { rows } = await pg.query(`SELECT id FROM perfiles WHERE es_propietario`);
      if (rows.length !== 1) {
        throw new Error(`Hay ${rows.length} propietarios; di cuál con --usuario <uuid>.`);
      }
      usuario = rows[0].id;
    }

    const datos = JSON.parse(readFileSync(RUTA, "utf8")) as { fichajes: FichajeViejo[] };
    const { rows: cl } = await pg.query(`SELECT id, slug FROM clientes`);
    const clientes = new Map<string, string>(cl.map((c) => [c.slug, c.id]));
    const { filas, sinCliente, descartados } = convertir(datos.fichajes, clientes);

    // Idempotente por (usuario, inicio): volver a ejecutarlo no duplica.
    let nuevos = 0;
    for (const f of filas) {
      const r = await pg.query(
        `INSERT INTO fichajes (usuario_id, cliente_id, inicio, fin, origen, nota)
         SELECT $1, $2, $3, $4, 'anadido', $5
         WHERE NOT EXISTS (SELECT 1 FROM fichajes WHERE usuario_id = $1 AND inicio = $3)`,
        [usuario, f.clienteId, f.inicio, f.fin, NOTA]
      );
      nuevos += r.rowCount ?? 0;
    }
    console.log(`Importados ${nuevos} tramos nuevos (${filas.length} en total, ${descartados} descartados).`);
    if (sinCliente.length > 0) {
      console.log(`Sin cliente en Atlas (quedan sin asignar): ${sinCliente.join(", ")}`);
    }
    console.log("Para retirarlo: npx tsx scripts/migrar/fichajes.ts --limpiar");
  } finally {
    await pg.end();
  }
}

// Ejecuta solo cuando se invoca directamente (no al importarse desde un test).
// El resto de `scripts/migrar/` no necesitaba esta guarda porque nada importa
// sus funciones puras desde el propio script; aquí sí (el test importa
// `convertir` de este mismo fichero), así que hace falta distinguir «módulo
// cargado» de «script lanzado». `seed-demo-salon.ts`, con el mismo tsconfig
// ESM y el mismo Vitest en este monorepo, usa esta misma guarda.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
