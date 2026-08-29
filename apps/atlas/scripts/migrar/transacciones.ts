// apps/atlas/scripts/migrar/transacciones.ts
//
// Vuelca `hat3x_transactions` de jarvis al libro de Atlas. Se ejecuta UNA vez:
//
//   npx tsx scripts/migrar/transacciones.ts --origen "postgresql://..."
//
// Contra la base real y no la local, se añade --destino con su propia cadena:
//
//   npx tsx scripts/migrar/transacciones.ts --origen "postgresql://..." \
//     --destino "postgresql://...produccion..."
//
// Sin --destino se usa la de Supabase local. Antes había que editar el
// fichero a mano para apuntar a la real, y no quedaba dicho en ninguna parte
// que hubiera que hacerlo — el primer volcado real habría ido, en silencio, a
// la base de desarrollo de quien lo ejecutara.
//
// Los ingresos NO se convierten en facturas: una transacción de jarvis no tiene
// serie, ni número, ni líneas, y fabricarle unos falsos metería en el libro
// facturas que nunca existieron. Se vuelcan solo los gastos, y los ingresos se
// listan por pantalla para decidir a mano cuáles merecen una factura
// registrada.
//
// Es la única pieza que toca datos históricos reales y NO es idempotente por
// sí sola: `hat3x_transactions` no lleva ningún identificador que sobreviva
// al volcado, así que no hay con qué comparar fila a fila para saltarse las
// que ya están. En vez de eso, se comprueba ANTES de insertar nada si ya hay
// gastos marcados 'Importado de jarvis' en las notas —la misma marca que este
// script escribe— y si los hay, se aborta sin tocar nada: ejecutarlo dos
// veces sin esta guarda duplicaría el histórico entero de gastos, en silencio.
import { Client } from "pg";

const DESTINO_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const MARCA_IMPORTADO = "Importado de jarvis";

/** Las categorías de jarvis no son las de Atlas. Esto las traduce. */
const CATEGORIA: Record<string, string> = {
  herramientas_saas: "herramientas",
  infraestructura: "infraestructura",
  marketing: "marketing",
  personal: "otro",
  cliente: "otro",
  otro: "otro",
};

async function main() {
  const i = process.argv.indexOf("--origen");
  const cadena = process.argv[i + 1];
  if (i === -1 || !cadena) {
    throw new Error("Falta --origen con la cadena de conexión de jarvis.");
  }

  const j = process.argv.indexOf("--destino");
  const cadenaDestino = j === -1 ? DESTINO_LOCAL : process.argv[j + 1];
  if (j !== -1 && !cadenaDestino) {
    throw new Error("--destino necesita una cadena de conexión detrás.");
  }

  const origen = new Client({ connectionString: cadena });
  const destino = new Client({ connectionString: cadenaDestino });
  await origen.connect();
  await destino.connect();

  // Idempotencia: `hat3x_transactions` no trae ningún id que sobreviva al
  // volcado, así que no hay fila a fila con qué comparar. En su lugar, se
  // comprueba la marca que este mismo script deja en `notas` ANTES de
  // insertar nada — relanzarlo sin esto duplicaría en silencio el histórico
  // entero de gastos.
  const { rows: yaImportados } = await destino.query(
    `SELECT count(*)::int AS n FROM gastos WHERE notas = $1`,
    [MARCA_IMPORTADO]
  );
  const n = yaImportados[0].n as number;
  if (n > 0) {
    await origen.end();
    await destino.end();
    throw new Error(
      `Ya hay ${n} gasto(s) marcados «${MARCA_IMPORTADO}» en el destino. ` +
        `No se ha insertado nada para no duplicar el histórico. Si el volcado ` +
        `anterior fue incompleto o erróneo, bórralos a mano en el destino ` +
        `(DELETE FROM gastos WHERE notas = '${MARCA_IMPORTADO}') y vuelve a ` +
        `ejecutar este script.`
    );
  }

  const { rows } = await origen.query(
    `SELECT type, amount, description, category, date::text AS date
     FROM hat3x_transactions ORDER BY date`
  );

  let gastos = 0;
  const ingresos: string[] = [];

  for (const t of rows) {
    if (t.type === "expense") {
      await destino.query(
        `INSERT INTO gastos (fecha, concepto, base, iva, total, categoria, notas)
         VALUES ($1,$2,$3,0,$3,$4,$5)`,
        [t.date, t.description, t.amount, CATEGORIA[t.category] ?? "otro", MARCA_IMPORTADO]
      );
      gastos++;
    } else {
      ingresos.push(`  ${t.date}  ${t.amount} €  ${t.description}`);
    }
  }

  console.log(`${gastos} gastos importados.`);
  if (ingresos.length) {
    console.log(`\n${ingresos.length} ingresos NO importados, para revisar a mano:`);
    console.log(ingresos.join("\n"));
  }

  await origen.end();
  await destino.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
