import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { validarEntradaCliente, escribirCliente } from "@/lib/db/clientes";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("validación de un cliente", () => {
  it("acepta lo mínimo imprescindible", () => {
    expect(validarEntradaCliente({ nombre: "Dental Demo", slug: "dental-demo" }).ok).toBe(
      true
    );
  });

  it("rechaza el nombre vacío", () => {
    const r = validarEntradaCliente({ nombre: "  ", slug: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/i);
  });

  it("rechaza un slug con mayúsculas, espacios, acentos o guion bajo", () => {
    for (const slug of ["Dental Demo", "dental demo", "dentál-demo", "dental_demo"]) {
      expect(
        validarEntradaCliente({ nombre: "X", slug }).ok,
        `debería rechazar «${slug}»`
      ).toBe(false);
    }
  });

  it("acepta slugs con minúsculas, números y guiones", () => {
    expect(validarEntradaCliente({ nombre: "X", slug: "100-montaditos" }).ok).toBe(true);
  });

  it("rechaza un estado que no exista", () => {
    const r = validarEntradaCliente({ nombre: "X", slug: "x", estado: "moroso" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/estado/i);
  });
});

// ---------------------------------------------------------------------------
// Escritura de verdad, contra la base.
// ---------------------------------------------------------------------------

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbEditor: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idEditor = "";

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
  return { id: creado.data.user.id, sb };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const duenyo = await altaUsuario("duenyo-c@atlas.test", true, "cli-duenyo");
  idDuenyo = duenyo.id;
  sbDuenyo = duenyo.sb;

  const editor = await altaUsuario("editor-c@atlas.test", false, "cli-editor");
  idEditor = editor.id;
  sbEditor = editor.sb;
});

afterAll(async () => {
  await pg.query(`DELETE FROM clientes WHERE slug LIKE 'cli-escritura-%'`);
  if (idDuenyo) await admin.auth.admin.deleteUser(idDuenyo);
  if (idEditor) await admin.auth.admin.deleteUser(idEditor);
  await pg.end();
});

describe("escritura de cliente", () => {
  it("el propietario da de alta y los campos vacíos quedan a null", async () => {
    const r = await escribirCliente(sbDuenyo, {
      nombre: "  Club Escritura  ",
      slug: "cli-escritura-club",
    });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT nombre, estado, sector, cif FROM clientes WHERE slug='cli-escritura-club'`
    );
    expect(rows).toHaveLength(1);
    // El nombre viaja recortado: los espacios de más son un descuido, no un dato.
    expect(rows[0].nombre).toBe("Club Escritura");
    expect(rows[0].estado).toBe("activo"); // el que pone por defecto
    expect(rows[0].sector).toBeNull();
    expect(rows[0].cif).toBeNull();
  });

  it("guarda la ficha completa cuando la das", async () => {
    const r = await escribirCliente(sbDuenyo, {
      nombre: "Dental Escritura",
      slug: "cli-escritura-dental",
      sector: "odontologia",
      estado: "potencial",
      razonSocial: "Dental Escritura SL",
      cif: "B00000000",
      direccion: "Calle Falsa 1",
    });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT sector, estado, razon_social, cif, direccion
       FROM clientes WHERE slug='cli-escritura-dental'`
    );
    expect(rows[0]).toEqual({
      sector: "odontologia",
      estado: "potencial",
      razon_social: "Dental Escritura SL",
      cif: "B00000000",
      direccion: "Calle Falsa 1",
    });
  });

  it("un identificador repetido da un mensaje entendible, no un 23505", async () => {
    const r = await escribirCliente(sbDuenyo, {
      nombre: "Otro",
      slug: "cli-escritura-club",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya existe un cliente/i);
  });

  it("un editor no puede dar de alta clientes", async () => {
    const r = await escribirCliente(sbEditor, {
      nombre: "Prohibido",
      slug: "cli-escritura-prohibido",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/propietario/i);

    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM clientes WHERE slug='cli-escritura-prohibido'`
    );
    expect(rows[0].n).toBe(0);
  });

  it("actualiza en vez de insertar cuando le pasas un id", async () => {
    const { rows: previas } = await pg.query(
      `SELECT id FROM clientes WHERE slug='cli-escritura-club'`
    );
    const r = await escribirCliente(
      sbDuenyo,
      {
        nombre: "Club Escritura Renombrado",
        slug: "cli-escritura-club",
        estado: "pausado",
      },
      previas[0].id
    );
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT nombre, estado FROM clientes WHERE slug='cli-escritura-club'`
    );
    // Una sola fila: ha actualizado, no ha duplicado.
    expect(rows).toHaveLength(1);
    expect(rows[0].nombre).toBe("Club Escritura Renombrado");
    expect(rows[0].estado).toBe("pausado");
  });
});
