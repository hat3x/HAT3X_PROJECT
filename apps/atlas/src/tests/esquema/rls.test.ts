import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

let idJose = ""; // propietario
let idColega = ""; // editor de un solo proyecto
let proyMio = ""; // proyecto asignado al colega
let proyAjeno = ""; // proyecto NO asignado al colega
let cliente = "";

async function nuevoUsuario(email: string, propietario: boolean): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated', 'authenticated', $1) RETURNING id`,
    [email]
  );
  const id = rows[0].id as string;
  await db.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1, $2, $3)`,
    [id, email, propietario]
  );
  return id;
}

/** Ejecuta consultas haciéndose pasar por un usuario, y lo deshace al terminar. */
async function como<T>(usuarioId: string, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  await db.query("set local role authenticated");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: usuarioId, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

beforeAll(async () => {
  db = new Client({ connectionString: URL_LOCAL });
  await db.connect();

  idJose = await nuevoUsuario("jose@atlas.test", true);
  idColega = await nuevoUsuario("colega@atlas.test", false);

  const { rows: [a] } = await db.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Mío', 'rls-mio', 'voz')
     RETURNING id`
  );
  const { rows: [b] } = await db.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Ajeno', 'rls-ajeno', 'voz')
     RETURNING id`
  );
  proyMio = a.id;
  proyAjeno = b.id;

  await db.query(
    `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1, $2, 'editor')`,
    [idColega, proyMio]
  );

  const { rows: [c] } = await db.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('RLS SL', 'rls-sl') RETURNING id`
  );
  cliente = c.id;
  await db.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1, $2, 290.00, '2026-05-01')`, [cliente, proyMio]
  );
  await db.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1, $2, 999.00, '2026-05-01')`, [cliente, proyAjeno]
  );
  // Bytes de relleno, no un secreto real.
  await db.query(
    `INSERT INTO credenciales (proveedor, etiqueta, secreto_cifrado, iv, tag)
     VALUES ('retell','R','\\x00'::bytea,'\\x000102030405060708090a0b'::bytea,
             '\\x00112233445566778899aabbccddeeff'::bytea)`
  );
});

afterAll(async () => {
  await db.query(`DELETE FROM clientes  WHERE id = $1`, [cliente]);
  await db.query(`DELETE FROM proyectos WHERE id = ANY($1)`, [[proyMio, proyAjeno]]);
  await db.query(`DELETE FROM auth.users WHERE id = ANY($1)`, [[idJose, idColega]]);
  await db.query(`DELETE FROM credenciales WHERE proveedor = 'retell'`);
  await db.end();
});

describe("RLS", () => {
  it("el propietario ve todos los proyectos", async () => {
    const n = await como(idJose, async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM proyectos WHERE id = ANY($1)`,
        [[proyMio, proyAjeno]]
      );
      return rows[0].n as number;
    });
    expect(n).toBe(2);
  });

  it("el editor ve solo el proyecto que tiene asignado", async () => {
    const slugs = await como(idColega, async () => {
      const { rows } = await db.query(`SELECT slug FROM proyectos ORDER BY slug`);
      return rows.map((r) => r.slug as string);
    });
    expect(slugs).toContain("rls-mio");
    expect(slugs).not.toContain("rls-ajeno");
  });

  it("el editor NO ve el importe de los contratos", async () => {
    const filas = await como(idColega, async () => {
      const { rows } = await db.query(
        `SELECT cuota_mensual, alta::text FROM contratos_visibles`
      );
      return rows;
    });
    // Ve el contrato de su proyecto, sin número, y no ve el del ajeno.
    expect(filas).toHaveLength(1);
    expect(filas[0].cuota_mensual).toBeNull();
    expect(filas[0].alta).toBe("2026-05-01");
  });

  it("el propietario SÍ ve el importe", async () => {
    // Filtrado por el cliente de ESTE test: la base la comparten varios
    // ficheros y un aserto que suponga la base vacía es frágil por definición.
    const importes = await como(idJose, async () => {
      const { rows } = await db.query(
        `SELECT cuota_mensual::text FROM contratos_visibles
         WHERE cliente_id = $1 ORDER BY cuota_mensual`, [cliente]
      );
      return rows.map((r) => r.cuota_mensual as string);
    });
    expect(importes).toEqual(["290.00", "999.00"]);
  });

  it("nadie que no sea propietario puede leer la tabla contratos directamente", async () => {
    await expect(
      como(idColega, () => db.query(`SELECT cuota_mensual FROM contratos`))
    ).rejects.toThrow(/permission denied/);
  });

  it("el editor no ve ninguna credencial", async () => {
    const n = await como(idColega, async () => {
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM credenciales`);
      return rows[0].n as number;
    });
    expect(n).toBe(0);
  });

  it("el editor puede editar servicios de su proyecto pero no del ajeno", async () => {
    await como(idColega, async () => {
      await db.query(
        `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1, 'OK', 'web')`,
        [proyMio]
      );
      await expect(
        db.query(`INSERT INTO servicios (proyecto_id, nombre, tipo)
                  VALUES ($1, 'NO', 'web')`, [proyAjeno])
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("un lector no puede escribir ni en su propio proyecto", async () => {
    const idLector = await nuevoUsuario("lector@atlas.test", false);
    await db.query(
      `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1, $2, 'lector')`,
      [idLector, proyMio]
    );
    await como(idLector, async () => {
      await expect(
        db.query(`INSERT INTO servicios (proyecto_id, nombre, tipo)
                  VALUES ($1, 'NO', 'web')`, [proyMio])
      ).rejects.toThrow(/row-level security/);
    });
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [idLector]);
  });
});
