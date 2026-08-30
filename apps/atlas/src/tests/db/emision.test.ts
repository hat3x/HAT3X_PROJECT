// src/tests/db/emision.test.ts
//
// Emitir, anular y rectificar contra la base (plan 2E, tarea 4), con un
// propietario y un colaborador reales. Serie propia `TE4`; las rectificativas
// van a `R` y se limpian por `rectifica_a`. Datos fiscales, credencial de
// firma y punta de la cadena se guardan antes y se restauran después: la
// fila de ajustes y la cadena son únicas y las comparte toda la suite.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "@/types/supabase";
import {
  crearBorrador,
  guardarBorrador,
  borrarBorrador,
  emitir,
  anular,
  rectificar,
  eslabonesDeLaCadena,
  registrarEvento,
  SERIE_RECTIFICATIVAS,
  type EntradaBorrador,
} from "@/lib/db/emision";
import { escribirCredencial } from "@/lib/db/credenciales";
import { PROVEEDOR_FIRMA, ETIQUETA_FIRMA } from "@/lib/facturas/ajustes-emision";
import { generarClavePem, clavePublicaDe, verificarFirma } from "@/lib/facturas/firma";
import { cadenaCanonica, numSerie, verificarCadena } from "@/lib/facturas/huella";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// 32 bytes exactos, igual que en credenciales.test.ts: clave de pruebas, no abre nada real.
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");

const CORREO_DUENYO = "duenyo-emision-db@atlas.test";
const CORREO_COLAB = "colab-emision-db@atlas.test";
const SLUG_CLIENTE = "prueba-emision-db";
const SERIE = "TE4";
const CIF = "B12345678";
// Un instante fijo: 2091-04-01 a las 10:00 en Madrid (verano, +02:00).
const AHORA = Date.UTC(2091, 3, 1, 8, 0, 0);

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idColab = "";
let idCliente = "";
let idCredencial = "";
let clavePrivada = "";

let puntaGuardada: { punta: string | null; factura_id: string | null; sellada_en: string | null } | null = null;
let ajustesOriginales: { razon_social: string | null; cif: string | null; direccion: string | null; validado_gestoria: boolean } | null = null;

// Las de la serie de prueba y las rectificativas que apuntan a ellas.
const DE_PRUEBA = `SELECT id FROM facturas WHERE serie = $1
                   OR (serie = $2 AND rectifica_a IN (SELECT id FROM facturas WHERE serie = $1))`;

// Limpieza con los disparadores de inmutabilidad apagados, SOLO aquí y dentro
// de una transacción: un ROLLBACK a medias también deshace el `disable`.
async function limpiarSerie() {
  const params = [SERIE, SERIE_RECTIFICATIVAS];
  await pg.query(`BEGIN`);
  try {
    await pg.query(`ALTER TABLE facturas DISABLE TRIGGER facturas_inmutables`);
    await pg.query(`ALTER TABLE factura_lineas DISABLE TRIGGER factura_lineas_inmutables`);
    await pg.query(`ALTER TABLE factura_eventos DISABLE TRIGGER factura_eventos_inmutables`);
    await pg.query(`DELETE FROM factura_eventos WHERE factura_id IN (${DE_PRUEBA})`, params);
    await pg.query(
      `UPDATE cadena_facturas SET punta = NULL, factura_id = NULL, sellada_en = NULL WHERE factura_id IN (${DE_PRUEBA})`,
      params
    );
    await pg.query(`DELETE FROM factura_lineas WHERE factura_id IN (${DE_PRUEBA})`, params);
    // Primero las rectificativas: `rectifica_a` es `on delete restrict`.
    await pg.query(`DELETE FROM facturas WHERE serie = $2 AND rectifica_a IN (SELECT id FROM facturas WHERE serie = $1)`, params);
    await pg.query(`DELETE FROM facturas WHERE serie = $1`, [SERIE]);
    // La serie de prueba no deja huella en `series_facturas`; `R` solo si quedó vacía.
    await pg.query(
      `DELETE FROM series_facturas WHERE serie = $1 OR (serie = $2 AND NOT EXISTS (SELECT 1 FROM facturas WHERE serie = $2))`,
      params
    );
    await pg.query(`ALTER TABLE facturas ENABLE TRIGGER facturas_inmutables`);
    await pg.query(`ALTER TABLE factura_lineas ENABLE TRIGGER factura_lineas_inmutables`);
    await pg.query(`ALTER TABLE factura_eventos ENABLE TRIGGER factura_eventos_inmutables`);
    await pg.query(`COMMIT`);
  } catch (e) {
    await pg.query(`ROLLBACK`);
    throw e;
  }
}

