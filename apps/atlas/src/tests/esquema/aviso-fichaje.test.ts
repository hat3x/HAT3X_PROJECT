// src/tests/esquema/aviso-fichaje.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CORREO = "aviso-fichaje@atlas.test";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let idUsuario = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO) await admin.auth.admin.deleteUser(u.id);
  }
  const creado = await admin.auth.admin.createUser({ email: CORREO, password: "contrasena-de-prueba", email_confirm: true });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1, true)`, [idUsuario]);
});

afterAll(async () => {
  try {
    if (idUsuario !== "") {
      try {
        await pg.query(`DELETE FROM notificaciones WHERE usuario_id = $1`, [idUsuario]);
      } catch {
        /* ya no está */
      }
      try {
        await admin.auth.admin.deleteUser(idUsuario);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("el aviso de fichaje", () => {
  it("las notificaciones admiten el tipo fichaje, y siguen sin admitir otros", async () => {
    await expect(
      pg.query(`INSERT INTO notificaciones (usuario_id, canal, ok, tipo) VALUES ($1,'push',true,'fichaje')`, [idUsuario])
    ).resolves.toBeDefined();
    await expect(
      pg.query(`INSERT INTO notificaciones (usuario_id, canal, ok, tipo) VALUES ($1,'push',true,'chuches')`, [idUsuario])
    ).rejects.toThrow(/violates check constraint "notificaciones_tipo_check"/);
  });

  it("la tarea horaria está dada de alta al minuto 41", async () => {
    const { rows } = await pg.query(`SELECT schedule FROM cron.job WHERE jobname = 'atlas-fichajes'`);
    expect(rows[0].schedule).toBe("41 * * * *");
  });

  // Ejecutando con el rol, no leyendo el catálogo: lo que importa es qué pasa
  // cuando alguien llama.
  it("un rol autenticado no puede dispararla", async () => {
    await pg.query("begin");
    await pg.query("set local role authenticated");
    await expect(pg.query("select atlas_disparar_fichajes()")).rejects.toThrow(/permission denied|permiso denegado/i);
    await pg.query("rollback");
  });
});
