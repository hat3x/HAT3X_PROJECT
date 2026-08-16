import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { validarApariencia, escribirApariencia, obtenerPerfil } from "@/lib/db/perfil";
import { PALETAS } from "@/lib/tema/tokens";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("validación de apariencia", () => {
  it("acepta las diez combinaciones de tema y paleta", () => {
    for (const tema of ["claro", "oscuro"]) {
      for (const paleta of PALETAS) {
        expect(validarApariencia(tema, paleta).ok, `${tema}/${paleta}`).toBe(true);
      }
    }
  });

  it("rechaza un tema que no exista", () => {
    const r = validarApariencia("sepia", "zafiro");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tema/i);
  });

  it("rechaza una paleta que no exista", () => {
    const r = validarApariencia("oscuro", "fucsia");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/paleta/i);
  });

  // El selector manda strings que vienen del navegador: nadie garantiza que
  // sean uno de los diez válidos aunque la interfaz solo ofrezca esos.
  it("rechaza la cadena vacía en ambos campos", () => {
    expect(validarApariencia("", "zafiro").ok).toBe(false);
    expect(validarApariencia("oscuro", "").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Escritura de verdad, contra la base.
// ---------------------------------------------------------------------------

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sb: ReturnType<typeof createClient<Database>>;
let idUsuario = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const creado = await admin.auth.admin.createUser({
    email: "apariencia@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  // Sin es_propietario: cada cual manda sobre su propio aspecto.
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,false)`, [
    idUsuario,
  ]);

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "apar" },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "apariencia@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  if (idUsuario) await admin.auth.admin.deleteUser(idUsuario);
  await pg.end();
});

describe("escritura de apariencia", () => {
  it("empieza con el tema y la paleta por defecto del esquema", async () => {
    const perfil = await obtenerPerfil(sb);
    expect(perfil?.tema).toBe("oscuro");
    expect(perfil?.paleta).toBe("zafiro");
  });

  it("guarda la combinación elegida y se lee de vuelta", async () => {
    const r = await escribirApariencia(sb, "claro", "crepusculo");
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const perfil = await obtenerPerfil(sb);
    expect(perfil?.tema).toBe("claro");
    expect(perfil?.paleta).toBe("crepusculo");
  });

  it("no hace falta ser propietario: el aspecto es de cada cual", async () => {
    const { rows } = await pg.query(`SELECT es_propietario FROM perfiles WHERE id=$1`, [
      idUsuario,
    ]);
    expect(rows[0].es_propietario).toBe(false);
    expect((await escribirApariencia(sb, "oscuro", "oceano")).ok).toBe(true);
  });

  it("no escribe nada si la paleta no existe", async () => {
    const r = await escribirApariencia(sb, "oscuro", "fucsia");
    expect(r.ok).toBe(false);

    const perfil = await obtenerPerfil(sb);
    // Sigue con lo último válido: el rechazo no ha tocado la fila.
    expect(perfil?.paleta).toBe("oceano");
  });
});
