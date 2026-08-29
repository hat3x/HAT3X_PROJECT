// src/tests/esquema/periodos.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SLUG_CLIENTE = "periodos-prueba";
const SLUG_PROYECTO = "periodos";
let pg: Client;
let idCliente = "";
let idProyecto = "";

async function contrato(
  alta: string,
  baja: string | null,
  estado = "activo",
  cuota: number | null = 350
) {
  const { rows } = await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta, baja, estado)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [idCliente, idProyecto, cuota, alta, baja, estado]
  );
  return rows[0].id as string;
}

async function materializar(mes: string): Promise<number> {
  const { rows } = await pg.query(`SELECT atlas_materializar_periodos($1) AS n`, [mes]);
  return Number(rows[0].n);
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // Limpieza defensiva: si una corrida anterior se cortó a medias, los slugs
  // fijos de cliente y proyecto ya existirán y el INSERT de más abajo fallará.
  // Igual que en src/tests/db/acciones-facturas.test.ts, se borra por slug
  // antes de crear nada, para que el fichero se autorrepare solo.
  await pg.query(
    `DELETE FROM periodos_contrato WHERE contrato_id IN (
       SELECT id FROM contratos WHERE cliente_id IN (
         SELECT id FROM clientes WHERE slug = $1
       )
     )`,
    [SLUG_CLIENTE]
  );
  await pg.query(
    `DELETE FROM contratos WHERE cliente_id IN (SELECT id FROM clientes WHERE slug = $1)`,
    [SLUG_CLIENTE]
  );
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);
  await pg.query(`DELETE FROM proyectos WHERE slug = $1`, [SLUG_PROYECTO]);

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Periodos Prueba','periodos-prueba')
     RETURNING id`
  );
  idCliente = c.id;
  const { rows: [p] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Periodos','periodos','interno')
     RETURNING id`
  );
  idProyecto = p.id;
});

// DELETE FROM sobre periodos_contrato es sin condición: aceptable solo porque
// esto corre contra Supabase local y esa tabla no lleva datos que importen
// fuera del test. No copiar este patrón a un fichero que toque datos que sí
// importan.
beforeEach(async () => {
  await pg.query(`DELETE FROM periodos_contrato`);
  await pg.query(`DELETE FROM contratos WHERE cliente_id = $1`, [idCliente]);
});

afterAll(async () => {
  // Cada borrado va en su propio try: si uno falla, no debe impedir los
  // siguientes, y el cierre de `pg` en el finally está garantizado pase lo
  // que pase. Esta limpieza es solo cortesía cuando todo sale bien; la red de
  // seguridad real es la limpieza defensiva del beforeAll. Mismo patrón que
  // src/tests/db/acciones-facturas.test.ts.
  try {
    try {
      await pg.query(`DELETE FROM periodos_contrato`);
    } catch {
      // Se limpia en la siguiente corrida, en el beforeAll.
    }
    try {
      if (idCliente !== "") {
        await pg.query(`DELETE FROM contratos WHERE cliente_id = $1`, [idCliente]);
      }
    } catch {
      // Idem.
    }
    try {
      if (idCliente !== "") {
        await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
      }
    } catch {
      // Idem.
    }
    try {
      if (idProyecto !== "") {
        await pg.query(`DELETE FROM proyectos WHERE id = $1`, [idProyecto]);
      }
    } catch {
      // Idem.
    }
  } finally {
    await pg.end();
  }
});

describe("materializar periodos", () => {
  it("crea el periodo con el importe congelado", async () => {
    await contrato("2026-01-01", null);
    expect(await materializar("2026-09-15")).toBe(1);

    const { rows } = await pg.query(
      `SELECT periodo::text, importe_esperado, factura_id FROM periodos_contrato`
    );
    expect(rows[0].periodo).toBe("2026-09-01");
    expect(Number(rows[0].importe_esperado)).toBe(350);
    // Nace sin factura: es justo lo que 2B irá a buscar.
    expect(rows[0].factura_id).toBeNull();
  });

  it("dos pasadas del mismo mes no duplican", async () => {
    await contrato("2026-01-01", null);
    expect(await materializar("2026-09-01")).toBe(1);
    expect(await materializar("2026-09-20")).toBe(0);
  });

  it("un contrato pausado no genera periodo", async () => {
    await contrato("2026-01-01", null, "pausado");
    expect(await materializar("2026-09-01")).toBe(0);
  });

  it("un contrato sin cuota no genera periodo", async () => {
    await contrato("2026-01-01", null, "activo", null);
    expect(await materializar("2026-09-01")).toBe(0);
  });

  // Sin esta comprobación, 2B perseguiría cobros de clientes que ya se fueron.
  it("no genera meses anteriores al alta ni posteriores a la baja", async () => {
    await contrato("2026-09-10", "2026-11-30");
    expect(await materializar("2026-08-01")).toBe(0); // antes del alta
    expect(await materializar("2026-09-01")).toBe(1); // el mes del alta sí
    expect(await materializar("2026-12-01")).toBe(0); // después de la baja
  });
});
