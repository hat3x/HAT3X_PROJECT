import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { serviciosDeCliente } from "@/lib/db/clientes";
import type { Database } from "@/types/supabase";

// Valores fijos y públicos de Supabase local (`npx supabase status`).
const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sb: ReturnType<typeof createClient<Database>>;
let idUsuario = "";
let idUno = "";
let idDos = "";
let idVacio = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const creado = await admin.auth.admin.createUser({
    email: "cliservicios@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1,'CliSrv',true)`,
    [idUsuario]
  );

  const { rows: [uno] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Cliente Uno','cli-uno-srv') RETURNING id`
  );
  const { rows: [dos] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Cliente Dos','cli-dos-srv') RETURNING id`
  );
  // El que no tiene nada se crea aquí y no dentro del `it`: si un test anterior
  // aborta, el de dentro se queda a medias y el siguiente intento choca contra
  // el slug único.
  const { rows: [vacio] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Sin Nada','cli-vacio-srv') RETURNING id`
  );
  idUno = uno.id;
  idDos = dos.id;
  idVacio = vacio.id;

  const { rows: [proy] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Proyecto Servicios','proy-cli-srv','producto-propio','produccion') RETURNING id`
  );

  // Dos del primero, uno del segundo y uno SIN cliente: el de plataforma no
  // debe aparecer en la ficha de nadie.
  await pg.query(
    `INSERT INTO servicios (proyecto_id, cliente_id, nombre, tipo) VALUES
       ($1,$2,'Reservas Uno','api'),
       ($1,$2,'Agente Uno','agente-voz'),
       ($1,$3,'Reservas Dos','api'),
       ($1,NULL,'Base de datos comun','base-datos')`,
    [proy.id, idUno, idDos]
  );

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "cliservicios" },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "cliservicios@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM proyectos WHERE slug = 'proy-cli-srv'`);
  await pg.query(
    `DELETE FROM clientes WHERE slug IN ('cli-uno-srv','cli-dos-srv','cli-vacio-srv')`
  );
  if (idUsuario) await admin.auth.admin.deleteUser(idUsuario);
  await pg.end();
});

describe("servicios de un cliente", () => {
  it("devuelve los suyos con el proyecto al que pertenecen", async () => {
    const suyos = await serviciosDeCliente(sb, idUno);

    expect(suyos.map((s) => s.nombre)).toEqual(["Agente Uno", "Reservas Uno"]);
    expect(suyos[0]!.proyectoNombre).toBe("Proyecto Servicios");
    expect(suyos[0]!.proyectoSlug).toBe("proy-cli-srv");
    expect(suyos[0]!.tipo).toBe("agente-voz");
  });

  it("no mezcla los de otro cliente", async () => {
    const suyos = await serviciosDeCliente(sb, idDos);
    expect(suyos.map((s) => s.nombre)).toEqual(["Reservas Dos"]);
  });

  // Kairos tiene servicios de plataforma —la web, la base— que no son de ningún
  // cliente. Colarlos en una ficha diría que a ese cliente le afecta algo que
  // en realidad es común a todos.
  it("deja fuera los servicios sin cliente", async () => {
    const todos = [
      ...(await serviciosDeCliente(sb, idUno)),
      ...(await serviciosDeCliente(sb, idDos)),
    ];
    expect(todos.map((s) => s.nombre)).not.toContain("Base de datos comun");
  });

  it("un cliente sin servicios devuelve la lista vacía", async () => {
    expect(await serviciosDeCliente(sb, idVacio)).toEqual([]);
  });
});
