import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { listarFacturas, obtenerFactura } from "@/lib/db/facturas";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
const usuarios: string[] = [];
let idCliente = "";
let idFactura = "";

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  usuarios.push(creado.data.user.id);
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
  return sb;
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  sbDuenyo = await altaUsuario("duenyo-facturas@atlas.test", true, "df");
  sbColaborador = await altaUsuario("colab-facturas@atlas.test", false, "cf");

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Biodental Prueba','biodental-prueba')
     RETURNING id`
  );
  idCliente = c.id;

  const { rows: [f] } = await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           fecha_vencimiento, base, iva_cuota, total)
     VALUES ('externa','BIO',1,$1,'2026-08-04','2026-09-04',350,73.5,423.5)
     RETURNING id`,
    [idCliente]
  );
  idFactura = f.id;

  await pg.query(
    `INSERT INTO factura_lineas (factura_id, orden, concepto, precio_unitario, importe)
     VALUES ($1,0,'Recepcionista IA Sara',290,290),
            ($1,1,'App de gestión Kairos',60,60)`,
    [idFactura]
  );

  // Una cobrada, para poder filtrar.
  await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           base, iva_cuota, total, cobrada_en)
     VALUES ('externa','BIO',2,$1,'2026-07-04',350,73.5,423.5,'2026-07-20')`,
    [idCliente]
  );
});

afterAll(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  for (const id of usuarios) await admin.auth.admin.deleteUser(id);
  await pg.end();
});

describe("listar facturas", () => {
  it("trae las del cliente, la más reciente primero", async () => {
    const fs = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(fs).toHaveLength(2);
    expect(fs[0]!.numero).toBe(1);
    expect(fs[0]!.clienteNombre).toBe("Biodental Prueba");
  });

  it("trae las líneas, en orden", async () => {
    const [f] = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(f!.lineas.map((l) => l.concepto)).toEqual([
      "Recepcionista IA Sara",
      "App de gestión Kairos",
    ]);
  });

  it("filtra las que faltan por cobrar", async () => {
    const fs = await listarFacturas(sbDuenyo, { clienteId: idCliente, sinCobrar: true });
    expect(fs).toHaveLength(1);
    expect(fs[0]!.numero).toBe(1);
  });

  // No filtra la consulta: de eso se encarga RLS, y se comprueba en vez de
  // suponerse.
  it("un colaborador no ve ninguna factura", async () => {
    expect(await listarFacturas(sbColaborador, {})).toEqual([]);
  });
});

describe("obtener una factura", () => {
  it("la trae con sus líneas", async () => {
    const f = await obtenerFactura(sbDuenyo, idFactura);
    expect(f!.total).toBe(423.5);
    expect(f!.lineas).toHaveLength(2);
  });

  it("un id que no existe da null, no revienta", async () => {
    const f = await obtenerFactura(sbDuenyo, "00000000-0000-0000-0000-000000000000");
    expect(f).toBeNull();
  });
});
