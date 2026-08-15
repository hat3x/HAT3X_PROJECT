import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

/** Crea un usuario en auth.users y devuelve su id. */
async function nuevoUsuario(email: string): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated', 'authenticated', $1)
     RETURNING id`,
    [email]
  );
  return rows[0].id as string;
}

beforeAll(async () => {
  db = new Client({ connectionString: URL_LOCAL });
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

describe("esquema de personas y secretos", () => {
  it("el perfil nace con tema oscuro y paleta zafiro", async () => {
    const id = await nuevoUsuario("perfil@ejemplo.test");
    await db.query(`INSERT INTO perfiles (id, nombre) VALUES ($1, 'Perfil')`, [id]);
    const { rows } = await db.query(
      `SELECT tema, paleta, es_propietario FROM perfiles WHERE id = $1`, [id]
    );
    expect(rows[0]).toEqual({ tema: "oscuro", paleta: "zafiro", es_propietario: false });
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  });

  it("rechaza una paleta que no exista", async () => {
    const id = await nuevoUsuario("paleta@ejemplo.test");
    await expect(
      db.query(`INSERT INTO perfiles (id, paleta) VALUES ($1, 'fucsia')`, [id])
    ).rejects.toThrow(/violates check constraint/);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  });

  it("un usuario tiene como mucho un permiso por proyecto", async () => {
    const id = await nuevoUsuario("permisos@ejemplo.test");
    await db.query(`INSERT INTO perfiles (id) VALUES ($1)`, [id]);
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Perm', 'perm', 'interno')
       RETURNING id`
    );
    await db.query(
      `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1, $2, 'editor')`,
      [id, p.id]
    );
    await expect(
      db.query(`INSERT INTO permisos (usuario_id, proyecto_id, rol)
                VALUES ($1, $2, 'lector')`, [id, p.id])
    ).rejects.toThrow(/duplicate key/);

    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  });

  it("solo admite los roles editor y lector — propietario no es un permiso", async () => {
    const id = await nuevoUsuario("rol@ejemplo.test");
    await db.query(`INSERT INTO perfiles (id) VALUES ($1)`, [id]);
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Rol', 'rol', 'interno')
       RETURNING id`
    );
    await expect(
      db.query(`INSERT INTO permisos (usuario_id, proyecto_id, rol)
                VALUES ($1, $2, 'propietario')`, [id, p.id])
    ).rejects.toThrow(/violates check constraint/);
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  });

  it("una credencial guarda bytes cifrados y solo el prefijo en claro", async () => {
    // Bytes de relleno, no un secreto cifrado de verdad: aquí solo se comprueba
    // que el esquema los acepta y que el prefijo queda legible.
    const { rows: [cred] } = await db.query(
      `INSERT INTO credenciales (proveedor, etiqueta, secreto_cifrado, iv, tag, prefijo)
       VALUES ('retell', 'API Retell', '\\xdeadbeef'::bytea,
               '\\x000102030405060708090a0b'::bytea,
               '\\x00112233445566778899aabbccddeeff'::bytea, 'sk_test_••••0000')
       RETURNING id, prefijo`
    );
    expect(cred.prefijo).toBe("sk_test_••••0000");
    await db.query(`DELETE FROM credenciales WHERE id = $1`, [cred.id]);
  });

  it("una nota apunta a cliente o a proyecto, no a otra cosa", async () => {
    const { rows: [p] } = await db.query(
      `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('N', 'n-nota', 'interno')
       RETURNING id`
    );
    await db.query(
      `INSERT INTO notas (entidad_tipo, entidad_id, contenido)
       VALUES ('proyecto', $1, 'Endodoncias solo martes')`, [p.id]
    );
    await expect(
      db.query(`INSERT INTO notas (entidad_tipo, entidad_id, contenido)
                VALUES ('factura', $1, 'x')`, [p.id])
    ).rejects.toThrow(/violates check constraint/);
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [p.id]);
  });
});
