import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { listarClientes, obtenerCliente } from "@/lib/db/clientes";
import { listarProyectos } from "@/lib/db/proyectos";
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
let idJose = "";
let sbJose: ReturnType<typeof createClient<Database>>;
let admin: ReturnType<typeof createClient<Database>>;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  // El usuario se crea con la Admin API, NO con INSERT en auth.users: la
  // inserción directa deja el registro sin su fila en auth.identities y GoTrue
  // falla al iniciar sesión con «Database error querying schema».
  admin = createClient<Database>(URL_API, SERVICE, {
    auth: { persistSession: false },
  });
  const creado = await admin.auth.admin.createUser({
    email: "db@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idJose = creado.data.user.id;

  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1, 'DB', true)`,
    [idJose]
  );

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug, sector)
     VALUES ('Dental Demo','dental-demo','Odontología') RETURNING id`
  );
  const { rows: [p1] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Voz Demo','voz-demo-db','voz','produccion') RETURNING id`
  );
  const { rows: [p2] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Gestión Demo','gestion-demo-db','producto-propio','produccion')
     RETURNING id`
  );
  await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1,$2,290.00,'2026-05-01'), ($1,$3,60.00,'2026-08-05')`,
    [c.id, p1.id, p2.id]
  );
  await pg.query(
    `INSERT INTO contactos (cliente_id, nombre, rol)
     VALUES ($1,'Recepción','recepcion')`, [c.id]
  );

  sbJose = createClient<Database>(URL_API, ANON);
  const { error } = await sbJose.auth.signInWithPassword({
    email: "db@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM clientes  WHERE slug = 'dental-demo'`);
  await pg.query(`DELETE FROM proyectos WHERE slug LIKE '%-demo-db'`);
  if (idJose) await admin.auth.admin.deleteUser(idJose);
  await pg.end();
});

describe("capa de acceso a datos", () => {
  it("lista clientes con su cuota total y su número de proyectos", async () => {
    const lista = await listarClientes(sbJose);
    const demo = lista.find((c) => c.slug === "dental-demo");
    expect(demo).toBeDefined();
    expect(demo!.sector).toBe("Odontología");
    expect(demo!.numProyectos).toBe(2);
    // 290 + 60. El propietario sí ve importes.
    expect(demo!.cuotaTotal).toBe(350);
  });

  it("la ficha de un cliente trae contactos y contratos", async () => {
    const ficha = await obtenerCliente(sbJose, "dental-demo");
    expect(ficha).not.toBeNull();
    expect(ficha!.contactos.map((c) => c.nombre)).toEqual(["Recepción"]);
    expect(ficha!.contratos).toHaveLength(2);
    expect(ficha!.contratos.map((c) => c.alta).sort())
      .toEqual(["2026-05-01", "2026-08-05"]);
  });

  it("devuelve null cuando el slug no existe", async () => {
    expect(await obtenerCliente(sbJose, "no-existe-jamas")).toBeNull();
  });

  it("lista proyectos con cuántos clientes los tienen contratados", async () => {
    const lista = await listarProyectos(sbJose);
    const voz = lista.find((p) => p.slug === "voz-demo-db");
    expect(voz).toBeDefined();
    expect(voz!.tipo).toBe("voz");
    expect(voz!.numClientes).toBe(1);
  });
});

describe("propagación de errores", () => {
  // Sin sesión, el rol es `anon`, que no tiene GRANT sobre ninguna tabla. La
  // capa debe dejar salir el error en vez de tragárselo y devolver lista
  // vacía: una pantalla vacía por un fallo de permisos es indistinguible de
  // «no hay datos», y eso es exactamente lo que no queremos.
  //
  // persistSession + storageKey propio son imprescindibles: por defecto el
  // cliente guarda la sesión en localStorage, que en jsdom es compartido, y
  // este cliente heredaría la sesión del propietario sin que se note.
  const anonimo = createClient<Database>(URL_API, ANON, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: "atlas-test-sin-sesion",
    },
  });

  it("listarClientes propaga el error en lugar de devolver lista vacía", async () => {
    await expect(listarClientes(anonimo)).rejects.toThrow();
  });

  it("obtenerCliente propaga el error", async () => {
    await expect(obtenerCliente(anonimo, "dental-demo")).rejects.toThrow();
  });

  it("listarProyectos propaga el error", async () => {
    await expect(listarProyectos(anonimo)).rejects.toThrow();
  });
});
