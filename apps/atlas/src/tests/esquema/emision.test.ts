// src/tests/esquema/emision.test.ts
//
// La base que garantiza la emisión (plan 2E, tarea 1): inmutabilidad de las
// emitidas de Atlas, eventos solo de inserción, y las RPC que asignan número
// y adelantan la punta bajo bloqueo. Todo sobre una serie propia, `TE1`, que
// ningún otro test usa, y sin suponer que la base esté vacía.
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
const CORREO_DUENYO = "duenyo-emision-esquema@atlas.test";
const CORREO_COLAB = "colab-emision-esquema@atlas.test";
const SLUG_CLIENTE = "prueba-emision-esquema";
const SERIE = "TE1";
// Una serie es de externas o de Atlas (ronda 1, I2): la externa de prueba va aparte.
const SERIE_EXTERNA = "TE1X";
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
let idEmitida = "";

// La punta real de la base local, tal cual estaba antes de tocar nada. El test
// «sella» la adelanta; al terminar hay que devolverla, no ponerla a null.
let puntaGuardada: { punta: string | null; factura_id: string | null; sellada_en: string | null } | null = null;

// Los tipos generados dicen `string` para `p_huella_anterior` porque la base no
// sabe declarar la nulabilidad de un parámetro; en la cadena vacía es null.
function argsEmitir(a: Omit<ArgsEmitir, "p_huella_anterior"> & { p_huella_anterior: string | null }): ArgsEmitir {
  return a as ArgsEmitir;
}

// La serie de prueba se limpia con los disparadores de inmutabilidad apagados,
// SOLO aquí: el disparador no deja borrar una emitida ni tocar sus eventos, y
// un test que no puede limpiar deja la serie de prueba envenenada para siempre.
// Todo en UNA transacción: si algo falla a medias, el ROLLBACK deshace también
// el `disable trigger`, y la base no se queda con un disparador apagado.
async function limpiarSerie() {
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
    // La serie de prueba no deja huella en `series_facturas`: la siguiente
    // corrida vuelve a decidir su origen con la primera factura.
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
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `em-${propietario ? "d" : "c"}` },
  });
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: "contrasena-de-prueba" });
  if (error) throw error;
  return { id: creado.data.user.id, sb };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Primero la serie (por si una corrida anterior murió a medias), y solo
  // después se guarda la punta: así lo guardado nunca apunta a una TE1.
  await limpiarSerie();
  const { rows: punta } = await pg.query(`SELECT punta, factura_id, sellada_en FROM cadena_facturas WHERE id = 1`);
  puntaGuardada = punta[0] ?? null;

  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);
  const { rows } = await pg.query(`INSERT INTO clientes (nombre, slug) VALUES ('Prueba Emisión', $1) RETURNING id`, [SLUG_CLIENTE]);
  idCliente = rows[0].id;

  const d = await usuario(CORREO_DUENYO, true);
  idDuenyo = d.id;
  sbDuenyo = d.sb;
  const c = await usuario(CORREO_COLAB, false);
  idColab = c.id;
  sbColab = c.sb;

  const { rows: borrador } = await pg.query(
    `INSERT INTO facturas (origen, serie, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total)
     VALUES ('atlas', $1, $2, '2091-01-10', 100, 21, 21, 121) RETURNING id`,
    [SERIE, idCliente]
  );
  idBorrador = borrador[0].id;
  await pg.query(
    `INSERT INTO factura_lineas (factura_id, concepto, cantidad, precio_unitario, importe) VALUES ($1, 'Trabajo', 1, 100, 100)`,
    [idBorrador]
  );
});

