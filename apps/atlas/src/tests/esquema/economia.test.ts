import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let idCliente = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  const { rows } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Prueba Economía','prueba-economia')
     RETURNING id`
  );
  idCliente = rows[0].id;
});

afterAll(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  await pg.end();
});

async function factura(campos: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    origen: "externa",
    serie: "X",
    numero: Math.floor(Math.random() * 1_000_000),
    cliente_id: idCliente,
    fecha_emision: "2026-08-29",
    base: 290,
    iva_cuota: 60.9,
    total: 350.9,
    ...campos,
  };
  const cols = Object.keys(base);
  const vals = cols.map((_, i) => `$${i + 1}`);
  return pg.query(
    `INSERT INTO facturas (${cols.join(",")}) VALUES (${vals.join(",")}) RETURNING id`,
    Object.values(base)
  );
}

describe("esquema de economía", () => {
  it("una factura externa no puede llevar cadena", async () => {
    await expect(factura({ huella: "abc" })).rejects.toThrow(/solo_atlas_encadena/);
  });

  it("una de Atlas sí puede", async () => {
    const { rows } = await factura({ origen: "atlas", huella: "abc" });
    expect(rows[0].id).toBeTruthy();
  });

  it("el vencimiento no puede ser anterior a la emisión", async () => {
    await expect(
      factura({ fecha_emision: "2026-08-29", fecha_vencimiento: "2026-08-01" })
    ).rejects.toThrow(/vencimiento_no_anterior/);
  });

  it("no se repite serie y número", async () => {
    await factura({ serie: "DUP", numero: 1 });
    await expect(factura({ serie: "DUP", numero: 1 })).rejects.toThrow(/duplicate key/);
  });

  // Un registro fiscal tiene que sobrevivir a que se borre el cliente. Si esto
  // cayera en cascada, un borrado de mantenimiento se llevaría la contabilidad.
  it("borrar un cliente con facturas falla", async () => {
    await factura();
    await expect(
      pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente])
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("un recurrente no puede caer el día 31", async () => {
    await expect(
      pg.query(
        `INSERT INTO gastos_recurrentes (concepto, base, categoria, dia_del_mes)
         VALUES ('Prueba', 10, 'otro', 31)`
      )
    ).rejects.toThrow(/dia_del_mes/);
  });
});
