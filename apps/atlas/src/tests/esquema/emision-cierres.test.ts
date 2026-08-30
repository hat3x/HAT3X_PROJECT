// src/tests/esquema/emision-cierres.test.ts
//
// Ronda de arreglo 1 sobre la emisión (20260901101000_emision_cierres.sql):
// el borrador que no se emite fuera de la RPC, la serie con un solo origen,
// la línea que no se muda, el cobro que no toca una anulada, la firma y el
// instante obligatorios, los eventos que la aplicación puede apuntar, y el
// colaborador que no se hace propietario. Serie propia `TE2` (Atlas) y `TE2X`
// (externas); misma preparación que `emision.test.ts`, con sus helpers copiados.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CORREO_DUENYO = "duenyo-emision-cierres@atlas.test";
const CORREO_COLAB = "colab-emision-cierres@atlas.test";
const SLUG_CLIENTE = "prueba-emision-cierres";
const SERIE = "TE2";
const SERIE_EXTERNA = "TE2X";
const SERIES = [SERIE, SERIE_EXTERNA];

type ArgsEmitir = Database["public"]["Functions"]["atlas_emitir_factura"]["Args"];

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idColab = "";
let idCliente = "";
let idBorrador = "";
let idLineaBorrador = "";
let idEmitida = "";
let idLineaEmitida = "";

// Los tipos generados dicen `string` para los parámetros porque la base no
// sabe declarar la nulabilidad; aquí se prueba justo lo que pasa con null.
function argsEmitir(a: Omit<ArgsEmitir, "p_huella_anterior" | "p_firma" | "p_gen_en"> & {
  p_huella_anterior: string | null;
  p_firma: string | null;
  p_gen_en: string | null;
}): ArgsEmitir {
  return a as ArgsEmitir;
}

// Limpieza con los disparadores apagados, SOLO aquí y en una transacción: si
// algo falla, el ROLLBACK deshace también el `disable trigger`.
async function limpiarSeries() {
  await pg.query(`BEGIN`);
  try {
    await pg.query(`ALTER TABLE facturas DISABLE TRIGGER facturas_inmutables`);
    await pg.query(`ALTER TABLE factura_lineas DISABLE TRIGGER factura_lineas_inmutables`);
    await pg.query(`ALTER TABLE factura_eventos DISABLE TRIGGER factura_eventos_inmutables`);
    await pg.query(
      `DELETE FROM factura_eventos WHERE factura_id IN (SELECT id FROM facturas WHERE serie = ANY($1))`,
      [SERIES]
    );
    await pg.query(
      `UPDATE cadena_facturas SET punta = NULL, factura_id = NULL, sellada_en = NULL
        WHERE factura_id IN (SELECT id FROM facturas WHERE serie = ANY($1))`,
      [SERIES]
    );
    await pg.query(
      `DELETE FROM factura_lineas WHERE factura_id IN (SELECT id FROM facturas WHERE serie = ANY($1))`,
      [SERIES]
    );
    await pg.query(`DELETE FROM facturas WHERE serie = ANY($1)`, [SERIES]);
    await pg.query(`DELETE FROM series_facturas WHERE serie = ANY($1)`, [SERIES]);
    await pg.query(`ALTER TABLE facturas ENABLE TRIGGER facturas_inmutables`);
    await pg.query(`ALTER TABLE factura_lineas ENABLE TRIGGER factura_lineas_inmutables`);
    await pg.query(`ALTER TABLE factura_eventos ENABLE TRIGGER factura_eventos_inmutables`);
    await pg.query(`COMMIT`);
  } catch (e) {
    await pg.query(`ROLLBACK`);
    throw e;
  }
}