afterAll(async () => {
  try {
    try {
      await limpiarSerie();
    } catch {
      /* que no impida el resto de la limpieza */
    }
    if (puntaGuardada !== null) {
      try {
        await pg.query(`UPDATE cadena_facturas SET punta = $1, factura_id = $2, sellada_en = $3 WHERE id = 1`, [
          puntaGuardada.punta,
          puntaGuardada.factura_id,
          puntaGuardada.sellada_en,
        ]);
      } catch {
        /* la punta anterior ya no es restaurable */
      }
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

describe("inmutabilidad", () => {
  it("un update a una emitida de Atlas falla, incluso como superusuario", async () => {
    const { rows } = await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado, huella)
       VALUES ('atlas',$2,1,$1,'2091-01-10',100,21,21,121,'emitida', repeat('A',64)) RETURNING id`,
      [idCliente, SERIE]
    );
    idEmitida = rows[0].id;
    await expect(pg.query(`UPDATE facturas SET base = 200 WHERE id = $1`, [idEmitida])).rejects.toThrow(/inmutable/);
    await expect(pg.query(`DELETE FROM facturas WHERE id = $1`, [idEmitida])).rejects.toThrow(/no se borra/);
    await expect(
      pg.query(`INSERT INTO factura_lineas (factura_id, concepto, cantidad, precio_unitario, importe) VALUES ($1,'x',1,1,1)`, [idEmitida])
    ).rejects.toThrow(/inmutables/);
  });

  it("pero se puede cobrar y anular", async () => {
    expect(idEmitida).not.toBe("");
    await expect(pg.query(`UPDATE facturas SET cobrada_en = '2091-02-01' WHERE id = $1`, [idEmitida])).resolves.toBeDefined();
    await expect(pg.query(`UPDATE facturas SET estado = 'anulada' WHERE id = $1`, [idEmitida])).resolves.toBeDefined();
  });

  it("una externa sigue siendo editable como en 2A", async () => {
    const { rows } = await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado)
       VALUES ('externa',$2,900,$1,'2091-01-10',100,21,21,121,'emitida') RETURNING id`,
      [idCliente, SERIE_EXTERNA]
    );
    await expect(pg.query(`UPDATE facturas SET base = 200 WHERE id = $1`, [rows[0].id])).resolves.toBeDefined();
  });

  it("una anulada no vuelve a emitida", async () => {
    expect(idEmitida).not.toBe("");
    await expect(pg.query(`UPDATE facturas SET estado = 'emitida' WHERE id = $1`, [idEmitida])).rejects.toThrow(/inmutable/);
  });

  it("los eventos no se editan ni se borran", async () => {
    expect(idEmitida).not.toBe("");
    const { rows } = await pg.query(`INSERT INTO factura_eventos (factura_id, tipo) VALUES ($1,'exportacion') RETURNING id`, [idEmitida]);
    await expect(pg.query(`DELETE FROM factura_eventos WHERE id = $1`, [rows[0].id])).rejects.toThrow(/solo de insercion/);
    await expect(pg.query(`UPDATE factura_eventos SET tipo = 'anomalia' WHERE id = $1`, [rows[0].id])).rejects.toThrow(/solo de insercion/);
  });
});

describe("las RPC", () => {
  it("un colaborador no puede sellar ni anular", async () => {
    expect(idBorrador).not.toBe("");
    const r = await sbColab.rpc(
      "atlas_emitir_factura",
      argsEmitir({ p_factura: idBorrador, p_numero: 1, p_huella_anterior: null, p_huella: "A".repeat(64), p_firma: "x", p_gen_en: new Date().toISOString() })
    );
    expect(r.data).toMatchObject({ ok: false });
    const a = await sbColab.rpc("atlas_anular_factura", { p_factura: idBorrador, p_motivo: "no" });
    expect(a.data).toMatchObject({ ok: false });
    const { rows } = await pg.query(`SELECT estado, numero FROM facturas WHERE id = $1`, [idBorrador]);
    expect(rows[0]).toEqual({ estado: "borrador", numero: null });
  });

  it("si el número o la punta no son los actuales, dice reintentar y no escribe", async () => {
    const r = await sbDuenyo.rpc(
      "atlas_emitir_factura",
      argsEmitir({ p_factura: idBorrador, p_numero: 99, p_huella_anterior: null, p_huella: "B".repeat(64), p_firma: "x", p_gen_en: new Date().toISOString() })
    );
    // Ya hay una emitida (la 1, del bloque anterior): el número real es el 2.
    expect(r.data).toMatchObject({ ok: false, reintentar: true, numero: 2 });
    const { rows } = await pg.query(`SELECT estado, numero FROM facturas WHERE id = $1`, [idBorrador]);
    expect(rows[0]).toEqual({ estado: "borrador", numero: null });
  });

  it("un colaborador no ve el siguiente número ni la punta", async () => {
    const { data, error } = await sbColab.rpc("atlas_siguiente_emision", { p_serie: SERIE });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("el código no puede poner número a un borrador por su cuenta", async () => {
    await expect(pg.query(`UPDATE facturas SET numero = 5 WHERE id = $1`, [idBorrador])).rejects.toThrow(/atlas_emitir_factura/);
  });

  it("con el número y la punta correctos, sella, adelanta la punta y deja evento", async () => {
    const { data: sig, error } = await sbDuenyo.rpc("atlas_siguiente_emision", { p_serie: SERIE });
    expect(error).toBeNull();
    const siguiente = sig?.[0];
    if (siguiente === undefined) throw new Error("atlas_siguiente_emision no devolvió fila");
    // La emitida a mano del bloque anterior lleva el 1 (y ahora está anulada):
    // el siguiente correlativo de la serie es el 2, anuladas incluidas.
    expect(siguiente.numero).toBe(2);
    const r = await sbDuenyo.rpc(
      "atlas_emitir_factura",
      argsEmitir({
        p_factura: idBorrador,
        p_numero: siguiente.numero,
        p_huella_anterior: siguiente.punta,
        p_huella: "C".repeat(64),
        p_firma: "firma",
        p_gen_en: new Date().toISOString(),
      })
    );
    expect(r.data).toMatchObject({ ok: true, numero: 2 });
    const { rows } = await pg.query(`SELECT punta, factura_id FROM cadena_facturas WHERE id = 1`);
    expect(rows[0]).toEqual({ punta: "C".repeat(64), factura_id: idBorrador });
    const { rows: f } = await pg.query(`SELECT estado, numero, huella FROM facturas WHERE id = $1`, [idBorrador]);
    expect(f[0]).toEqual({ estado: "emitida", numero: 2, huella: "C".repeat(64) });
    const { rows: ev } = await pg.query(`SELECT tipo FROM factura_eventos WHERE factura_id = $1`, [idBorrador]);
    expect(ev.map((e) => e.tipo)).toContain("emision");
  });

  it("anular una emitida deja evento; anular dos veces lo dice", async () => {
    const a = await sbDuenyo.rpc("atlas_anular_factura", { p_factura: idBorrador, p_motivo: "prueba" });
    expect(a.data).toMatchObject({ ok: true });
    const b = await sbDuenyo.rpc("atlas_anular_factura", { p_factura: idBorrador, p_motivo: "prueba" });
    expect(b.data).toMatchObject({ ok: false });
    const { rows: ev } = await pg.query(`SELECT tipo FROM factura_eventos WHERE factura_id = $1 AND tipo = 'anulacion'`, [idBorrador]);
    expect(ev).toHaveLength(1);
  });

  it("las notificaciones admiten el tipo cadena", async () => {
    await expect(
      pg.query(`INSERT INTO notificaciones (usuario_id, canal, ok, tipo) VALUES ($1,'push',true,'cadena') RETURNING id`, [idDuenyo])
    ).resolves.toBeDefined();
    await pg.query(`DELETE FROM notificaciones WHERE usuario_id = $1`, [idDuenyo]);
  });
});
