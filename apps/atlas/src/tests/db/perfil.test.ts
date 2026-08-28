import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { obtenerPerfil } from "@/lib/db/perfil";
import type { Database } from "@/types/supabase";

// Valores fijos y públicos de Supabase local (`npx supabase status`).
const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let id = "";
let sb: ReturnType<typeof createClient<Database>>;
let admin: ReturnType<typeof createClient<Database>>;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // Con la Admin API, NO con INSERT en auth.users: la inserción directa deja el
  // registro sin su fila en auth.identities y GoTrue falla al iniciar sesión.
  admin = createClient<Database>(URL_API, SERVICE, {
    auth: { persistSession: false },
  });
  const creado = await admin.auth.admin.createUser({
    email: "perfil@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  id = creado.data.user.id;

  // Tema y paleta NO predeterminados a propósito: si obtenerPerfil devolviera
  // los valores por defecto en vez de los guardados, el test lo detecta.
  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario, tema, paleta)
     VALUES ($1,'Jose',true,'claro','oceano')`,
    [id]
  );

  sb = createClient<Database>(URL_API, ANON);
  const { error } = await sb.auth.signInWithPassword({
    email: "perfil@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  if (id) await admin.auth.admin.deleteUser(id);
  await pg.end();
});

describe("perfil", () => {
  it("devuelve nombre, condición de propietario y preferencias visuales", async () => {
    const p = await obtenerPerfil(sb);
    // Forma exacta a propósito: si alguien añade el correo al perfil, este test
    // tiene que fallar y obligar a pensárselo.
    expect(p).toEqual({
      id,
      nombre: "Jose",
      esPropietario: true,
      tema: "claro",
      paleta: "oceano",
      vista: "control",
    });
  });

  it("devuelve null sin sesión", async () => {
    // storageKey propio: por defecto el cliente lee la sesión de localStorage,
    // compartido en jsdom, y heredaría la de `sb` sin que se note.
    const anonimo = createClient<Database>(URL_API, ANON, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: "atlas-test-perfil-sin-sesion",
      },
    });
    expect(await obtenerPerfil(anonimo)).toBeNull();
  });
});
