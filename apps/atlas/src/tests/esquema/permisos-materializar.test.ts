// src/tests/esquema/permisos-materializar.test.ts
//
// Se prueba con el rol de verdad, no leyendo information_schema: lo que
// importa es lo que pasa cuando alguien llama a la función, no lo que dice el
// catálogo de permisos. Un GRANT o un REVOKE mal aplicado, o un futuro
// `create or replace function` que resetee los permisos por accidente, se
// detecta aquí porque la llamada en sí falla o tiene éxito — no hace falta
// interpretar metadatos.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pg: Client;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
});

afterAll(async () => {
  await pg.end();
});

describe("permisos de las funciones de materializar", () => {
  it("un rol autenticado no puede materializar recurrentes", async () => {
    await pg.query("begin");
    await pg.query("set local role authenticated");
    await expect(
      pg.query("select atlas_materializar_recurrentes(current_date)")
    ).rejects.toThrow(/permission denied|permiso denegado/i);
    await pg.query("rollback");
  });

  it("un rol autenticado no puede materializar periodos", async () => {
    await pg.query("begin");
    await pg.query("set local role authenticated");
    await expect(
      pg.query("select atlas_materializar_periodos(current_date)")
    ).rejects.toThrow(/permission denied|permiso denegado/i);
    await pg.query("rollback");
  });

  // Si no se comprueba también el camino positivo, un REVOKE de más (por
  // ejemplo revocado también al dueño, o a `postgres`) pasaría desapercibido
  // y el cron dejaría de funcionar en silencio: nadie lo notaría hasta que
  // faltara un mes entero de gastos o de periodos.
  it("el dueño sí puede materializar recurrentes", async () => {
    await pg.query("begin");
    const { rows } = await pg.query(
      "select atlas_materializar_recurrentes(current_date) as n"
    );
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(0);
    await pg.query("rollback");
  });

  it("el dueño sí puede materializar periodos", async () => {
    await pg.query("begin");
    const { rows } = await pg.query(
      "select atlas_materializar_periodos(current_date) as n"
    );
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(0);
    await pg.query("rollback");
  });
});
