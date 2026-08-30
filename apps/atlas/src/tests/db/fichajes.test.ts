// src/tests/db/fichajes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  validarTramo,
  fichajeEnCurso,
  empezar,
  parar,
  anadirTramo,
  listarTramos,
  borrarTramo,
  ultimoInicio,
  NOTA_TOPE,
} from "@/lib/db/fichajes";
import { TOPE_HORAS } from "@/lib/horas/abiertos";
import type { Database } from "@/types/supabase";
import type { Tramo } from "@/lib/horas/tramos";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const CORREO_DUENYO = "duenyo-fichajes-db@atlas.test";
const CORREO_COLAB = "colab-fichajes-db@atlas.test";
const SLUG_PROYECTO = "fichajes-prueba";
const SLUG_CLIENTE = "fichajes-prueba";

const AHORA = Date.parse("2026-08-31T20:00:00Z");
const RANGO = { desde: "2026-08-01T00:00:00Z", hasta: "2026-09-01T00:00:00Z" };

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idColab = "";
let idProyecto = "";
let idCliente = "";

// El propietario ve TODAS las filas de `fichajes`, no solo las de este fichero;
// sin este filtro, otro test que inserte en el mismo rango de fechas (p.ej.
// `esquema/fichajes.test.ts`) podría colarse en el aserto.
function soloMios(tramos: Tramo[]): Tramo[] {
  const mios = new Set([idDuenyo, idColab]);
  return tramos.filter((t) => mios.has(t.usuarioId));
}

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  await pg.query(`INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1,$2,$3)`, [
    creado.data.user.id,
    propietario ? "Dueño" : "Colab",
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
  return { sb, id: creado.data.user.id };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza defensiva, también ANTES de crear: un fichero que solo limpia al
  // final queda inservible para siempre si una corrida se corta a medias.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
      await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await pg.query(`DELETE FROM proyectos WHERE slug = $1`, [SLUG_PROYECTO]);
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);

  const d = await altaUsuario(CORREO_DUENYO, true, "fd-d");
  const c = await altaUsuario(CORREO_COLAB, false, "fd-c");
  sbDuenyo = d.sb;
  idDuenyo = d.id;
  sbColab = c.sb;
  idColab = c.id;

  // El check de `proyectos.tipo` es un conjunto cerrado; 'web-app' es el valor
  // válido más parecido a "web" (ver 20260815100000_nucleo.sql).
  const p = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado) VALUES ('Fichajes prueba', $1, 'web-app', 'produccion') RETURNING id`,
    [SLUG_PROYECTO]
  );
  idProyecto = p.rows[0].id;
  const cl = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Cliente fichajes', $1) RETURNING id`,
    [SLUG_CLIENTE]
  );
  idCliente = cl.rows[0].id;
});

beforeEach(async () => {
  for (const id of [idDuenyo, idColab]) {
    if (id !== "") await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [id]);
  }
});