async function ponerAjustes(cif: string | null) {
  await pg.query(
    `UPDATE ajustes_economia SET razon_social = 'HAT3X S.L.', cif = $1, direccion = 'Calle Falsa 123, Madrid', validado_gestoria = true WHERE id = 1`,
    [cif]
  );
}

async function limpiarCredencialFirma() {
  await pg.query(`DELETE FROM credenciales WHERE proveedor = $1 AND etiqueta = $2 AND proyecto_id IS NULL`, [
    PROVEEDOR_FIRMA,
    ETIQUETA_FIRMA,
  ]);
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
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `emdb-${propietario ? "d" : "c"}` },
  });
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: "contrasena-de-prueba" });
  if (error) throw error;
  return { id: creado.data.user.id, sb };
}

function entrada(lineas: EntradaBorrador["lineas"], extra: Partial<EntradaBorrador> = {}): EntradaBorrador {
  return { clienteId: idCliente, serie: SERIE, fechaEmision: "2091-04-01", ivaTipo: 21, lineas, ...extra };
}

async function fila(id: string) {
  const { rows } = await pg.query(
    `SELECT origen, serie, numero, estado, tipo_factura, rectifica_a, huella, huella_anterior, firma, base::float8 AS base, total::float8 AS total
       FROM facturas WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

async function lineasDe(id: string) {
  const { rows } = await pg.query(
    `SELECT concepto, cantidad::float8 AS cantidad, precio_unitario::float8 AS precio, importe::float8 AS importe
       FROM factura_lineas WHERE factura_id = $1 ORDER BY orden`,
    [id]
  );
  return rows;
}

async function eventos(id: string, tipo: string) {
  const { rows } = await pg.query(`SELECT detalle FROM factura_eventos WHERE factura_id = $1 AND tipo = $2`, [id, tipo]);
  return rows;
}

async function usosDeLaClave(): Promise<number> {
  const { rows } = await pg.query(`SELECT count(*)::int AS n FROM credencial_usos WHERE credencial_id = $1`, [idCredencial]);
  return rows[0].n;
}

function idDe(r: { ok: boolean; id?: string; error?: string }): string {
  if (!r.ok || r.id === undefined) throw new Error(`esperaba un id: ${r.error ?? "sin error"}`);
  return r.id;
}

beforeAll(async () => {
  process.env.ATLAS_MASTER_KEY = CLAVE;
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Primero la serie (por si una corrida anterior murió a medias), y solo
  // después se guarda la punta: así lo guardado nunca apunta a una TE4.
  await limpiarSerie();
  const { rows: punta } = await pg.query(`SELECT punta, factura_id, sellada_en FROM cadena_facturas WHERE id = 1`);
  puntaGuardada = punta[0] ?? null;
  const { rows: aj } = await pg.query(`SELECT razon_social, cif, direccion, validado_gestoria FROM ajustes_economia WHERE id = 1`);
  ajustesOriginales = aj[0] ?? null;
  await ponerAjustes(CIF);

  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);
  const { rows } = await pg.query(`INSERT INTO clientes (nombre, slug) VALUES ('Prueba Emisión DB', $1) RETURNING id`, [SLUG_CLIENTE]);
  idCliente = rows[0].id;

  const d = await usuario(CORREO_DUENYO, true);
  idDuenyo = d.id;
  sbDuenyo = d.sb;
  const c = await usuario(CORREO_COLAB, false);
  idColab = c.id;
  sbColab = c.sb;

  await limpiarCredencialFirma();
  clavePrivada = generarClavePem().privada;
  const alta = await escribirCredencial(sbDuenyo, {
    proveedor: PROVEEDOR_FIRMA,
    etiqueta: ETIQUETA_FIRMA,
    secreto: clavePrivada,
    proyectoId: null,
  });
  if (!alta.ok) throw new Error(alta.error);
  const { rows: cred } = await pg.query(
    `SELECT id FROM credenciales WHERE proveedor = $1 AND etiqueta = $2 AND proyecto_id IS NULL`,
    [PROVEEDOR_FIRMA, ETIQUETA_FIRMA]
  );
  idCredencial = cred[0].id;
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
    if (ajustesOriginales !== null) {
      try {
        await pg.query(
          `UPDATE ajustes_economia SET razon_social = $1, cif = $2, direccion = $3, validado_gestoria = $4 WHERE id = 1`,
          [ajustesOriginales.razon_social, ajustesOriginales.cif, ajustesOriginales.direccion, ajustesOriginales.validado_gestoria]
        );
      } catch {
        /* la fila ya no está */
      }
    }
    try {
      await limpiarCredencialFirma();
    } catch {
      /* ya no está */
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

let idA = "";
let idEmitida5 = "";

describe("borradores", () => {
  it("crear deja un borrador de Atlas sin número, F1", async () => {
    idA = idDe(await crearBorrador(sbDuenyo, entrada([{ concepto: "Trabajo", cantidad: 1, precioUnitarioCentimos: 10_000 }])));
    expect(await fila(idA)).toMatchObject({ origen: "atlas", serie: SERIE, numero: null, estado: "borrador", tipo_factura: "F1", base: 100, total: 121 });
    expect(await lineasDe(idA)).toHaveLength(1);
  });

  it("guardar reemplaza las líneas y recalcula", async () => {
    const r = await guardarBorrador(
      sbDuenyo,
      idA,
      entrada([
        { concepto: "Trabajo", cantidad: 1, precioUnitarioCentimos: 10_000 },
        { concepto: "Extra", cantidad: 2, precioUnitarioCentimos: 2_500 },
      ])
    );
    expect(r).toEqual({ ok: true });
    expect(await lineasDe(idA)).toEqual([
      { concepto: "Trabajo", cantidad: 1, precio: 100, importe: 100 },
      { concepto: "Extra", cantidad: 2, precio: 25, importe: 50 },
    ]);
    expect(await fila(idA)).toMatchObject({ base: 150, total: 181.5, numero: null });
  });

  it("un colaborador no crea ni guarda", async () => {
    expect(await crearBorrador(sbColab, entrada([{ concepto: "x", cantidad: 1, precioUnitarioCentimos: 100 }]))).toMatchObject({ ok: false });
    expect(await guardarBorrador(sbColab, idA, entrada([]))).toMatchObject({ ok: false });
  });

  it("borrar un borrador se lo lleva con sus líneas", async () => {
    const id = idDe(await crearBorrador(sbDuenyo, entrada([{ concepto: "Efímero", cantidad: 1, precioUnitarioCentimos: 100 }])));
    expect(await borrarBorrador(sbDuenyo, id)).toEqual({ ok: true });
    expect(await fila(id)).toBeNull();
    expect(await lineasDe(id)).toHaveLength(0);
  });
});

describe("emitir", () => {
  it("sin CIF, la puerta lo nombra y no toca nada", async () => {
    await ponerAjustes(null);
    try {
      const r = await emitir(sbDuenyo, idA, AHORA);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toMatch(/CIF/);
    } finally {
      await ponerAjustes(CIF);
    }
    expect(await fila(idA)).toMatchObject({ estado: "borrador", numero: null });
  });

  it("sin líneas, lo dice", async () => {
    const id = idDe(await crearBorrador(sbDuenyo, entrada([])));
    const r = await emitir(sbDuenyo, id, AHORA);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/línea/);
    expect(await borrarBorrador(sbDuenyo, id)).toEqual({ ok: true });
  });

  it("un colaborador no emite", async () => {
    expect(await emitir(sbColab, idA, AHORA)).toMatchObject({ ok: false, error: expect.stringMatching(/propietario/) });
  });

  it("con todo: número 1, huella, firma verificable, evento y un solo uso de la clave", async () => {
    const usosAntes = await usosDeLaClave();
    const r = await emitir(sbDuenyo, idA, AHORA);
    expect(r).toEqual({ ok: true, numero: 1 });

    const f = await fila(idA);
    expect(f).toMatchObject({ estado: "emitida", numero: 1, huella_anterior: null });
    expect(f.huella).toMatch(/^[0-9A-F]{64}$/);
    expect(await usosDeLaClave()).toBe(usosAntes + 1);
    expect(await eventos(idA, "emision")).toHaveLength(1);

    const eslabon = (await eslabonesDeLaCadena(sbDuenyo)).find((e) => e.numSerie === numSerie(SERIE, 1));
    if (eslabon === undefined) throw new Error("la emitida no está en la cadena");
    expect(eslabon.huella).toBe(f.huella);
    expect(eslabon.genEn).toBe("2091-04-01T10:00:00+02:00");
    expect(verificarFirma(cadenaCanonica(eslabon), f.firma, clavePublicaDe(clavePrivada))).toBe(true);
    expect(await verificarCadena(await eslabonesDeLaCadena(sbDuenyo))).toEqual({ ok: true });
  });

  it("dos emisiones a la vez: 2 y 3 en cualquier orden, y la cadena verifica", async () => {
    const a = idDe(await crearBorrador(sbDuenyo, entrada([{ concepto: "A", cantidad: 1, precioUnitarioCentimos: 1_000 }])));
    const b = idDe(await crearBorrador(sbDuenyo, entrada([{ concepto: "B", cantidad: 1, precioUnitarioCentimos: 2_000 }])));
    const usosAntes = await usosDeLaClave();
    const [ra, rb] = await Promise.all([emitir(sbDuenyo, a, AHORA), emitir(sbDuenyo, b, AHORA)]);
    expect(ra.ok, ra.ok ? "" : ra.error).toBe(true);
    expect(rb.ok, rb.ok ? "" : rb.error).toBe(true);
    expect([ra.numero, rb.numero].sort()).toEqual([2, 3]);
    // Una apertura de la clave por emisión, aunque una de las dos reintentara.
    expect(await usosDeLaClave()).toBe(usosAntes + 2);
    expect(await verificarCadena(await eslabonesDeLaCadena(sbDuenyo))).toEqual({ ok: true });
  });

  it("sin huecos: emitir (4), anular, emitir (5); la anulada sigue en la cadena", async () => {
    const d = idDe(await crearBorrador(sbDuenyo, entrada([{ concepto: "D", cantidad: 1, precioUnitarioCentimos: 4_000 }])));
    expect(await emitir(sbDuenyo, d, AHORA)).toEqual({ ok: true, numero: 4 });
    expect(await anular(sbDuenyo, d, "   ")).toMatchObject({ ok: false });
    expect(await anular(sbDuenyo, d, "cliente equivocado")).toEqual({ ok: true });
    expect(await anular(sbDuenyo, d, "otra vez")).toMatchObject({ ok: false });
    expect(await fila(d)).toMatchObject({ estado: "anulada", numero: 4 });
    expect(await eventos(d, "anulacion")).toHaveLength(1);

    idEmitida5 = idDe(await crearBorrador(sbDuenyo, entrada([{ concepto: "E", cantidad: 1, precioUnitarioCentimos: 5_000 }])));
    expect(await emitir(sbDuenyo, idEmitida5, AHORA)).toEqual({ ok: true, numero: 5 });

    const cadena = await eslabonesDeLaCadena(sbDuenyo);
    expect(cadena.map((e) => e.numSerie)).toEqual(expect.arrayContaining([numSerie(SERIE, 4), numSerie(SERIE, 5)]));
    expect(await verificarCadena(cadena)).toEqual({ ok: true });
  });

  it("una emitida no se emite dos veces", async () => {
    expect(await emitir(sbDuenyo, idEmitida5, AHORA)).toMatchObject({ ok: false, error: expect.stringMatching(/borrador/) });
  });
});

describe("rectificar", () => {
  let idR = "";

  it("crea un borrador R1 en la serie R con las mismas líneas y rectifica_a, sin evento sobre el borrador", async () => {
    idR = idDe(await rectificar(sbDuenyo, idEmitida5, AHORA));
    expect(await fila(idR)).toMatchObject({
      origen: "atlas",
      serie: SERIE_RECTIFICATIVAS,
      numero: null,
      estado: "borrador",
      tipo_factura: "R1",
      rectifica_a: idEmitida5,
      base: 50,
      total: 60.5,
    });
    expect(await lineasDe(idR)).toEqual(await lineasDe(idEmitida5));
    const { rows } = await pg.query(`SELECT count(*)::int AS n FROM factura_eventos WHERE factura_id = $1`, [idR]);
    expect(rows[0].n).toBe(0);
  });

  it("no se rectifica una anulada ni un borrador", async () => {
    const { rows } = await pg.query(`SELECT id FROM facturas WHERE serie = $1 AND numero = 4`, [SERIE]);
    expect(await rectificar(sbDuenyo, rows[0].id, AHORA)).toMatchObject({ ok: false });
    expect(await rectificar(sbDuenyo, idR, AHORA)).toMatchObject({ ok: false });
  });

  it("emitirla la mete en la cadena como R1 con el importe en negativo", async () => {
    const r = await emitir(sbDuenyo, idR, AHORA);
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const f = await fila(idR);
    expect(f).toMatchObject({ estado: "emitida", serie: SERIE_RECTIFICATIVAS, tipo_factura: "R1" });
    expect(f.numero).toBeGreaterThanOrEqual(1);

    const cadena = await eslabonesDeLaCadena(sbDuenyo);
    const eslabon = cadena.find((e) => e.huella === f.huella);
    if (eslabon === undefined) throw new Error("la rectificativa no está en la cadena");
    expect(eslabon).toMatchObject({ tipoFactura: "R1", importeTotalCentimos: -6050, cuotaTotalCentimos: -1050 });
    expect(cadenaCanonica(eslabon)).toContain("&TipoFactura=R1&CuotaTotal=-10.50&ImporteTotal=-60.50&");
    expect(verificarFirma(cadenaCanonica(eslabon), f.firma, clavePublicaDe(clavePrivada))).toBe(true);
    expect(await verificarCadena(cadena)).toEqual({ ok: true });
  });
});

describe("una emitida es inmutable desde aquí", () => {
  it("guardar y borrar dicen que no, sin excepción", async () => {
    const g = await guardarBorrador(sbDuenyo, idA, entrada([{ concepto: "Cambio", cantidad: 1, precioUnitarioCentimos: 1 }]));
    expect(g).toMatchObject({ ok: false, error: expect.stringMatching(/emitida/) });
    const b = await borrarBorrador(sbDuenyo, idA);
    expect(b).toMatchObject({ ok: false, error: expect.stringMatching(/emitida/) });
    expect(await fila(idA)).toMatchObject({ estado: "emitida", numero: 1, base: 150 });
  });

  it("registrarEvento apunta una exportación sobre una emitida; los tipos de las RPC no entran desde la aplicación", async () => {
    await registrarEvento(sbDuenyo, "exportacion", { prueba: true }, idA);
    expect(await eventos(idA, "exportacion")).toEqual([{ detalle: { prueba: true } }]);
    await expect(registrarEvento(sbDuenyo, "rectificacion", { original: idA }, idA)).rejects.toBeDefined();
  });
});
