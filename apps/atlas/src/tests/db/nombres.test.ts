import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { nombresDeClientes } from "@/lib/db/clientes";
import { nombresDeProyectos } from "@/lib/db/proyectos";
import type { Database } from "@/types/supabase";

// Valores fijos y públicos de Supabase local (`npx supabase status`).
// No son credenciales: son idénticos en todas las instalaciones.
const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let idUsuario = "";
let sbUsuario: ReturnType<typeof createClient<Database>>;
let admin: ReturnType<typeof createClient<Database>>;

// Nombres a propósito fuera de orden alfabético al insertarlos: si la consulta
// no llevara `.order("nombre")`, el test pasaría igual por casualidad del
// orden de inserción.
beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  admin = createClient<Database>(URL_API, SERVICE, {
    auth: { persistSession: false },
  });
  const creado = await admin.auth.admin.createUser({
    email: "nombres@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;

  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1, 'Nombres', true)`,
    [idUsuario]
  );

  await pg.query(
    `INSERT INTO clientes (nombre, slug, sector)
     VALUES ('Zeta Cliente','zeta-cliente-nombres-db','Odontología'),
            ('Alfa Cliente','alfa-cliente-nombres-db','Odontología')`
  );
  await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Zeta Proyecto','zeta-proyecto-nombres-db','voz','produccion'),
            ('Alfa Proyecto','alfa-proyecto-nombres-db','voz','produccion')`
  );

  sbUsuario = createClient<Database>(URL_API, ANON);
  const { error } = await sbUsuario.auth.signInWithPassword({
    email: "nombres@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM clientes  WHERE slug LIKE '%-nombres-db'`);
  await pg.query(`DELETE FROM proyectos WHERE slug LIKE '%-nombres-db'`);
  if (idUsuario) await admin.auth.admin.deleteUser(idUsuario);
  await pg.end();
});

describe("nombresDeClientes y nombresDeProyectos", () => {
  it("nombresDeClientes devuelve solo id y nombre, ordenado por nombre", async () => {
    const lista = await nombresDeClientes(sbUsuario);
    const propios = lista.filter((c) => c.nombre.endsWith("Cliente"));
    expect(propios.map((c) => c.nombre)).toEqual(["Alfa Cliente", "Zeta Cliente"]);
    // Sin campos de más: ni slug, ni sector, ni estado, ni cuotaTotal. Si
    // alguien vuelve a hacer esta función un alias de `listarClientes`,
    // este assert es el que lo pilla.
    for (const fila of propios) {
      expect(Object.keys(fila).sort()).toEqual(["id", "nombre"]);
    }
  });

  it("nombresDeProyectos devuelve solo id y nombre, ordenado por nombre", async () => {
    const lista = await nombresDeProyectos(sbUsuario);
    const propios = lista.filter((p) => p.nombre.endsWith("Proyecto"));
    expect(propios.map((p) => p.nombre)).toEqual(["Alfa Proyecto", "Zeta Proyecto"]);
    for (const fila of propios) {
      expect(Object.keys(fila).sort()).toEqual(["id", "nombre"]);
    }
  });
});
