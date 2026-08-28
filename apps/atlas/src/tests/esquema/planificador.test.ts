import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: URL_PG });
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

describe("planificador", () => {
  it("las extensiones necesarias están instaladas", async () => {
    const { rows } = await db.query(
      `SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net')`
    );
    expect(rows.map((r) => r.extname).sort()).toEqual(["pg_cron", "pg_net"]);
  });

  it("hay una tarea programada cada minuto", async () => {
    const { rows } = await db.query(
      `SELECT schedule, active FROM cron.job WHERE jobname = 'atlas-vigia'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBe("* * * * *");
    expect(rows[0].active).toBe(true);
  });

  it("existe la tarea diaria de retención", async () => {
    const { rows } = await db.query(
      `SELECT schedule FROM cron.job WHERE jobname = 'atlas-retencion'`
    );
    expect(rows).toHaveLength(1);
  });

  it("el índice que consulta el planificador existe y filtra por activo", async () => {
    const { rows } = await db.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'checks_pendientes'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("proximo_check_en");
    expect(rows[0].indexdef).toContain("WHERE activo");
  });

  it("la función del disparador existe y es SECURITY DEFINER", async () => {
    const { rows } = await db.query(
      `SELECT prosecdef FROM pg_proc WHERE proname = 'atlas_disparar_vigia'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(true);
  });

  // Sin la URL ni la clave configuradas, el disparador NO debe reventar la
  // tarea de cron: avisa y se calla. Una tarea que falla cada minuto llena el
  // registro de ruido y acaba ocultando un problema de verdad.
  it("sin configurar, avisa en vez de fallar", async () => {
    await expect(db.query(`SELECT atlas_disparar_vigia()`)).resolves.toBeDefined();
  });
});
