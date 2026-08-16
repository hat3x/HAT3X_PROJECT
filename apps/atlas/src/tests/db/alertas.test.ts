import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { duracionDe, estaSilenciada, listarIncidencias } from "@/lib/db/alertas";
import type { Database } from "@/types/supabase";

const AHORA = Date.parse("2026-08-16T12:00:00.000Z");

describe("duración de una incidencia", () => {
  it("una que sigue abierta está en curso", () => {
    expect(duracionDe("2026-08-16T11:00:00.000Z", null, AHORA)).toBe("en curso");
  });

  it("minutos", () => {
    expect(duracionDe("2026-08-16T11:00:00.000Z", "2026-08-16T11:05:00.000Z", AHORA)).toBe(
      "5 min"
    );
  });

  it("horas y minutos", () => {
    expect(duracionDe("2026-08-16T09:00:00.000Z", "2026-08-16T11:15:00.000Z", AHORA)).toBe(
      "2 h 15 min"
    );
  });

  it("días y horas: a partir de ahí los minutos sobran", () => {
    expect(duracionDe("2026-08-13T08:00:00.000Z", "2026-08-16T12:30:00.000Z", AHORA)).toBe(
      "3 d 4 h"
    );
  });

  it("una hora justa no arrastra «0 min»", () => {
    expect(duracionDe("2026-08-16T10:00:00.000Z", "2026-08-16T11:00:00.000Z", AHORA)).toBe(
      "1 h"
    );
  });

  // Un parpadeo que se abre y se cierra en la misma comprobación existe, y
  // «0 min» se lee como un error.
  it("menos de un minuto lo dice con palabras", () => {
    expect(duracionDe("2026-08-16T11:00:00.000Z", "2026-08-16T11:00:30.000Z", AHORA)).toBe(
      "menos de 1 min"
    );
  });

  it("no inventa duraciones negativas si las fechas vienen al revés", () => {
    expect(duracionDe("2026-08-16T11:00:00.000Z", "2026-08-16T10:00:00.000Z", AHORA)).toBe(
      "menos de 1 min"
    );
  });
});

describe("si está silenciada ahora mismo", () => {
  it("sin fecha, no lo está", () => {
    expect(estaSilenciada(null, AHORA)).toBe(false);
  });

  it("con una fecha ya pasada, tampoco", () => {
    expect(estaSilenciada("2026-08-16T11:00:00.000Z", AHORA)).toBe(false);
  });

  it("con una fecha futura, sí", () => {
    expect(estaSilenciada("2026-08-16T13:00:00.000Z", AHORA)).toBe(true);
  });

  // «Hasta resolver» se guarda como infinity, que no es una fecha parseable.
  it("«infinity» cuenta como silenciada", () => {
    expect(estaSilenciada("infinity", AHORA)).toBe(true);
  });

  it("una fecha ilegible no silencia por accidente", () => {
    expect(estaSilenciada("mañana", AHORA)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El historial, contra la base.
// ---------------------------------------------------------------------------

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbEditor: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idEditor = "";
let idSuyo = "";

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

/** Un proyecto con su servicio, su check y una incidencia. Devuelve el id del proyecto. */
async function altaIncidencia(
  slug: string,
  severidad: "critica" | "aviso",
  cerrada: boolean
): Promise<string> {
  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ($1,$1,'interno') RETURNING id`,
    [slug]
  );
  const {
    rows: [s],
  } = await pg.query(
    `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1,'Servicio','api')
     RETURNING id`,
    [p.id]
  );
  const {
    rows: [c],
  } = await pg.query(
    `INSERT INTO checks (servicio_id, tipo, url) VALUES ($1,'http','https://ejemplo.test')
     RETURNING id`,
    [s.id]
  );
  await pg.query(
    `INSERT INTO incidencias (servicio_id, check_id, severidad, causa, abierta_en, cerrada_en)
     VALUES ($1,$2,$3,'HTTP 500', now() - interval '2 hours', $4)`,
    [s.id, c.id, severidad, cerrada ? new Date().toISOString() : null]
  );
  return p.id;
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const duenyo = await altaUsuario("duenyo-a@atlas.test", true, "alertas-duenyo");
  idDuenyo = duenyo.id;
  sbDuenyo = duenyo.sb;

  const editor = await altaUsuario("editor-a@atlas.test", false, "alertas-editor");
  idEditor = editor.id;
  sbEditor = editor.sb;

  idSuyo = await altaIncidencia("proy-alertas-suyo", "critica", false);
  await altaIncidencia("proy-alertas-ajeno", "aviso", true);

  // El editor solo llega a uno de los dos.
  await pg.query(
    `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1,$2,'lector')`,
    [idEditor, idSuyo]
  );
});

afterAll(async () => {
  await pg.query(`DELETE FROM proyectos WHERE slug LIKE 'proy-alertas-%'`);
  if (idDuenyo) await admin.auth.admin.deleteUser(idDuenyo);
  if (idEditor) await admin.auth.admin.deleteUser(idEditor);
  await pg.end();
});

describe("historial de alertas", () => {
  it("el propietario ve las dos", async () => {
    const lista = await listarIncidencias(sbDuenyo, {});
    const mias = lista.filter((i) => i.proyectoSlug.startsWith("proy-alertas-"));
    expect(mias).toHaveLength(2);
  });

  // Lo garantiza RLS, no el filtro: se comprueba, no se supone.
  it("un lector NO ve las incidencias de proyectos que no son suyos", async () => {
    const lista = await listarIncidencias(sbEditor, {});
    const mias = lista.filter((i) => i.proyectoSlug.startsWith("proy-alertas-"));

    expect(mias).toHaveLength(1);
    expect(mias[0]!.proyectoSlug).toBe("proy-alertas-suyo");
  });

  it("trae el nombre del proyecto y del servicio, no solo identificadores", async () => {
    const lista = await listarIncidencias(sbDuenyo, {});
    const suya = lista.find((i) => i.proyectoSlug === "proy-alertas-suyo");

    expect(suya?.proyectoNombre).toBe("proy-alertas-suyo");
    expect(suya?.servicioNombre).toBe("Servicio");
    expect(suya?.causa).toBe("HTTP 500");
  });

  it("filtra por severidad", async () => {
    const criticas = await listarIncidencias(sbDuenyo, { severidad: "critica" });
    const mias = criticas.filter((i) => i.proyectoSlug.startsWith("proy-alertas-"));

    expect(mias).toHaveLength(1);
    expect(mias[0]!.severidad).toBe("critica");
  });

  it("filtra por proyecto", async () => {
    const lista = await listarIncidencias(sbDuenyo, { proyecto: "proy-alertas-ajeno" });
    const mias = lista.filter((i) => i.proyectoSlug.startsWith("proy-alertas-"));

    expect(mias).toHaveLength(1);
    expect(mias[0]!.proyectoSlug).toBe("proy-alertas-ajeno");
  });

  it("filtra las que siguen abiertas", async () => {
    const lista = await listarIncidencias(sbDuenyo, { abiertas: true });
    const mias = lista.filter((i) => i.proyectoSlug.startsWith("proy-alertas-"));

    expect(mias).toHaveLength(1);
    expect(mias[0]!.cerradaEn).toBeNull();
  });

  it("un filtro que no casa con nada devuelve lista vacía, no revienta", async () => {
    expect(await listarIncidencias(sbDuenyo, { proyecto: "no-existe" })).toEqual([]);
  });

  it("las más recientes primero", async () => {
    const lista = await listarIncidencias(sbDuenyo, {});
    const fechas = lista.map((i) => Date.parse(i.abiertaEn));
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas);
  });
});
