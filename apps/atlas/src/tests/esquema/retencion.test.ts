import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;
let idCheck = "";

beforeAll(async () => {
  db = new Client({ connectionString: URL_PG });
  await db.connect();

  const {
    rows: [p],
  } = await db.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Ret','ret','interno') RETURNING id`
  );
  const {
    rows: [s],
  } = await db.query(
    `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1,'S','api') RETURNING id`,
    [p.id]
  );
  const {
    rows: [c],
  } = await db.query(
    `INSERT INTO checks (servicio_id, tipo, url)
     VALUES ($1,'http','https://ejemplo.test') RETURNING id`,
    [s.id]
  );
  idCheck = c.id;
});

afterAll(async () => {
  await db.query(`DELETE FROM proyectos WHERE slug = 'ret'`);
  await db.end();
});

describe("retención por capas", () => {
  it("consolida en agregados horarios lo que pasa de 7 días y borra el detalle", async () => {
    // 10 resultados de hace 10 días, dentro de la misma hora: 9 correctos, 1 no.
    for (let i = 0; i < 10; i++) {
      await db.query(
        `INSERT INTO check_resultados (check_id, ts, ok, latencia_ms)
         VALUES ($1, date_trunc('hour', now() - interval '10 days')
                     + ($2 || ' seconds')::interval, $3, $4)`,
        [idCheck, i * 60, i !== 3, 100 + i]
      );
    }
    // Y 5 recientes, que NO deben tocarse.
    for (let i = 0; i < 5; i++) {
      await db.query(
        `INSERT INTO check_resultados (check_id, ts, ok, latencia_ms)
         VALUES ($1, now() - interval '1 hour', true, 200)`,
        [idCheck]
      );
    }

    await db.query(`SELECT atlas_consolidar_retencion()`);

    const { rows: agregados } = await db.query(
      `SELECT total, ok, latencia_p50 FROM check_agregados
       WHERE check_id = $1 AND granularidad = 'hora'`,
      [idCheck]
    );
    expect(agregados).toHaveLength(1);
    expect(agregados[0].total).toBe(10);
    expect(agregados[0].ok).toBe(9);
    expect(agregados[0].latencia_p50).toBeGreaterThan(0);

    const { rows: detalle } = await db.query(
      `SELECT count(*)::int AS n FROM check_resultados WHERE check_id = $1`,
      [idCheck]
    );
    expect(detalle[0].n).toBe(5); // solo quedan los recientes
  });

  it("es idempotente: relanzarla no duplica ni altera los agregados", async () => {
    const antes = await db.query(
      `SELECT total, ok FROM check_agregados WHERE check_id=$1 AND granularidad='hora'`,
      [idCheck]
    );
    await db.query(`SELECT atlas_consolidar_retencion()`);
    await db.query(`SELECT atlas_consolidar_retencion()`);
    const despues = await db.query(
      `SELECT total, ok FROM check_agregados WHERE check_id=$1 AND granularidad='hora'`,
      [idCheck]
    );
    expect(despues.rows).toEqual(antes.rows);
  });

  it("colapsa los agregados horarios de más de 90 días en diarios", async () => {
    await db.query(
      `INSERT INTO check_agregados (check_id, bucket, granularidad, total, ok, latencia_p50)
       VALUES ($1, date_trunc('hour', now() - interval '100 days'), 'hora', 12, 12, 150),
              ($1, date_trunc('hour', now() - interval '100 days') + interval '1 hour',
               'hora', 12, 10, 160)`,
      [idCheck]
    );
    await db.query(`SELECT atlas_consolidar_retencion()`);

    const { rows: diarios } = await db.query(
      `SELECT total, ok FROM check_agregados
       WHERE check_id=$1 AND granularidad='dia'`,
      [idCheck]
    );
    expect(diarios).toHaveLength(1);
    expect(diarios[0].total).toBe(24);
    expect(diarios[0].ok).toBe(22);

    const { rows: viejosHorarios } = await db.query(
      `SELECT count(*)::int AS n FROM check_agregados
       WHERE check_id=$1 AND granularidad='hora'
         AND bucket < now() - interval '90 days'`,
      [idCheck]
    );
    expect(viejosHorarios[0].n).toBe(0);
  });

  // Lo que justifica todo el diseño: la cifra que se enseña no puede moverse
  // porque una tarea nocturna haya purgado el detalle.
  it("los contadores salen iguales antes y después de consolidar", async () => {
    const {
      rows: [c],
    } = await db.query(
      `INSERT INTO checks (servicio_id, tipo, url)
       SELECT servicio_id, 'http', 'https://ejemplo.test/2' FROM checks WHERE id=$1
       RETURNING id`,
      [idCheck]
    );
    // 20 resultados de hace 8 días: 17 correctos.
    for (let i = 0; i < 20; i++) {
      await db.query(
        `INSERT INTO check_resultados (check_id, ts, ok, latencia_ms)
         VALUES ($1, date_trunc('hour', now() - interval '8 days')
                     + ($2 || ' seconds')::interval, $3, 120)`,
        [c.id, i * 60, i >= 3]
      );
    }
    const { rows: antes } = await db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE ok)::int AS ok
       FROM check_resultados WHERE check_id=$1`,
      [c.id]
    );

    await db.query(`SELECT atlas_consolidar_retencion()`);

    const { rows: despues } = await db.query(
      `SELECT sum(total)::int AS total, sum(ok)::int AS ok
       FROM check_agregados WHERE check_id=$1`,
      [c.id]
    );
    expect(despues[0].total).toBe(antes[0].total);
    expect(despues[0].ok).toBe(antes[0].ok);
  });
});
