// src/tests/esquema/fichajes.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const CORREO_DUENYO = "duenyo-fichajes-esquema@atlas.test";
const CORREO_COLAB = "colab-fichajes-esquema@atlas.test";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idColab = "";

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,$2)`, [
    creado.data.user.id,
    propietario,
  ]);
  const sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: clave },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: correo,
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
  return { sb, id: creado.data.user.id };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza defensiva: si una corrida anterior murió a medias, el correo
  // sigue ocupado y `createUser` fallaría aquí sin llegar a limpiar nunca.
  // La FK de `usuario_id` es `on delete restrict` a propósito, así que
  // primero se borran los fichajes de esos correos y luego los usuarios.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
      await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const d = await altaUsuario(CORREO_DUENYO, true, "fe-d");
  const c = await altaUsuario(CORREO_COLAB, false, "fe-c");
  sbDuenyo = d.sb;
  idDuenyo = d.id;
  sbColab = c.sb;
  idColab = c.id;
});

afterAll(async () => {
  try {
    for (const id of [idDuenyo, idColab]) {
      if (id === "") continue; // beforeAll murió antes de asignarlo
      try {
        await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [id]);
      } catch {
        /* ya no está */
      }
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("la tabla fichajes", () => {
  it("rechaza un fin anterior al inicio", async () => {
    await expect(
      pg.query(
        `INSERT INTO fichajes (usuario_id, inicio, fin)
         VALUES ($1, '2026-08-30T10:00:00Z', '2026-08-30T09:00:00Z')`,
        [idDuenyo]
      )
    ).rejects.toThrow(/fichajes_check/);
  });

  it("rechaza un tramo añadido sin fin", async () => {
    await expect(
      pg.query(
        `INSERT INTO fichajes (usuario_id, inicio, origen)
         VALUES ($1, '2026-08-30T10:00:00Z', 'anadido')`,
        [idDuenyo]
      )
    ).rejects.toThrow(/fichajes_check/);
  });

  it("solo admite una entrada en curso por persona, desde la base", async () => {
    await pg.query(`INSERT INTO fichajes (usuario_id, inicio) VALUES ($1, now())`, [
      idDuenyo,
    ]);
    await expect(
      pg.query(`INSERT INTO fichajes (usuario_id, inicio) VALUES ($1, now())`, [
        idDuenyo,
      ])
    ).rejects.toThrow(/fichajes_uno_en_curso/);
    await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [idDuenyo]);
  });
});

describe("quién ve y escribe qué", () => {
  it("un colaborador ficha lo suyo", async () => {
    const { error } = await sbColab
      .from("fichajes")
      .insert({ usuario_id: idColab, inicio: "2026-08-30T08:00:00Z", fin: "2026-08-30T09:00:00Z" });
    expect(error).toBeNull();
  });

  it("un colaborador no puede fichar a nombre de otro", async () => {
    const { error } = await sbColab
      .from("fichajes")
      .insert({ usuario_id: idDuenyo, inicio: "2026-08-30T08:00:00Z", fin: "2026-08-30T09:00:00Z" });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/row-level security/);
  });

  it("un colaborador solo ve sus filas; el propietario ve las de todos", async () => {
    await pg.query(
      `INSERT INTO fichajes (usuario_id, inicio, fin)
       VALUES ($1, '2026-08-30T10:00:00Z', '2026-08-30T11:00:00Z')`,
      [idDuenyo]
    );
    const mios = [idDuenyo, idColab];

    const { data: veColab } = await sbColab.from("fichajes").select("usuario_id").in("usuario_id", mios);
    expect(veColab?.every((f) => f.usuario_id === idColab)).toBe(true);
    expect(veColab).toHaveLength(1);

    const { data: veDuenyo } = await sbDuenyo.from("fichajes").select("usuario_id").in("usuario_id", mios);
    expect(veDuenyo).toHaveLength(2);
  });

  it("el propietario no edita las horas de otro", async () => {
    // RLS sin fila que casar no falla: devuelve cero filas actualizadas. Se
    // comprueba releyendo, que es lo que importa.
    await sbDuenyo.from("fichajes").update({ nota: "toqueteado" }).eq("usuario_id", idColab);
    const { rows } = await pg.query(`SELECT nota FROM fichajes WHERE usuario_id = $1`, [idColab]);
    expect(rows[0].nota).toBeNull();
  });
});
