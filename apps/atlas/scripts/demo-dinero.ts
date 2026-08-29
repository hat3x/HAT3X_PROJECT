//
// Datos de ejemplo para MIRAR las pantallas de Dinero. Solo desarrollo local.
//
//   npx tsx scripts/demo-dinero.ts            # los siembra
//   npx tsx scripts/demo-dinero.ts --limpiar  # los retira
//
// Existe porque una pantalla vacía no se puede juzgar: no se ve si el desglose
// ordena bien, si los tres totales cuadran, ni si una tabla larga se lee. Y
// porque la base local se recrea entera cada vez que se levanta Supabase de
// cero, así que esto hay que repetirlo.
//
// TODO lo que siembra va marcado —los slugs con prefijo `demo-` y los gastos
// con una nota— para poder distinguirlo de un dato real y retirarlo sin
// llevarse nada por delante.
//
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** La marca que distingue lo inventado de lo real. */
const MARCA = "[demo]";

const CLIENTES = [
  { nombre: "Clínica Dental Biodental", slug: "demo-biodental", sector: "odontologia" },
  { nombre: "Club BioSpa", slug: "demo-clubbiospa", sector: "bienestar" },
  { nombre: "100 Montaditos", slug: "demo-100-montaditos", sector: "restauracion" },
] as const;

const PROYECTOS = [
  { nombre: "Recepcionista IA Sara", slug: "demo-sara", tipo: "voz" },
  { nombre: "Kairos", slug: "demo-kairos", tipo: "producto-propio" },
  { nombre: "Monty", slug: "demo-monty", tipo: "chatbot" },
] as const;

async function limpiar(pg: Client) {
  // El orden importa: los gastos referencian clientes y proyectos.
  await pg.query("delete from gastos where notas = $1", [MARCA]);
  await pg.query("delete from gastos_recurrentes where concepto like $1", [`%${MARCA}`]);
  for (const c of CLIENTES) await pg.query("delete from clientes where slug = $1", [c.slug]);
  for (const p of PROYECTOS) await pg.query("delete from proyectos where slug = $1", [p.slug]);
}

async function main() {
  const pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // Siempre se limpia antes de sembrar: así ejecutarlo dos veces no duplica
  // nada, igual que las funciones de materialización del bloque.
  await limpiar(pg);

  if (process.argv.includes("--limpiar")) {
    console.log("Datos de ejemplo retirados.");
    await pg.end();
    return;
  }

  const ids: Record<string, string> = {};
  for (const c of CLIENTES) {
    const { rows } = await pg.query(
      `insert into clientes (nombre, slug, sector) values ($1,$2,$3) returning id`,
      [c.nombre, c.slug, c.sector]
    );
    ids[c.slug] = rows[0].id;
  }
  for (const p of PROYECTOS) {
    const { rows } = await pg.query(
      `insert into proyectos (nombre, slug, tipo, estado)
       values ($1,$2,$3,'produccion') returning id`,
      [p.nombre, p.slug, p.tipo]
    );
    ids[p.slug] = rows[0].id;
  }

  const plataforma = async (nombre: string): Promise<string> => {
    const { rows } = await pg.query("select id from plataformas where nombre = $1", [nombre]);
    if (!rows[0]) throw new Error(`Falta la plataforma «${nombre}» en el catálogo.`);
    return rows[0].id;
  };

  // El día 9 del mes en curso: dentro del periodo que enseña la pantalla.
  const dia = `${new Date().toISOString().slice(0, 8)}09`;

  // Mezcla deliberada: unos imputados a cliente y proyecto, otros solo a
  // cliente, y varios de estructura sin imputar. Así se ve que los tres
  // desgloses cuadran aunque cada gasto tenga distintos ejes rellenos.
  const gastos: [string, string, number, number, string | null, string | null, string][] = [
    ["Minutos de voz de Sara", "Retell AI", 48.3, 0, "demo-biodental", "demo-sara", "ia"],
    ["SMS de recordatorio", "Twilio", 12.75, 0, "demo-biodental", "demo-sara", "telefonia"],
    ["Número fijo y llamadas", "Zadarma", 9.4, 0, "demo-biodental", null, "telefonia"],
    ["Minutos de voz", "Retell AI", 21.1, 0, "demo-clubbiospa", "demo-sara", "ia"],
    ["Chat Monty", "OpenAI", 6.8, 0, "demo-100-montaditos", "demo-monty", "ia"],
    ["Comisiones de cobro", "Stripe", 14.22, 0, "demo-100-montaditos", "demo-monty", "otro"],
    ["Alojamiento", "Vercel", 20, 4.2, null, null, "infraestructura"],
    ["Base de datos", "Supabase", 25, 5.25, null, null, "infraestructura"],
    ["Correo y ofimática", "Google Workspace", 11.5, 2.42, null, null, "herramientas"],
    ["Dominios", "IONOS", 8, 1.68, null, null, "infraestructura"],
    ["Claude MAX", "Anthropic", 90, 18.9, null, null, "ia"],
    ["Síntesis de voz", "ElevenLabs", 22, 4.62, null, "demo-kairos", "ia"],
  ];

  for (const [concepto, plat, base, iva, cli, pro, cat] of gastos) {
    await pg.query(
      `insert into gastos (fecha, concepto, plataforma_id, base, iva, total,
                           categoria, cliente_id, proyecto_id, notas)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        dia,
        concepto,
        await plataforma(plat),
        base,
        iva,
        base + iva,
        cat,
        cli ? ids[cli] : null,
        pro ? ids[pro] : null,
        MARCA,
      ]
    );
  }

  const fijos: [string, string, number, number, string, number][] = [
    ["Vercel Pro", "Vercel", 20, 4.2, "infraestructura", 1],
    ["Supabase Pro", "Supabase", 25, 5.25, "infraestructura", 1],
    ["Google Workspace", "Google Workspace", 11.5, 2.42, "herramientas", 3],
    ["IONOS dominios", "IONOS", 8, 1.68, "infraestructura", 5],
    ["Claude MAX", "Anthropic", 90, 18.9, "ia", 12],
  ];

  for (const [concepto, plat, base, iva, cat, diaMes] of fijos) {
    await pg.query(
      `insert into gastos_recurrentes (concepto, plataforma_id, base, iva,
                                       categoria, dia_del_mes)
       values ($1,$2,$3,$4,$5,$6)`,
      [`${concepto} ${MARCA}`, await plataforma(plat), base, iva, cat, diaMes]
    );
  }

  const { rows } = await pg.query(
    `select (select count(*) from gastos)::int g,
            (select count(*) from gastos_recurrentes)::int f,
            (select sum(total) from gastos)::numeric t`
  );
  console.log(
    `Sembrado: ${rows[0].g} gastos y ${rows[0].f} recibos fijos. ` +
      `Total del mes: ${Number(rows[0].t).toFixed(2)} €`
  );
  console.log("Para retirarlo: npx tsx scripts/demo-dinero.ts --limpiar");

  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
