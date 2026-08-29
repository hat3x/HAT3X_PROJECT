// src/tests/esquema/recurrentes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pg: Client;

async function alta(concepto: string, dia = 1, activo = true) {
  const { rows } = await pg.query(
    `INSERT INTO gastos_recurrentes (concepto, base, iva, categoria, dia_del_mes, activo)
     VALUES ($1, 20, 4.2, 'infraestructura', $2, $3) RETURNING id`,
    [concepto, dia, activo]
  );
  return rows[0].id as string;
}

async function materializar(mes: string): Promise<number> {
  const { rows } = await pg.query(`SELECT atlas_materializar_recurrentes($1) AS n`, [mes]);
  return Number(rows[0].n);
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
});

// DELETE FROM sin condición: aceptable solo porque esto corre contra Supabase
// local y estas dos tablas no llevan datos que importen fuera del test. No
// copiar este patrón a un fichero que toque datos que sí importan.
beforeEach(async () => {
  await pg.query(`DELETE FROM gastos`);
  await pg.query(`DELETE FROM gastos_recurrentes`);
});

afterAll(async () => {
  await pg.query(`DELETE FROM gastos`);
  await pg.query(`DELETE FROM gastos_recurrentes`);
  await pg.end();
});

describe("materializar recurrentes", () => {
  it("crea un gasto por cada alta activa, con su total", async () => {
    await alta("Vercel");
    await alta("Supabase");

    expect(await materializar("2026-09-15")).toBe(2);

    const { rows } = await pg.query(
      `SELECT concepto, fecha::text, total FROM gastos ORDER BY concepto`
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].fecha).toBe("2026-09-01");
    expect(Number(rows[0].total)).toBe(24.2);
  });

  // Lo que impide que un cron disparado dos veces doble los gastos del mes.
  it("dos pasadas del mismo mes no duplican", async () => {
    await alta("Vercel");
    expect(await materializar("2026-09-01")).toBe(1);
    expect(await materializar("2026-09-20")).toBe(0);

    const { rows } = await pg.query(`SELECT count(*)::int AS n FROM gastos`);
    expect(rows[0].n).toBe(1);
  });

  it("meses distintos sí generan gastos distintos", async () => {
    await alta("Vercel");
    await materializar("2026-09-01");
    expect(await materializar("2026-10-01")).toBe(1);
  });

  it("las bajas no se materializan", async () => {
    await alta("Antiguo", 1, false);
    expect(await materializar("2026-09-01")).toBe(0);
  });

  it("respeta el día del mes", async () => {
    await alta("Twilio", 15);
    await materializar("2026-09-01");
    const { rows } = await pg.query(`SELECT fecha::text FROM gastos`);
    expect(rows[0].fecha).toBe("2026-09-15");
  });
});
