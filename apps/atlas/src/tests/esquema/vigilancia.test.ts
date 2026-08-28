import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: URL_LOCAL });
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

async function proyectoDemo(slug: string): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ($1, $1, 'voz') RETURNING id`,
    [slug]
  );
  return rows[0].id as string;
}

describe("esquema de vigilancia", () => {
  it("un servicio exige proyecto pero el cliente es opcional", async () => {
    const p = await proyectoDemo("vig-servicio");

    // Sin cliente: válido. Es un servicio del proyecto, sin dueño comercial.
    await db.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'Web', 'web')`, [p]
    );
    // Sin proyecto: inválido.
    await expect(
      db.query(`INSERT INTO servicios (nombre, tipo) VALUES ('Huérfano', 'web')`)
    ).rejects.toThrow(/null value in column "proyecto_id"/);

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });

  it("el cliente del servicio es lo que hace atribuible la alerta", async () => {
    const p = await proyectoDemo("vig-atribucion");
    const { rows: [c] } = await db.query(
      `INSERT INTO clientes (nombre, slug) VALUES ('Atrib', 'atrib') RETURNING id`
    );
    const { rows: [s] } = await db.query(
      `INSERT INTO servicios (proyecto_id, cliente_id, nombre, tipo, proveedor)
       VALUES ($1, $2, 'n8n 02-crear-cita', 'workflow', 'n8n') RETURNING id`,
      [p, c.id]
    );
    const { rows } = await db.query(
      `SELECT s.nombre, cl.nombre AS cliente, pr.nombre AS proyecto
       FROM servicios s
       JOIN proyectos pr ON pr.id = s.proyecto_id
       LEFT JOIN clientes cl ON cl.id = s.cliente_id
       WHERE s.id = $1`, [s.id]
    );
    expect(rows[0].cliente).toBe("Atrib");
    expect(rows[0].proyecto).toBe("vig-atribucion");

    await db.query(`DELETE FROM clientes WHERE id = $1`, [c.id]);
    // Borrar el cliente NO borra el servicio: el servicio es del proyecto.
    const { rows: sigue } = await db.query(
      `SELECT cliente_id FROM servicios WHERE id = $1`, [s.id]
    );
    expect(sigue).toHaveLength(1);
    expect(sigue[0].cliente_id).toBeNull();

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });

  it("un check nace con los valores por defecto acordados", async () => {
    const p = await proyectoDemo("vig-check");
    const { rows: [s] } = await db.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'API', 'api')
       RETURNING id`, [p]
    );
    const { rows: [ch] } = await db.query(
      `INSERT INTO checks (servicio_id, tipo, url)
       VALUES ($1, 'http', 'https://ejemplo.test/salud') RETURNING *`, [s.id]
    );
    expect(ch.metodo).toBe("GET");
    expect(ch.timeout_ms).toBe(10000);
    expect(ch.intervalo_s).toBe(300);
    expect(ch.umbral_fallos).toBe(3);
    expect(ch.espera_status).toEqual([200]);
    expect(ch.notifica).toBe(true);
    expect(ch.estado).toBe("desconocido");
    expect(ch.fallos_consecutivos).toBe(0);

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });

  it("solo puede haber una incidencia abierta por check", async () => {
    const p = await proyectoDemo("vig-incidencia");
    const { rows: [s] } = await db.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'S', 'api')
       RETURNING id`, [p]
    );
    const { rows: [ch] } = await db.query(
      `INSERT INTO checks (servicio_id, tipo, url)
       VALUES ($1, 'http', 'https://ejemplo.test') RETURNING id`, [s.id]
    );
    await db.query(
      `INSERT INTO incidencias (servicio_id, check_id, abierta_en, severidad)
       VALUES ($1, $2, now(), 'critica')`, [s.id, ch.id]
    );
    await expect(
      db.query(`INSERT INTO incidencias (servicio_id, check_id, abierta_en, severidad)
                VALUES ($1, $2, now(), 'critica')`, [s.id, ch.id])
    ).rejects.toThrow(/duplicate key/);

    // Cerrada la primera, se puede abrir otra.
    await db.query(
      `UPDATE incidencias SET cerrada_en = now() WHERE check_id = $1`, [ch.id]
    );
    await db.query(
      `INSERT INTO incidencias (servicio_id, check_id, abierta_en, severidad)
       VALUES ($1, $2, now(), 'critica')`, [s.id, ch.id]
    );

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });

  it("un agregado es único por check, instante y granularidad", async () => {
    const p = await proyectoDemo("vig-agregado");
    const { rows: [s] } = await db.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'S', 'api')
       RETURNING id`, [p]
    );
    const { rows: [ch] } = await db.query(
      `INSERT INTO checks (servicio_id, tipo, url)
       VALUES ($1, 'http', 'https://ejemplo.test') RETURNING id`, [s.id]
    );
    await db.query(
      `INSERT INTO check_agregados (check_id, bucket, granularidad, total, ok)
       VALUES ($1, '2026-08-15T10:00:00Z', 'hora', 12, 12)`, [ch.id]
    );
    await expect(
      db.query(`INSERT INTO check_agregados (check_id, bucket, granularidad, total, ok)
                VALUES ($1, '2026-08-15T10:00:00Z', 'hora', 12, 11)`, [ch.id])
    ).rejects.toThrow(/duplicate key/);
    // Misma hora, otra granularidad: sí.
    await db.query(
      `INSERT INTO check_agregados (check_id, bucket, granularidad, total, ok)
       VALUES ($1, '2026-08-15T10:00:00Z', 'dia', 288, 287)`, [ch.id]
    );

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p]);
  });
});
