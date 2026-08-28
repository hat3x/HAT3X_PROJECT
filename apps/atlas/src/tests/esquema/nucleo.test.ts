import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

// Cadena por defecto de Supabase local. No es una credencial: es idéntica en
// todas las instalaciones y solo existe mientras el contenedor esté levantado.
const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: URL_LOCAL });
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

describe("esquema núcleo", () => {
  it("un cliente necesita nombre y slug único", async () => {
    await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Cliente Demo', 'cliente-demo')`
    );
    await expect(
      db.query(`INSERT INTO clientes (nombre, slug) VALUES ('Otro', 'cliente-demo')`)
    ).rejects.toThrow(/duplicate key/);
    await db.query(`DELETE FROM clientes WHERE slug = 'cliente-demo'`);
  });

  it("rechaza un estado de cliente que no esté en la lista", async () => {
    await expect(
      db.query(`INSERT INTO clientes (nombre, slug, estado)
                VALUES ('X', 'x-invalido', 'inventado')`)
    ).rejects.toThrow(/violates check constraint/);
  });

  it("un contrato une cliente y proyecto, y admite reincorporación con otra alta", async () => {
    const { rows: [c] } = await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Demo SL', 'demo-sl') RETURNING id`
    );
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo, estado)
       VALUES ('Voz Demo', 'voz-demo', 'voz', 'produccion') RETURNING id`
    );

    await db.query(
      `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta, baja, estado)
       VALUES ($1, $2, 290.00, '2026-05-01', '2026-06-30', 'finalizado')`,
      [c.id, p.id]
    );
    // Mismo cliente y mismo proyecto, otra alta: debe permitirse.
    await db.query(
      `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
       VALUES ($1, $2, 350.00, '2026-08-05')`,
      [c.id, p.id]
    );
    // Repetir la misma alta, no.
    await expect(
      db.query(`INSERT INTO contratos (cliente_id, proyecto_id, alta)
                VALUES ($1, $2, '2026-08-05')`, [c.id, p.id])
    ).rejects.toThrow(/duplicate key/);

    const { rows } = await db.query(
      `SELECT moneda, cuota_mensual::text FROM contratos
       WHERE cliente_id = $1 ORDER BY alta`, [c.id]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].moneda).toBe("EUR");
    expect(rows[0].cuota_mensual).toBe("290.00");

    await db.query(`DELETE FROM clientes WHERE id = $1`, [c.id]);
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
  });

  it("rechaza una baja anterior al alta", async () => {
    const { rows: [c] } = await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Fechas', 'fechas') RETURNING id`
    );
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('P', 'p-fechas', 'interno')
       RETURNING id`
    );
    await expect(
      db.query(`INSERT INTO contratos (cliente_id, proyecto_id, alta, baja)
                VALUES ($1, $2, '2026-08-05', '2026-07-01')`, [c.id, p.id])
    ).rejects.toThrow(/violates check constraint/);
    await db.query(`DELETE FROM clientes WHERE id = $1`, [c.id]);
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
  });

  it("borrar un cliente arrastra sus contactos", async () => {
    const { rows: [c] } = await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Cascada', 'cascada') RETURNING id`
    );
    await db.query(
      `INSERT INTO contactos (cliente_id, nombre) VALUES ($1, 'Recepción')`, [c.id]
    );
    await db.query(`DELETE FROM clientes WHERE id = $1`, [c.id]);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM contactos WHERE cliente_id = $1`, [c.id]
    );
    expect(rows[0].n).toBe(0);
  });
});