async function usuario(correo: string, propietario: boolean) {
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === correo) await admin.auth.admin.deleteUser(u.id);
  }
  const creado = await admin.auth.admin.createUser({ email: correo, password: "contrasena-de-prueba", email_confirm: true });
  if (creado.error) throw creado.error;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1, $2)`, [creado.data.user.id, propietario]);
  const sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `ec-${propietario ? "d" : "c"}` },
  });
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: "contrasena-de-prueba" });
  if (error) throw error;
  return { id: creado.data.user.id, sb };
}

async function borradorAtlas(): Promise<{ factura: string; linea: string }> {
  const { rows } = await pg.query(
    `INSERT INTO facturas (origen, serie, cliente_id, fecha_emision, fecha_vencimiento, base, iva_tipo, iva_cuota, total)
     VALUES ('atlas', $1, $2, '2092-01-10', '2092-02-10', 100, 21, 21, 121) RETURNING id`,
    [SERIE, idCliente]
  );
  const { rows: lineas } = await pg.query(
    `INSERT INTO factura_lineas (factura_id, concepto, cantidad, precio_unitario, importe) VALUES ($1, 'Trabajo', 1, 100, 100) RETURNING id`,
    [rows[0].id]
  );
  return { factura: rows[0].id, linea: lineas[0].id };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  await limpiarSeries();

  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);
  const { rows } = await pg.query(`INSERT INTO clientes (nombre, slug) VALUES ('Prueba Cierres', $1) RETURNING id`, [SLUG_CLIENTE]);
  idCliente = rows[0].id;

  const d = await usuario(CORREO_DUENYO, true);
  idDuenyo = d.id;
  sbDuenyo = d.sb;
  const c = await usuario(CORREO_COLAB, false);
  idColab = c.id;
  sbColab = c.sb;

  const b = await borradorAtlas();
  idBorrador = b.factura;
  idLineaBorrador = b.linea;

  // Una emitida con línea, sellada como lo haría la RPC: con la marca de
  // sesión dentro de su transacción. No toca la cadena.
  const e = await borradorAtlas();
  idEmitida = e.factura;
  idLineaEmitida = e.linea;
  await pg.query(`BEGIN`);
  try {
    await pg.query(`SELECT set_config('atlas.emitiendo', 'si', true)`);
    await pg.query(`UPDATE facturas SET estado = 'emitida', numero = 1, huella = repeat('A', 64) WHERE id = $1`, [idEmitida]);
    await pg.query(`COMMIT`);
  } catch (err) {
    await pg.query(`ROLLBACK`);
    throw err;
  }
});

afterAll(async () => {
  try {
    try {
      await limpiarSeries();
    } catch {
      /* que no impida el resto de la limpieza */
    }
    if (idCliente !== "") {
      try {
        await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
      } catch {
        /* ya no está */
      }
    }
    for (const id of [idDuenyo, idColab]) {
      if (id === "") continue;
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("I1 · un borrador de Atlas solo se emite por la RPC", () => {
  it("cambiar el estado a mano falla", async () => {
    expect(idBorrador).not.toBe("");
    await expect(pg.query(`UPDATE facturas SET estado = 'emitida' WHERE id = $1`, [idBorrador])).rejects.toThrow(/atlas_emitir_factura/);
  });

  it("poner huella, firma o instante a mano falla; el resto del borrador sigue editable", async () => {
    await expect(pg.query(`UPDATE facturas SET huella = repeat('B', 64) WHERE id = $1`, [idBorrador])).rejects.toThrow(/atlas_emitir_factura/);
    await expect(pg.query(`UPDATE facturas SET firma = 'x' WHERE id = $1`, [idBorrador])).rejects.toThrow(/atlas_emitir_factura/);
    await expect(pg.query(`UPDATE facturas SET huella_gen_en = now() WHERE id = $1`, [idBorrador])).rejects.toThrow(/atlas_emitir_factura/);
    await expect(pg.query(`UPDATE facturas SET base = 150, total = 181.5, iva_cuota = 31.5 WHERE id = $1`, [idBorrador])).resolves.toBeDefined();
  });
});

describe("I2 · una serie tiene un solo origen", () => {
  it("una externa no entra en una serie de Atlas", async () => {
    await expect(
      pg.query(
        `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado)
         VALUES ('externa', $1, 500, $2, '2092-01-10', 100, 21, 21, 121, 'emitida')`,
        [SERIE, idCliente]
      )
    ).rejects.toThrow(/la serie TE2 es de facturas de Atlas; usa otra serie/);
  });

  it("una de Atlas no entra en una serie de externas", async () => {
    await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado)
       VALUES ('externa', $1, 1, $2, '2092-01-10', 100, 21, 21, 121, 'emitida')`,
      [SERIE_EXTERNA, idCliente]
    );
    await expect(
      pg.query(`INSERT INTO facturas (origen, serie, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total) VALUES ('atlas', $1, $2, '2092-01-10', 1, 21, 0.21, 1.21)`, [
        SERIE_EXTERNA,
        idCliente,
      ])
    ).rejects.toThrow(/la serie TE2X es de facturas externas; usa otra serie/);
    const { rows } = await pg.query(`SELECT serie, origen FROM series_facturas WHERE serie = ANY($1) ORDER BY serie`, [SERIES]);
    expect(rows).toEqual([
      { serie: SERIE, origen: "atlas" },
      { serie: SERIE_EXTERNA, origen: "externa" },
    ]);
  });

  it("ni cambiando la serie de un borrador", async () => {
    await expect(pg.query(`UPDATE facturas SET serie = $2 WHERE id = $1`, [idBorrador, SERIE_EXTERNA])).rejects.toThrow(/usa otra serie/);
  });

  it("el colaborador ve las series pero no las crea", async () => {
    const { data } = await sbColab.from("series_facturas").select("serie").eq("serie", SERIE);
    expect(data).toEqual([{ serie: SERIE }]);
    const { error } = await sbColab.from("series_facturas").insert({ serie: "TE2C", origen: "atlas" });
    expect(error?.message).toMatch(/row-level security/);
  });
});