afterAll(async () => {
  try {
    for (const id of [idDuenyo, idColab]) {
      if (id === "") continue;
      try {
        await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [id]);
      } catch {
        /* ya no está */
      }
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        /* ya no está */
      }
    }
    if (idProyecto !== "") {
      try {
        await pg.query(`DELETE FROM proyectos WHERE id = $1`, [idProyecto]);
      } catch {
        /* ya no está */
      }
    }
    if (idCliente !== "") {
      try {
        await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("validarTramo", () => {
  const base = { proyectoId: null, clienteId: null, nota: null };
  it("acepta un tramo cerrado en el pasado", () => {
    expect(
      validarTramo({ ...base, inicio: "2026-08-31T08:00:00Z", fin: "2026-08-31T10:00:00Z" }, AHORA)
    ).toEqual({ ok: true });
  });
  it("rechaza fin antes o igual que inicio", () => {
    const r = validarTramo({ ...base, inicio: "2026-08-31T10:00:00Z", fin: "2026-08-31T10:00:00Z" }, AHORA);
    expect(r.ok).toBe(false);
  });
  it("rechaza un fin en el futuro: no se recuerda lo que aún no ha pasado", () => {
    const r = validarTramo({ ...base, inicio: "2026-08-31T19:00:00Z", fin: "2026-08-31T21:00:00Z" }, AHORA);
    expect(r).toEqual({ ok: false, error: "El fin no puede estar en el futuro." });
  });
  it("rechaza más del tope: un tramo de 20 horas no es un tramo, es un olvido", () => {
    const r = validarTramo({ ...base, inicio: "2026-08-30T00:00:00Z", fin: "2026-08-30T20:00:00Z" }, AHORA);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/16 horas/);
  });
  it("rechaza fechas que no lo son", () => {
    expect(validarTramo({ ...base, inicio: "ayer", fin: "hoy" }, AHORA).ok).toBe(false);
  });
});

describe("fichar", () => {
  it("empezar deja uno en curso, con su proyecto y su cliente", async () => {
    const r = await empezar(sbDuenyo, { proyectoId: idProyecto, clienteId: idCliente, nota: null });
    expect(r).toEqual({ ok: true });
    const en = await fichajeEnCurso(sbDuenyo);
    expect(en?.fin).toBeNull();
    expect(en?.proyectoNombre).toBe("Fichajes prueba");
    expect(en?.clienteNombre).toBe("Cliente fichajes");
    expect(en?.origen).toBe("atlas");
  });

  it("empezar dos veces falla con un mensaje que se entiende", async () => {
    await empezar(sbDuenyo, { proyectoId: null, clienteId: null, nota: null });
    const r = await empezar(sbDuenyo, { proyectoId: null, clienteId: null, nota: null });
    expect(r).toEqual({ ok: false, error: "Ya tienes un fichaje en curso. Páralo antes de empezar otro." });
  });

  it("parar cierra el que estaba en curso", async () => {
    await empezar(sbDuenyo, { proyectoId: null, clienteId: null, nota: null });
    const r = await parar(sbDuenyo, Date.now());
    expect(r).toEqual({ ok: true });
    expect(await fichajeEnCurso(sbDuenyo)).toBeNull();
  });

  it("parar uno de dos horas cierra en ahora y sigue siendo medido", async () => {
    // El inicio se pone a mano por SQL: `empezar` siempre ficha en `now()`.
    const inicio = new Date(AHORA - 2 * 3_600_000).toISOString();
    await pg.query(`INSERT INTO fichajes (usuario_id, inicio) VALUES ($1, $2)`, [idDuenyo, inicio]);
    expect(await parar(sbDuenyo, AHORA)).toEqual({ ok: true });
    const [t] = soloMios(await listarTramos(sbDuenyo, RANGO));
    expect(Date.parse(t!.fin!)).toBe(AHORA);
    expect(t!.origen).toBe("atlas");
    expect(t!.nota).toBeNull();
  });

  it("parar uno de veinte horas cierra en inicio + tope, como añadido y con nota", async () => {
    // Un olvido de 20 h no son 20 h medidas ni 16 h medidas: el fin se
    // reconstruye, y el tramo tiene que decirlo para poder corregirlo.
    const inicio = new Date(AHORA - 20 * 3_600_000).toISOString();
    await pg.query(`INSERT INTO fichajes (usuario_id, inicio, nota) VALUES ($1, $2, 'reunión')`, [idDuenyo, inicio]);
    expect(await parar(sbDuenyo, AHORA)).toEqual({ ok: true });
    const [t] = soloMios(await listarTramos(sbDuenyo, RANGO));
    expect(Date.parse(t!.fin!)).toBe(Date.parse(inicio) + TOPE_HORAS * 3_600_000);
    expect(t!.origen).toBe("anadido");
    // La nota de la persona no se pierde: el aviso del tope se antepone.
    expect(t!.nota).toBe(`${NOTA_TOPE} · reunión`);
  });

  it("parar sin nada en curso lo dice, no finge", async () => {
    const r = await parar(sbDuenyo, Date.now());
    expect(r).toEqual({ ok: false, error: "No hay ningún fichaje en curso." });
  });

  it("borrar un tramo propio lo quita; uno inexistente lo dice", async () => {
    await anadirTramo(
      sbDuenyo,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T08:00:00Z", fin: "2026-08-31T09:00:00Z" },
      AHORA
    );
    const [t] = soloMios(await listarTramos(sbDuenyo, RANGO));
    expect(await borrarTramo(sbDuenyo, t!.id)).toEqual({ ok: true });
    expect(soloMios(await listarTramos(sbDuenyo, RANGO))).toEqual([]);
    const otra = await borrarTramo(sbDuenyo, t!.id);
    expect(otra.ok).toBe(false);
  });

  it("el último inicio sale de cualquier mes, no solo del rango en pantalla", async () => {
    // Un tramo de julio: el día 1 de agosto, el listado del mes está vacío
    // pero «Último fichaje» no puede decir «Nunca».
    await anadirTramo(
      sbColab,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-07-30T08:00:00Z", fin: "2026-07-30T09:00:00Z" },
      AHORA
    );
    expect(soloMios(await listarTramos(sbColab, RANGO))).toEqual([]);
    const u = await ultimoInicio(sbColab);
    expect(u).not.toBeNull();
    expect(Date.parse(u!)).toBe(Date.parse("2026-07-30T08:00:00Z"));
  });

  it("un tramo añadido queda marcado como añadido", async () => {
    const r = await anadirTramo(
      sbDuenyo,
      { proyectoId: null, clienteId: idCliente, nota: "llamada", inicio: "2026-08-31T08:00:00Z", fin: "2026-08-31T09:00:00Z" },
      AHORA
    );
    expect(r).toEqual({ ok: true });
    const [t] = soloMios(await listarTramos(sbDuenyo, RANGO));
    expect(t?.origen).toBe("anadido");
    expect(t?.nota).toBe("llamada");
  });

  it("un tramo inválido no llega a la base", async () => {
    const r = await anadirTramo(
      sbDuenyo,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T10:00:00Z", fin: "2026-08-31T09:00:00Z" },
      AHORA
    );
    expect(r.ok).toBe(false);
    expect(soloMios(await listarTramos(sbDuenyo, RANGO))).toEqual([]);
  });
});

describe("quién ve qué (RLS, con usuarios reales)", () => {
  it("el colaborador ficha lo suyo y solo ve lo suyo; el propietario ve a los dos", async () => {
    await anadirTramo(
      sbColab,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T08:00:00Z", fin: "2026-08-31T09:00:00Z" },
      AHORA
    );
    await anadirTramo(
      sbDuenyo,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T10:00:00Z", fin: "2026-08-31T11:00:00Z" },
      AHORA
    );
    const veColab = soloMios(await listarTramos(sbColab, RANGO));
    expect(veColab.map((t) => t.usuarioId)).toEqual([idColab]);
    const veDuenyo = soloMios(await listarTramos(sbDuenyo, RANGO));
    expect(veDuenyo).toHaveLength(2);
    // El nombre viaja con el tramo: el propietario sabe de quién es cada hora.
    expect(veDuenyo.map((t) => t.usuarioNombre).sort()).toEqual(["Colab", "Dueño"]);
  });

  it("el colaborador no puede borrar el tramo del dueño; el suyo sí", async () => {
    await anadirTramo(
      sbDuenyo,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T10:00:00Z", fin: "2026-08-31T11:00:00Z" },
      AHORA
    );
    await anadirTramo(
      sbColab,
      { proyectoId: null, clienteId: null, nota: null, inicio: "2026-08-31T08:00:00Z", fin: "2026-08-31T09:00:00Z" },
      AHORA
    );
    const delDuenyo = soloMios(await listarTramos(sbDuenyo, RANGO)).find((t) => t.usuarioId === idDuenyo);
    const delColab = soloMios(await listarTramos(sbColab, RANGO)).find((t) => t.usuarioId === idColab);
    // RLS no le deja ver la fila ajena, así que el DELETE no borra nada: 0
    // filas, y la función lo dice en vez de fingir.
    expect((await borrarTramo(sbColab, delDuenyo!.id)).ok).toBe(false);
    expect(soloMios(await listarTramos(sbDuenyo, RANGO))).toHaveLength(2);
    expect(await borrarTramo(sbColab, delColab!.id)).toEqual({ ok: true });
    expect(soloMios(await listarTramos(sbDuenyo, RANGO)).map((t) => t.usuarioId)).toEqual([idDuenyo]);
  });

  it("un proyecto que el colaborador no puede ver no le esconde su propio fichaje", async () => {
    // Sin `permisos` sobre el proyecto, RLS le oculta la fila de `proyectos`.
    // La unión tiene que ser externa: el tramo aparece, con el nombre a null.
    await empezar(sbColab, { proyectoId: idProyecto, clienteId: null, nota: null });
    const en = await fichajeEnCurso(sbColab);
    expect(en).not.toBeNull();
    expect(en?.proyectoId).toBe(idProyecto);
    expect(en?.proyectoNombre).toBeNull();
  });
});
