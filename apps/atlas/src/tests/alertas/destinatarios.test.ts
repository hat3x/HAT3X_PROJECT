import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { quienRecibe, type Persona } from "@/lib/alertas/destinatarios";
import { cargarPersonas } from "@/lib/db/personas";
import type { Database } from "@/types/supabase";

const duenyo: Persona = { id: "u-duenyo", esPropietario: true, proyectos: [] };
const editor: Persona = { id: "u-editor", esPropietario: false, proyectos: ["p1"] };
const ajeno: Persona = { id: "u-ajeno", esPropietario: false, proyectos: ["p2"] };

describe("destinatarios de un aviso", () => {
  it("el propietario lo recibe todo, aunque no tenga permisos por proyecto", () => {
    expect(quienRecibe("p1", [duenyo])).toEqual(["u-duenyo"]);
    expect(quienRecibe("p9", [duenyo])).toEqual(["u-duenyo"]);
  });

  it("quien tiene permiso sobre el proyecto lo recibe", () => {
    expect(quienRecibe("p1", [editor])).toEqual(["u-editor"]);
  });

  it("quien no tiene permiso NO lo recibe", () => {
    expect(quienRecibe("p1", [ajeno])).toEqual([]);
  });

  it("no duplica al propietario que además tiene permiso explícito", () => {
    const duenyoConPermiso: Persona = { ...duenyo, proyectos: ["p1"] };
    expect(quienRecibe("p1", [duenyoConPermiso])).toEqual(["u-duenyo"]);
  });

  it("sin nadie configurado no revienta: devuelve lista vacía", () => {
    expect(quienRecibe("p1", [])).toEqual([]);
  });

  it("mezcla: solo el propietario y quien tiene permiso", () => {
    expect(quienRecibe("p1", [duenyo, editor, ajeno]).sort()).toEqual([
      "u-duenyo",
      "u-editor",
    ]);
  });

  // Recibir alertas de proyectos que no puedes ni abrir no es solo ruido:
  // filtra qué clientes tienes.
  it("un lector con varios proyectos solo recibe los suyos", () => {
    const lector: Persona = {
      id: "u-lector",
      esPropietario: false,
      proyectos: ["p1", "p3"],
    };
    expect(quienRecibe("p3", [lector])).toEqual(["u-lector"]);
    expect(quienRecibe("p2", [lector])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Carga desde la base.
// ---------------------------------------------------------------------------

const URL_API = "http://127.0.0.1:54321";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idEditor = "";
let idProyecto = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  for (const [correo, propietario] of [
    ["duenyo-d@atlas.test", true],
    ["editor-d@atlas.test", false],
  ] as const) {
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
    if (propietario) idDuenyo = creado.data.user.id;
    else idEditor = creado.data.user.id;
  }

  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Dest','proy-destinatarios','interno')
     RETURNING id`
  );
  idProyecto = p.id;
  await pg.query(
    `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1,$2,'editor')`,
    [idEditor, idProyecto]
  );
});

afterAll(async () => {
  await pg.query(`DELETE FROM proyectos WHERE slug = 'proy-destinatarios'`);
  if (idDuenyo) await admin.auth.admin.deleteUser(idDuenyo);
  if (idEditor) await admin.auth.admin.deleteUser(idEditor);
  await pg.end();
});

describe("carga de personas desde la base", () => {
  it("trae a cada persona con sus proyectos", async () => {
    const personas = await cargarPersonas(admin);
    const duenyo = personas.find((p) => p.id === idDuenyo);
    const editor = personas.find((p) => p.id === idEditor);

    expect(duenyo?.esPropietario).toBe(true);
    expect(editor?.esPropietario).toBe(false);
    expect(editor?.proyectos).toContain(idProyecto);
  });

  it("lo cargado sirve tal cual para decidir destinatarios", async () => {
    const personas = await cargarPersonas(admin);
    const reciben = quienRecibe(idProyecto, personas);
    expect(reciben).toContain(idDuenyo);
    expect(reciben).toContain(idEditor);
  });

  it("no saca correos: solo lo que hay en el perfil", async () => {
    const personas = await cargarPersonas(admin);
    expect(JSON.stringify(personas)).not.toContain("@atlas.test");
  });
});