describe("I3 · una línea no se muda", () => {
  it("de una emitida a un borrador, falla", async () => {
    expect(idLineaEmitida).not.toBe("");
    await expect(pg.query(`UPDATE factura_lineas SET factura_id = $2 WHERE id = $1`, [idLineaEmitida, idBorrador])).rejects.toThrow(
      /no cambia de factura|inmutables/
    );
  });

  it("de un borrador a otro, tampoco: cambiar factura_id se prohíbe siempre", async () => {
    const otro = await borradorAtlas();
    await expect(pg.query(`UPDATE factura_lineas SET factura_id = $2 WHERE id = $1`, [idLineaBorrador, otro.factura])).rejects.toThrow(
      /no cambia de factura/
    );
    await expect(pg.query(`UPDATE factura_lineas SET concepto = 'Otro' WHERE id = $1`, [idLineaBorrador])).resolves.toBeDefined();
  });
});

describe("M1 · cobro y vencimiento", () => {
  it("el vencimiento de una emitida es inmutable; las notas no", async () => {
    await expect(pg.query(`UPDATE facturas SET fecha_vencimiento = '2092-03-01' WHERE id = $1`, [idEmitida])).rejects.toThrow(/inmutable/);
    await expect(pg.query(`UPDATE facturas SET notas = 'apunte interno' WHERE id = $1`, [idEmitida])).resolves.toBeDefined();
  });

  it("una anulada no se cobra", async () => {
    const { rows } = await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado, huella)
       VALUES ('atlas', $1, 2, $2, '2092-01-10', 100, 21, 21, 121, 'anulada', repeat('D', 64)) RETURNING id`,
      [SERIE, idCliente]
    );
    await expect(pg.query(`UPDATE facturas SET cobrada_en = '2092-02-01' WHERE id = $1`, [rows[0].id])).rejects.toThrow(/inmutable/);
  });
});

describe("M4 · sellar exige firma e instante", () => {
  it("sin firma o sin instante, la RPC lo dice y no escribe", async () => {
    const sinFirma = await sbDuenyo.rpc(
      "atlas_emitir_factura",
      argsEmitir({ p_factura: idBorrador, p_numero: 3, p_huella_anterior: null, p_huella: "C".repeat(64), p_firma: null, p_gen_en: new Date().toISOString() })
    );
    expect(sinFirma.data).toMatchObject({ ok: false, error: expect.stringMatching(/firma/) });
    const sinInstante = await sbDuenyo.rpc(
      "atlas_emitir_factura",
      argsEmitir({ p_factura: idBorrador, p_numero: 3, p_huella_anterior: null, p_huella: "C".repeat(64), p_firma: "firma", p_gen_en: null })
    );
    expect(sinInstante.data).toMatchObject({ ok: false, error: expect.stringMatching(/instante/) });
    const { rows } = await pg.query(`SELECT estado, numero FROM facturas WHERE id = $1`, [idBorrador]);
    expect(rows[0]).toEqual({ estado: "borrador", numero: null });
  });
});

describe("M5 · qué eventos apunta la aplicación", () => {
  it("un emision por PostgREST lo rechaza RLS, aunque sea el propietario", async () => {
    const { error } = await sbDuenyo.from("factura_eventos").insert({ factura_id: idEmitida, tipo: "emision" });
    expect(error?.message).toMatch(/row-level security/);
  });

  it("una exportacion sí", async () => {
    const { error } = await sbDuenyo.from("factura_eventos").insert({ factura_id: idEmitida, tipo: "exportacion" });
    expect(error).toBeNull();
  });
});

describe("M7 · nadie se hace propietario solo", () => {
  it("el colaborador no puede ponerse es_propietario", async () => {
    const { error } = await sbColab.from("perfiles").update({ es_propietario: true }).eq("id", idColab);
    expect(error?.message).toMatch(/solo el propietario/);
    const { rows } = await pg.query(`SELECT es_propietario FROM perfiles WHERE id = $1`, [idColab]);
    expect(rows[0]).toEqual({ es_propietario: false });
  });

  it("el propietario sí puede cambiarlo en otro", async () => {
    const { error } = await sbDuenyo.from("perfiles").update({ es_propietario: true }).eq("id", idColab);
    expect(error).toBeNull();
    const { rows } = await pg.query(`SELECT es_propietario FROM perfiles WHERE id = $1`, [idColab]);
    expect(rows[0]).toEqual({ es_propietario: true });
    await pg.query(`UPDATE perfiles SET es_propietario = false WHERE id = $1`, [idColab]);
  });
});
