import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { escribirCredencial } from "@/lib/db/credenciales";
import {
  ajustesDeEmision,
  PROVEEDOR_FIRMA,
  ETIQUETA_FIRMA,
} from "@/lib/facturas/ajustes-emision";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// 32 bytes exactos, igual que en credenciales.test.ts: clave de pruebas, no abre nada real.
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");

const CORREO_DUENYO = "duenyo-emision@atlas.test";
const CORREO_COLAB = "colab-emision@atlas.test";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idColab = "";

// Lo que hubiera en la fila antes de este fichero: se restaura en `afterAll`,
// porque `ajustes_economia` es una fila única compartida con el resto de la
// suite (rentabilidad, ajustes de economía…).
let original: { razonSocial: string | null; cif: string | null; direccion: string | null; validadoGestoria: boolean };

async function ponerAjustes(razonSocial: string | null, cif: string | null, direccion: string | null, validadoGestoria = false) {
  await pg.query(
    `UPDATE ajustes_economia SET razon_social=$1, cif=$2, direccion=$3, validado_gestoria=$4 WHERE id=1`,
    [razonSocial, cif, direccion, validadoGestoria]
  );
}

async function limpiarCredencialFirma() {
  await pg.query(
    `DELETE FROM credenciales WHERE proveedor=$1 AND etiqueta=$2 AND proyecto_id IS NULL`,
    [PROVEEDOR_FIRMA, ETIQUETA_FIRMA]
  );
}

async function altaUsuario(correo: string, propietario: boolean, storageKey: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,$2)`, [creado.data.user.id, propietario]);
  const sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey },
  });
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: "contrasena-de-prueba" });
  if (error) throw error;
  return { sb, id: creado.data.user.id };
}

beforeAll(async () => {
  process.env.ATLAS_MASTER_KEY = CLAVE;

  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza también antes: un fallo previo puede haber dejado usuarios o la
  // credencial de firma a medio crear.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await limpiarCredencialFirma();

  const { rows } = await pg.query(
    `SELECT razon_social, cif, direccion, validado_gestoria FROM ajustes_economia WHERE id=1`
  );
  original = {
    razonSocial: rows[0].razon_social,
    cif: rows[0].cif,
    direccion: rows[0].direccion,
    validadoGestoria: rows[0].validado_gestoria,
  };

  const d = await altaUsuario(CORREO_DUENYO, true, "emision-d");
  const c = await altaUsuario(CORREO_COLAB, false, "emision-c");
  sbDuenyo = d.sb;
  idDuenyo = d.id;
  sbColab = c.sb;
  idColab = c.id;
});

afterAll(async () => {
  try {
    try {
      await ponerAjustes(original.razonSocial, original.cif, original.direccion, original.validadoGestoria);
    } catch {
      /* la fila ya no está */
    }
    try {
      await limpiarCredencialFirma();
    } catch {
      /* ya no está */
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

describe("ajustesDeEmision — la puerta de emisión", () => {
  it("un colaborador recibe un error de permiso, no de configuración, aunque la fila esté vacía", async () => {
    await ponerAjustes(null, null, null);
    const r = await ajustesDeEmision(sbColab);
    expect(r).toEqual({ ok: false, error: "Solo el propietario puede emitir facturas." });
  });

  it("con la fila vacía, nombra primero la razón social", async () => {
    await ponerAjustes(null, null, null);
    const r = await ajustesDeEmision(sbDuenyo);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/razón social/i);
    expect(!r.ok && r.error).toMatch(/Ajustes → Economía/);
  });

  it("con razón social pero sin CIF, nombra el CIF", async () => {
    await ponerAjustes("HAT3X S.L.", null, null);
    const r = await ajustesDeEmision(sbDuenyo);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("Falta el CIF del emisor: rellénalo en Ajustes → Economía.");
  });

  it("con razón social y CIF pero sin dirección, nombra la dirección", async () => {
    await ponerAjustes("HAT3X S.L.", "B12345678", null);
    const r = await ajustesDeEmision(sbDuenyo);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/dirección/i);
  });

  it("con los tres datos fiscales pero sin credencial de firma, nombra el llavero", async () => {
    await ponerAjustes("HAT3X S.L.", "B12345678", "Calle Falsa 123, Madrid");
    await limpiarCredencialFirma();
    const r = await ajustesDeEmision(sbDuenyo);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe(
      `No hay en el llavero una credencial «${PROVEEDOR_FIRMA} / ${ETIQUETA_FIRMA}»: genérala en Ajustes → Economía.`
    );
  });

  it("con todo puesto, devuelve ok con el id de la credencial y el aviso de gestoría", async () => {
    await ponerAjustes("HAT3X S.L.", "B12345678", "Calle Falsa 123, Madrid", true);
    const alta = await escribirCredencial(sbDuenyo, {
      proveedor: PROVEEDOR_FIRMA,
      etiqueta: ETIQUETA_FIRMA,
      secreto: "clave-privada-de-prueba-para-firmar",
      proyectoId: null,
    });
    expect(alta.ok, alta.ok ? "" : alta.error).toBe(true);

    const { rows } = await pg.query(
      `SELECT id FROM credenciales WHERE proveedor=$1 AND etiqueta=$2 AND proyecto_id IS NULL`,
      [PROVEEDOR_FIRMA, ETIQUETA_FIRMA]
    );
    expect(rows).toHaveLength(1);

    const r = await ajustesDeEmision(sbDuenyo);
    expect(r).toEqual({
      ok: true,
      ajustes: {
        razonSocial: "HAT3X S.L.",
        cif: "B12345678",
        direccion: "Calle Falsa 123, Madrid",
        credencialFirmaId: rows[0].id,
        validadoGestoria: true,
      },
    });
  });

  it("un colaborador sigue sin poder, incluso con la configuración completa", async () => {
    const r = await ajustesDeEmision(sbColab);
    expect(r).toEqual({ ok: false, error: "Solo el propietario puede emitir facturas." });
  });
});
