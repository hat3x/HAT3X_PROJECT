import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  ordenarPorGravedad,
  contarEstados,
  cargarResumen,
  type FilaResumen,
} from "@/lib/db/resumen";
import type { EstadoCheck } from "@/lib/incidencias/maquina";
import type { Database } from "@/types/supabase";

function fila(
  nombre: string,
  estado: EstadoCheck,
  extra: Partial<FilaResumen> = {}
): FilaResumen {
  return {
    proyecto: {
      id: `id-${nombre}`,
      nombre,
      slug: nombre.toLowerCase(),
      tipo: "interno",
      estado: "produccion",
      portadaUrl: null,
      gradiente: null,
      numClientes: 1,
    },
    estado,
    serviciosOk: 1,
    serviciosTotal: 1,
    uptime30d: 100,
    peorError: null,
    cuota: null,
    ...extra,
  };
}

describe("lo roto sube solo", () => {
  it("primero lo caído, luego lo degradado, luego lo desconocido, y lo sano al final", () => {
    const orden = ordenarPorGravedad([
      fila("Sano", "ok"),
      fila("Desconocido", "desconocido"),
      fila("Caido", "caido"),
      fila("Degradado", "degradado"),
    ]);
    expect(orden.map((f) => f.proyecto.nombre)).toEqual([
      "Caido",
      "Degradado",
      "Desconocido",
      "Sano",
    ]);
  });

  it("a igualdad de estado, por nombre", () => {
    const orden = ordenarPorGravedad([
      fila("Zafiro", "caido"),
      fila("Atlas", "caido"),
      fila("Kairos", "caido"),
    ]);
    expect(orden.map((f) => f.proyecto.nombre)).toEqual(["Atlas", "Kairos", "Zafiro"]);
  });

  it("ordena sin tildes ni mayúsculas de por medio", () => {
    const orden = ordenarPorGravedad([
      fila("Ávila", "ok"),
      fila("atlas", "ok"),
      fila("Zamora", "ok"),
    ]);
    expect(orden.map((f) => f.proyecto.nombre)).toEqual(["atlas", "Ávila", "Zamora"]);
  });

  it("no revienta con la lista vacía", () => {
    expect(ordenarPorGravedad([])).toEqual([]);
  });

  // Ordenar no puede alterar lo que le pasan: la lista original se usa después
  // para los contadores.
  it("devuelve una lista nueva y no toca la original", () => {
    const original = [fila("Sano", "ok"), fila("Caido", "caido")];
    const orden = ordenarPorGravedad(original);

    expect(orden).not.toBe(original);
    expect(original.map((f) => f.proyecto.nombre)).toEqual(["Sano", "Caido"]);
  });
});

describe("contadores de la franja", () => {
  it("cuenta cada estado por separado", () => {
    const c = contarEstados([
      fila("A", "ok"),
      fila("B", "ok"),
      fila("C", "degradado"),
      fila("D", "caido"),
      fila("E", "desconocido"),
    ]);
    expect(c).toEqual({
      proyectos: 5,
      ok: 2,
      degradados: 1,
      caidos: 1,
      desconocidos: 1,
      uptimeMedio: 100,
    });
  });

  it("el uptime medio ignora los proyectos sin datos", () => {
    const c = contarEstados([
      fila("A", "ok", { uptime30d: 100 }),
      fila("B", "ok", { uptime30d: 98 }),
      fila("C", "desconocido", { uptime30d: null }),
    ]);
    expect(c.uptimeMedio).toBe(99);
  });

  it("sin ningún dato el uptime medio es null, no 0", () => {
    const c = contarEstados([fila("A", "desconocido", { uptime30d: null })]);
    expect(c.uptimeMedio).toBeNull();
  });

  it("sin proyectos, todo a cero y sin uptime", () => {
    expect(contarEstados([])).toEqual({
      proyectos: 0,
      ok: 0,
      degradados: 0,
      caidos: 0,
      desconocidos: 0,
      uptimeMedio: null,
    });
  });

  it("redondea el uptime medio a un decimal", () => {
    const c = contarEstados([
      fila("A", "ok", { uptime30d: 99.9 }),
      fila("B", "ok", { uptime30d: 98.2 }),
    ]);
    expect(c.uptimeMedio).toBe(99.1);
  });
});

// ---------------------------------------------------------------------------
// La consulta de verdad, contra la base.
// ---------------------------------------------------------------------------

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sb: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const creado = await admin.auth.admin.createUser({
    email: "duenyo-r@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idDuenyo = creado.data.user.id;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,true)`, [idDuenyo]);

  const {
    rows: [c],
  } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Cliente Resumen','cli-resumen')
     RETURNING id`
  );

  // Uno con un servicio caído y otro sano, para que el orden importe.
  const {
    rows: [caido],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('ZZ Caido','proy-resumen-caido','voz')
     RETURNING id`
  );
  const {
    rows: [sano],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('AA Sano','proy-resumen-sano','web-app')
     RETURNING id`
  );

  for (const [proyecto, estado] of [
    [caido.id, "caido"],
    [sano.id, "ok"],
  ] as const) {
    const {
      rows: [s],
    } = await pg.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1,'S','api') RETURNING id`,
      [proyecto]
    );
    await pg.query(
      `INSERT INTO checks (servicio_id, tipo, url, estado)
       VALUES ($1,'http','https://ejemplo.test',$2)`,
      [s.id, estado]
    );
  }

  await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1,$2,290.00,'2026-05-01')`,
    [c.id, caido.id]
  );

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "resumen" },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "duenyo-r@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM clientes  WHERE slug = 'cli-resumen'`);
  await pg.query(`DELETE FROM proyectos WHERE slug LIKE 'proy-resumen-%'`);
  if (idDuenyo) await admin.auth.admin.deleteUser(idDuenyo);
  await pg.end();
});

describe("carga del resumen desde la base", () => {
  it("trae el estado real de cada proyecto", async () => {
    const { filas } = await cargarResumen(sb, true);
    const caido = filas.find((f) => f.proyecto.slug === "proy-resumen-caido");
    const sano = filas.find((f) => f.proyecto.slug === "proy-resumen-sano");

    expect(caido?.estado).toBe("caido");
    expect(sano?.estado).toBe("ok");
    expect(sano?.serviciosOk).toBe(1);
    expect(sano?.serviciosTotal).toBe(1);
  });

  it("el propietario ve la cuota", async () => {
    const { filas } = await cargarResumen(sb, true);
    const caido = filas.find((f) => f.proyecto.slug === "proy-resumen-caido");
    expect(caido?.cuota).toBe(290);
  });

  it("sin permiso para los importes, la cuota no viaja siquiera", async () => {
    const { filas } = await cargarResumen(sb, false);
    for (const f of filas) expect(f.cuota).toBeNull();
  });

  // El punto de todo: el proyecto roto sale primero aunque su nombre empiece
  // por Z y el sano por A.
  it("ordenado, lo roto va delante del sano aunque alfabéticamente sea al revés", async () => {
    const { filas } = await cargarResumen(sb, true);
    const mios = ordenarPorGravedad(
      filas.filter((f) => f.proyecto.slug.startsWith("proy-resumen-"))
    );
    expect(mios[0]!.proyecto.slug).toBe("proy-resumen-caido");
    expect(mios[1]!.proyecto.slug).toBe("proy-resumen-sano");
  });

  it("los contadores cuadran con las filas", async () => {
    const { filas, contadores } = await cargarResumen(sb, true);
    expect(contadores.proyectos).toBe(filas.length);
    expect(contadores.caidos).toBe(filas.filter((f) => f.estado === "caido").length);
  });
});
