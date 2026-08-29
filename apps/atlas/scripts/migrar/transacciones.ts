// apps/atlas/scripts/migrar/transacciones.ts
//
// Vuelca `hat3x_transactions` de jarvis al libro de Atlas. Se ejecuta UNA vez:
//
//   npx tsx scripts/migrar/transacciones.ts --origen "postgresql://..."
//
// Los ingresos NO se convierten en facturas: una transacción de jarvis no tiene
// serie, ni número, ni líneas, y fabricarle unos falsos metería en el libro
// facturas que nunca existieron. Se vuelcan solo los gastos, y los ingresos se
// listan por pantalla para decidir a mano cuáles merecen una factura
// registrada.
//
import { Client } from "pg";

const DESTINO = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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

  const origen = new Client({ connectionString: cadena });
  const destino = new Client({ connectionString: DESTINO });
  await origen.connect();
  await destino.connect();

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
         VALUES ($1,$2,$3,0,$3,$4,'Importado de jarvis')`,
        [t.date, t.description, t.amount, CATEGORIA[t.category] ?? "otro"]
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
