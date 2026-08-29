// src/tests/db/cobro.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { leerCobro } from "@/lib/db/cobro";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const CORREO_DUENYO = "duenyo-cobro@atlas.test";
const CORREO_COLAB = "colab-cobro@atlas.test";
const SLUG = "cobro-prueba";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
let idCliente = "";
let idProyecto = "";
let idContrato = "";

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
  return sb;
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza defensiva: si una corrida anterior murió a medias, sus restos
  // harían fallar el alta por correo duplicado y el fichero quedaría
  // inservible para siempre. Limpiar solo al final no basta.
  const { data: lista } = await admin.auth.admin.listUsers();
  for (const u of lista?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
      await pg.query(`DELETE FROM perfiles WHERE id = $1`, [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await pg.query(
    `DELETE FROM facturas WHERE cliente_id IN (SELECT id FROM clientes WHERE slug = $1)`,
    [SLUG]
  );
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG]);
  await pg.query(`DELETE FROM proyectos WHERE slug = $1`, [SLUG]);

  sbDuenyo = await altaUsuario(CORREO_DUENYO, true, "dc");
  sbColaborador = await altaUsuario(CORREO_COLAB, false, "cc");

  const {
    rows: [c],
  } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Cobro Prueba',$1) RETURNING id`,
    [SLUG]
  );
  idCliente = c.id;
  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Cobro',$1,'interno') RETURNING id`,
    [SLUG]
  );
  idProyecto = p.id;
  const {
    rows: [k],
  } = await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta, estado)
     VALUES ($1,$2,350,'2026-01-01','activo') RETURNING id`,
    [idCliente, idProyecto]
  );
  idContrato = k.id;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM periodos_contrato WHERE contrato_id = $1`, [idContrato]);
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
});

afterAll(async () => {
  // Cada borrado en su propio try: un fallo en el primero no puede impedir los
  // siguientes, o el fichero quedaría inservible tras una corrida cortada.
  try {
    await pg.query(`DELETE FROM periodos_contrato WHERE contrato_id = $1`, [idContrato]);
  } catch {}
  try {
    await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  } catch {}
  try {
    await pg.query(`DELETE FROM contratos WHERE id = $1`, [idContrato]);
  } catch {}
  try {
    await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  } catch {}
  try {
    await pg.query(`DELETE FROM proyectos WHERE id = $1`, [idProyecto]);
  } catch {}
  try {
    const { data: lista } = await admin.auth.admin.listUsers();
    for (const u of lista?.users ?? []) {
      if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
        await admin.auth.admin.deleteUser(u.id);
      }
    }
  } catch {}
  await pg.end();
});

async function periodo(mes: string, conFactura: string | null = null) {
  await pg.query(
    `INSERT INTO periodos_contrato (contrato_id, periodo, importe_esperado, factura_id)
     VALUES ($1,$2,350,$3)`,
    [idContrato, mes, conFactura]
  );
}

async function factura(numero: number, vence: string | null, cobrada: string | null) {
  const { rows } = await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           fecha_vencimiento, base, iva_cuota, total, estado, cobrada_en)
     VALUES ('externa','C',$1,$2,'2026-08-01',$3,350,73.5,423.5,'emitida',$4)
     RETURNING id`,
    [numero, idCliente, vence, cobrada]
  );
  return rows[0].id as string;
}

describe("leer lo pendiente de cobro", () => {
  it("sin nada, las dos listas vienen vacías", async () => {
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.periodos).toEqual([]);
    expect(c.facturas).toEqual([]);
  });

  it("trae el periodo sin factura, con el nombre del cliente", async () => {
    await periodo("2026-08-01");
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.periodos).toHaveLength(1);
    expect(c.periodos[0]!.clienteNombre).toBe("Cobro Prueba");
    expect(c.periodos[0]!.importeEsperadoCentimos).toBe(35000);
  });

  // El mes en curso todavía se puede facturar: perseguirlo el día 3 sería
  // avisar de algo que no ha llegado a ser un descuido.
  it("el mes en curso no cuenta como sin facturar", async () => {
    await periodo("2026-09-01");
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.periodos).toEqual([]);
  });

  it("un periodo ya facturado no cuenta", async () => {
    const id = await factura(1, "2026-09-01", null);
    await periodo("2026-08-01", id);
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.periodos).toEqual([]);
  });

  it("trae la factura sin cobrar en céntimos", async () => {
    await factura(2, "2026-09-01", null);
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.facturas).toHaveLength(1);
    expect(c.facturas[0]!.totalCentimos).toBe(42350);
  });

  it("una cobrada no viene", async () => {
    await factura(3, "2026-09-01", "2026-09-05");
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.facturas).toEqual([]);
  });

  // Un borrador no se ha mandado a nadie, y una anulada no se debe. Ninguna de
  // las dos es una deuda que perseguir.
  it("ni un borrador ni una anulada", async () => {
    await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                             fecha_vencimiento, base, iva_cuota, total, estado)
       VALUES ('externa','C',4,$1,'2026-08-01','2026-09-01',350,73.5,423.5,'borrador'),
              ('externa','C',5,$1,'2026-08-01','2026-09-01',350,73.5,423.5,'anulada')`,
      [idCliente]
    );
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.facturas).toEqual([]);
  });

  // No filtra la consulta: de eso se encarga RLS, y se comprueba con un
  // colaborador real en vez de suponerlo.
  it("un colaborador no ve nada", async () => {
    await periodo("2026-08-01");
    await factura(6, "2026-09-01", null);
    const c = await leerCobro(sbColaborador, "2026-09-15");
    expect(c.periodos).toEqual([]);
    expect(c.facturas).toEqual([]);
  });
});
