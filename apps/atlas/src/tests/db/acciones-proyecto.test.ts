import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  validarContrato,
  validarServicio,
  escribirContrato,
  escribirServicio,
} from "@/lib/db/proyectos";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const contratoBase = {
  clienteId: "11111111-1111-1111-1111-111111111111",
  proyectoId: "22222222-2222-2222-2222-222222222222",
  cuotaMensual: 290,
  addons: ["recepcionista-ia"],
  alta: "2026-05-01",
  baja: null,
  estado: "activo",
};

const servicioBase = {
  proyectoId: "22222222-2222-2222-2222-222222222222",
  clienteId: null,
  nombre: "Agente Retell",
  tipo: "agente-voz",
  proveedor: "retell",
};

describe("validación de contrato", () => {
  it("acepta un contrato correcto", () => {
    expect(validarContrato(contratoBase).ok).toBe(true);
  });

  it("acepta cuota nula: hay proyectos sin cargo", () => {
    expect(validarContrato({ ...contratoBase, cuotaMensual: null }).ok).toBe(true);
  });

  it("rechaza una cuota negativa", () => {
    const r = validarContrato({ ...contratoBase, cuotaMensual: -10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cuota/i);
  });

  it("exige formato ISO AAAA-MM-DD en las fechas", () => {
    for (const alta of ["01/05/2026", "2026-5-1", "hoy", "2026-13-01", "2026-02-31"]) {
      expect(
        validarContrato({ ...contratoBase, alta }).ok,
        `debería rechazar «${alta}»`
      ).toBe(false);
    }
  });

  it("exige el mismo formato en la baja", () => {
    const r = validarContrato({ ...contratoBase, baja: "01/06/2026" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/baja/i);
  });

  it("rechaza una baja anterior al alta", () => {
    const r = validarContrato({ ...contratoBase, baja: "2026-04-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/baja/i);
  });

  it("acepta una baja igual al alta", () => {
    expect(validarContrato({ ...contratoBase, baja: "2026-05-01" }).ok).toBe(true);
  });

  it("acepta los tres estados del esquema y rechaza cualquier otro", () => {
    for (const estado of ["activo", "pausado", "finalizado"]) {
      expect(validarContrato({ ...contratoBase, estado }).ok, estado).toBe(true);
    }
    const r = validarContrato({ ...contratoBase, estado: "moroso" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/estado/i);
  });
});

describe("validación de servicio", () => {
  it("acepta un servicio sin cliente: es del proyecto", () => {
    expect(validarServicio(servicioBase).ok).toBe(true);
  });

  it("rechaza el nombre vacío", () => {
    const r = validarServicio({ ...servicioBase, nombre: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/i);
  });

  it("rechaza un tipo que no exista en el esquema", () => {
    const r = validarServicio({ ...servicioBase, tipo: "inventado" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tipo/i);
  });

  it("acepta los diez tipos del esquema", () => {
    const tipos = [
      "web", "api", "webhook", "workflow", "agente-voz",
      "telefonia", "base-datos", "cron", "dominio", "otro",
    ];
    for (const tipo of tipos) {
      expect(validarServicio({ ...servicioBase, tipo }).ok, tipo).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Escritura de verdad, contra la base. Es lo que faltaba: hasta ahora ningún
// test metía una sola fila por este camino.
// ---------------------------------------------------------------------------

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbEditor: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idEditor = "";
let idCliente = "";
let idProyecto = "";

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

  const duenyo = await altaUsuario("duenyo-p@atlas.test", true, "esc-duenyo");
  idDuenyo = duenyo.id;
  sbDuenyo = duenyo.sb;

  const editor = await altaUsuario("editor-p@atlas.test", false, "esc-editor");
  idEditor = editor.id;
  sbEditor = editor.sb;

  const {
    rows: [c],
  } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Cliente Escrituras','cli-escrituras')
     RETURNING id`
  );
  idCliente = c.id;
  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Proyecto Escrituras','proy-escrituras','interno','desarrollo') RETURNING id`
  );
  idProyecto = p.id;
  // El editor necesita permiso sobre el proyecto para que RLS le deje escribir
  // servicios: es justo la asimetría que documenta el plan.
  await pg.query(
    `INSERT INTO permisos (usuario_id, proyecto_id, rol) VALUES ($1,$2,'editor')`,
    [idEditor, idProyecto]
  );
});

afterAll(async () => {
  await pg.query(`DELETE FROM clientes  WHERE slug = 'cli-escrituras'`);
  await pg.query(`DELETE FROM proyectos WHERE slug = 'proy-escrituras'`);
  if (idDuenyo) await admin.auth.admin.deleteUser(idDuenyo);
  if (idEditor) await admin.auth.admin.deleteUser(idEditor);
  await pg.end();
});

describe("escritura de contrato", () => {
  it("el propietario da de alta un contrato y queda guardado", async () => {
    const r = await escribirContrato(sbDuenyo, {
      clienteId: idCliente,
      proyectoId: idProyecto,
      cuotaMensual: 290,
      addons: ["recepcionista-ia"],
      alta: "2026-05-01",
      baja: null,
      estado: "activo",
    });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT cuota_mensual::float8 AS cuota, addons, estado
       FROM contratos WHERE proyecto_id = $1 AND alta = '2026-05-01'`,
      [idProyecto]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cuota).toBe(290);
    expect(rows[0].addons).toEqual(["recepcionista-ia"]);
  });

  it("repetir cliente, proyecto y alta da un mensaje entendible, no un 23505", async () => {
    const r = await escribirContrato(sbDuenyo, {
      clienteId: idCliente,
      proyectoId: idProyecto,
      cuotaMensual: 300,
      addons: [],
      alta: "2026-05-01",
      baja: null,
      estado: "activo",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya existe un contrato/i);
  });

  it("un editor NO puede dar de alta contratos: llevan dinero", async () => {
    const r = await escribirContrato(sbEditor, {
      clienteId: idCliente,
      proyectoId: idProyecto,
      cuotaMensual: 1,
      addons: [],
      alta: "2026-09-01",
      baja: null,
      estado: "activo",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/propietario/i);
  });

  it("no escribe nada si la validación falla", async () => {
    const r = await escribirContrato(sbDuenyo, {
      clienteId: idCliente,
      proyectoId: idProyecto,
      cuotaMensual: -5,
      addons: [],
      alta: "2026-12-01",
      baja: null,
      estado: "activo",
    });
    expect(r.ok).toBe(false);
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM contratos WHERE proyecto_id=$1 AND alta='2026-12-01'`,
      [idProyecto]
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("escritura de servicio", () => {
  it("guarda un servicio del proyecto, sin cliente", async () => {
    const r = await escribirServicio(sbDuenyo, {
      proyectoId: idProyecto,
      clienteId: null,
      nombre: "  Agente Retell  ",
      tipo: "agente-voz",
      proveedor: "retell",
    });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT nombre, cliente_id FROM servicios WHERE proyecto_id=$1 AND tipo='agente-voz'`,
      [idProyecto]
    );
    expect(rows).toHaveLength(1);
    // El nombre viaja recortado: los espacios de más son un descuido, no un dato.
    expect(rows[0].nombre).toBe("Agente Retell");
    expect(rows[0].cliente_id).toBeNull();
  });

  it("un editor SÍ puede: los servicios son su trabajo", async () => {
    const r = await escribirServicio(sbEditor, {
      proyectoId: idProyecto,
      clienteId: idCliente,
      nombre: "n8n 02-crear-cita",
      tipo: "workflow",
      proveedor: "n8n",
    });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT cliente_id FROM servicios WHERE proyecto_id=$1 AND tipo='workflow'`,
      [idProyecto]
    );
    expect(rows[0].cliente_id).toBe(idCliente);
  });

  it("no escribe nada si el tipo no existe", async () => {
    const r = await escribirServicio(sbDuenyo, {
      proyectoId: idProyecto,
      clienteId: null,
      nombre: "Inventado",
      tipo: "no-existe",
      proveedor: null,
    });
    expect(r.ok).toBe(false);
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM servicios WHERE proyecto_id=$1 AND nombre='Inventado'`,
      [idProyecto]
    );
    expect(rows[0].n).toBe(0);
  });
});
