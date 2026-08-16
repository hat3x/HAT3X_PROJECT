import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  validarRol,
  listarUsuarios,
  escribirPermiso,
  quitarPermiso,
} from "@/lib/db/usuarios";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let sb: ReturnType<typeof createClient<Database>>;
let admin: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idEditor = "";
let idProyecto = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const duenyo = await admin.auth.admin.createUser({
    email: "duenyo@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (duenyo.error) throw duenyo.error;
  idDuenyo = duenyo.data.user.id;

  const editor = await admin.auth.admin.createUser({
    email: "editor@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (editor.error) throw editor.error;
  idEditor = editor.data.user.id;

  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1,'Dueño Prueba',true)`,
    [idDuenyo]
  );
  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1,'Editor Prueba',false)`,
    [idEditor]
  );

  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Proyecto Permisos','proy-permisos','interno','desarrollo') RETURNING id`
  );
  idProyecto = p.id;
  await pg.query(
    `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1,$2,'editor')`,
    [idEditor, idProyecto]
  );

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "usuarios" },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "duenyo@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM proyectos WHERE slug = 'proy-permisos'`);
  if (idDuenyo) await admin.auth.admin.deleteUser(idDuenyo);
  if (idEditor) await admin.auth.admin.deleteUser(idEditor);
  await pg.end();
});

describe("validación de rol", () => {
  it("acepta editor y lector", async () => {
    expect((await validarRol("editor")).ok).toBe(true);
    expect((await validarRol("lector")).ok).toBe(true);
  });

  it("rechaza «propietario»: no es un permiso por proyecto", async () => {
    const r = await validarRol("propietario");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/propietario/i);
  });

  it("rechaza cualquier otra cosa, incluidas las mayúsculas", async () => {
    for (const rol of ["admin", "root", "", "Editor", "LECTOR"]) {
      expect((await validarRol(rol)).ok, `debería rechazar «${rol}»`).toBe(false);
    }
  });
});

describe("listado de usuarios con sus permisos", () => {
  it("trae a cada persona con los proyectos a los que llega", async () => {
    const usuarios = await listarUsuarios(sb);
    const editor = usuarios.find((u) => u.id === idEditor);

    expect(editor).toBeDefined();
    expect(editor!.nombre).toBe("Editor Prueba");
    expect(editor!.esPropietario).toBe(false);
    expect(editor!.permisos).toHaveLength(1);
    expect(editor!.permisos[0]!.proyectoNombre).toBe("Proyecto Permisos");
    expect(editor!.permisos[0]!.rol).toBe("editor");
  });

  it("el propietario aparece sin permisos por proyecto: los tiene todos", async () => {
    const usuarios = await listarUsuarios(sb);
    const duenyo = usuarios.find((u) => u.id === idDuenyo);

    expect(duenyo!.esPropietario).toBe(true);
    expect(duenyo!.permisos).toEqual([]);
  });

  it("no saca correos ni nada de auth: solo lo que hay en el perfil", async () => {
    const usuarios = await listarUsuarios(sb);
    const editor = usuarios.find((u) => u.id === idEditor)!;
    expect(JSON.stringify(editor)).not.toContain("@atlas.test");
    expect(Object.keys(editor).sort()).toEqual([
      "esPropietario",
      "id",
      "nombre",
      "permisos",
    ]);
  });
});

describe("reparto de permisos", () => {
  it("cambiar de rol reasigna en vez de acumular filas", async () => {
    // El editor ya tiene 'editor' sobre este proyecto desde el beforeAll.
    const r = await escribirPermiso(sb, idEditor, idProyecto, "lector");
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT rol FROM permisos WHERE usuario_id=$1 AND proyecto_id=$2`,
      [idEditor, idProyecto]
    );
    expect(rows).toHaveLength(1); // una sola fila: ha reasignado
    expect(rows[0].rol).toBe("lector");
  });

  it("no escribe nada con un rol que no existe", async () => {
    const r = await escribirPermiso(sb, idEditor, idProyecto, "propietario");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/propietario/i);

    const { rows } = await pg.query(
      `SELECT rol FROM permisos WHERE usuario_id=$1 AND proyecto_id=$2`,
      [idEditor, idProyecto]
    );
    // Sigue como estaba: el rechazo no ha tocado nada.
    expect(rows[0].rol).toBe("lector");
  });

  it("quien no es propietario no reparte permisos", async () => {
    const sbEditor = createClient<Database>(URL_API, ANON, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "usu-editor" },
    });
    const { error } = await sbEditor.auth.signInWithPassword({
      email: "editor@atlas.test",
      password: "contrasena-de-prueba",
    });
    if (error) throw error;

    const r = await escribirPermiso(sbEditor, idDuenyo, idProyecto, "editor");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/propietario/i);
  });

  it("retirar el acceso lo borra", async () => {
    const r = await quitarPermiso(sb, idEditor, idProyecto);
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM permisos WHERE usuario_id=$1 AND proyecto_id=$2`,
      [idEditor, idProyecto]
    );
    expect(rows[0].n).toBe(0);
  });
});
