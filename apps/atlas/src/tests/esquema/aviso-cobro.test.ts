// src/tests/esquema/aviso-cobro.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pg: Client;

// Correo fijo y reconocible: si una corrida anterior murió antes de llegar a
// su afterAll, este beforeAll la limpia por su cuenta en vez de acumular
// perfiles huérfanos en cada ejecución de la suite.
const CORREO_PRUEBA = "aviso-cobro@atlas.test";
let idUsuario = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // Limpia antes de crear, no solo al final: no se puede suponer que la base
  // está vacía.
  await pg.query(`DELETE FROM auth.users WHERE email = $1`, [CORREO_PRUEBA]);

  // `notificaciones.usuario_id` tiene clave foránea a `perfiles`. El brief
  // original probaba el check de `tipo` insertando con un usuario_id a
  // ceros: Postgres rechaza esa fila por la foránea ANTES de llegar a
  // comprobar el check, así que el test pasaría por el motivo equivocado y
  // dejaría de proteger nada el día que alguien borrase el check. Por eso
  // aquí se crea un perfil de verdad (con su usuario en auth.users, que es
  // lo que perfiles.id referencia) y el test de abajo inserta con ESE id.
  const { rows } = await pg.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email)
     VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
             'authenticated', 'authenticated', $1)
     RETURNING id`,
    [CORREO_PRUEBA]
  );
  idUsuario = rows[0].id as string;
  await pg.query(`INSERT INTO perfiles (id) VALUES ($1)`, [idUsuario]);
});

afterAll(async () => {
  try {
    // Por si el test del check dejó la fila insertada (no debería: la
    // inserción falla y no llega a persistir nada, pero se borra igual por
    // si acaso cambia el orden de los tests).
    await pg.query(`DELETE FROM notificaciones WHERE usuario_id = $1`, [idUsuario]);
    // Borrar auth.users se lleva el perfil por delante (on delete cascade),
    // así que no hace falta un DELETE FROM perfiles aparte.
    await pg.query(`DELETE FROM auth.users WHERE id = $1`, [idUsuario]);
  } finally {
    // Cerrar la conexión pase lo que pase: un fallo en la limpieza no debe
    // dejar el cliente de pg colgado y bloqueando el resto de la suite.
    await pg.end();
  }
});

describe("el aviso de cobro", () => {
  it("las notificaciones nacen de tipo incidencia", async () => {
    const { rows } = await pg.query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'notificaciones' AND column_name = 'tipo'`
    );
    expect(rows[0].column_default).toContain("incidencia");
  });

  it("solo admite los dos tipos previstos", async () => {
    await expect(
      pg.query(
        `INSERT INTO notificaciones (usuario_id, canal, ok, tipo)
         VALUES ($1, 'push', true, 'chuches')`,
        [idUsuario]
      )
      // Anclado al nombre exacto del check («notificaciones_tipo_check», el
      // que genera Postgres por convención <tabla>_<columna>_check) y no a la
      // palabra suelta «tipo»: un regex tan amplio como /tipo/ también
      // casaría con el error de foránea del brief original (que menciona la
      // columna "usuario_id" y su tipo de dato), así que el test seguiría en
      // verde aunque el check dejase de existir. Anclarlo al nombre del check
      // es lo único que hace que este test falle si alguien lo borra.
    ).rejects.toThrow(/violates check constraint "notificaciones_tipo_check"/);
  });

  it("la tarea diaria está dada de alta a las 9:07", async () => {
    const { rows } = await pg.query(
      `SELECT schedule FROM cron.job WHERE jobname = 'atlas-cobro'`
    );
    expect(rows[0].schedule).toBe("7 9 * * *");
  });

  // Un `security definer` sin revoke queda expuesta en /rest/v1/rpc y se salta
  // RLS. Se comprueba ejecutando con el rol, no leyendo el catálogo: lo que
  // importa es qué pasa cuando alguien llama.
  it("un rol autenticado no puede dispararla", async () => {
    await pg.query("begin");
    await pg.query("set local role authenticated");
    await expect(pg.query("select atlas_disparar_cobro()")).rejects.toThrow(
      /permission denied|permiso denegado/i
    );
    await pg.query("rollback");
  });
});
