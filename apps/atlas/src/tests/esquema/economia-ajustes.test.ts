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
const CORREO_COLAB = "colab-economia-esquema@atlas.test";
const MES_PRUEBA = "2091-01-01"; // un mes que ningún otro test cierra

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idColab = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_COLAB) await admin.auth.admin.deleteUser(u.id);
  }
  await pg.query(`DELETE FROM cierres_mes WHERE mes = $1`, [MES_PRUEBA]);
  const creado = await admin.auth.admin.createUser({ email: CORREO_COLAB, password: "contrasena-de-prueba", email_confirm: true });
  if (creado.error) throw creado.error;
  idColab = creado.data.user.id;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1, false)`, [idColab]);
  sbColab = createClient<Database>(URL_API, ANON, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "ee-c" } });
  const { error } = await sbColab.auth.signInWithPassword({ email: CORREO_COLAB, password: "contrasena-de-prueba" });
  if (error) throw error;
});

afterAll(async () => {
  try {
    try {
      await pg.query(`DELETE FROM cierres_mes WHERE mes = $1`, [MES_PRUEBA]);
    } catch {
      /* ya no está */
    }
    if (idColab !== "") {
      try {
        await admin.auth.admin.deleteUser(idColab);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("ajustes_economia", () => {
  // La fila la escriben otros tests (`rentabilidad.test.ts` fija el coste y
  // lo restaura al terminar) y el propio propietario desde `/ajustes/economia`:
  // su VALOR no es un invariante del esquema. Lo que sí lo es: que haya una
  // sola fila y que el coste no sea negativo.
  it("tiene una sola fila", async () => {
    const { rows } = await pg.query(`SELECT id, coste_hora FROM ajustes_economia`);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].coste_hora)).toBeGreaterThanOrEqual(0);
  });

  it("no admite una segunda fila", async () => {
    await expect(pg.query(`INSERT INTO ajustes_economia (id) VALUES (2)`)).rejects.toThrow(/ajustes_economia_id_check/);
  });

  it("un colaborador no la ve", async () => {
    const { data } = await sbColab.from("ajustes_economia").select("coste_hora");
    expect(data).toEqual([]);
  });
});

describe("cierres_mes", () => {
  it("solo admite el día 1", async () => {
    await expect(pg.query(`INSERT INTO cierres_mes (mes, coste_hora) VALUES ('2091-01-15', 30)`)).rejects.toThrow(/cierres_mes_mes_check/);
  });

  it("un colaborador ni ve ni cierra", async () => {
    await pg.query(`INSERT INTO cierres_mes (mes, coste_hora) VALUES ($1, 30)`, [MES_PRUEBA]);
    const { data } = await sbColab.from("cierres_mes").select("mes").eq("mes", MES_PRUEBA);
    expect(data).toEqual([]);
    const { error } = await sbColab.from("cierres_mes").insert({ mes: "2091-02-01", coste_hora: 30 });
    expect(error?.message).toMatch(/row-level security/);
  });
});
