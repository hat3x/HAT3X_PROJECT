import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";
import { firmar, type CargaSilencio } from "@/lib/alertas/firma";
import { GET } from "@/app/api/silenciar/route";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// 32 bytes exactos. Clave de pruebas: no abre nada real.
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");

let pg: Client;
let idIncidencia = "";

/** Construye la petición tal y como llegaría de una notificación pulsada. */
function peticion(token: string): Request {
  return new Request(`http://localhost:3010/api/silenciar?t=${encodeURIComponent(token)}`);
}

async function tokenPara(hasta: string, expira = Date.now() + 3_600_000): Promise<string> {
  const carga: CargaSilencio = { incidenciaId: idIncidencia, hasta, expira };
  return firmar(carga, CLAVE);
}

async function silenciadaHasta(): Promise<string | null> {
  const { rows } = await pg.query(
    `SELECT silenciada_hasta::text FROM incidencias WHERE id = $1`,
    [idIncidencia]
  );
  return rows[0]?.silenciada_hasta ?? null;
}

beforeAll(async () => {
  process.env.ATLAS_FIRMA_KEY = CLAVE;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Sil','proy-silenciar','interno')
     RETURNING id`
  );
  const {
    rows: [s],
  } = await pg.query(
    `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1,'S','api') RETURNING id`,
    [p.id]
  );
  const {
    rows: [c],
  } = await pg.query(
    `INSERT INTO checks (servicio_id, tipo, url) VALUES ($1,'http','https://ejemplo.test')
     RETURNING id`,
    [s.id]
  );
  const {
    rows: [i],
  } = await pg.query(
    `INSERT INTO incidencias (servicio_id, check_id, severidad, causa)
     VALUES ($1,$2,'critica','HTTP 500') RETURNING id`,
    [s.id, c.id]
  );
  idIncidencia = i.id;
});

afterAll(async () => {
  await pg.query(`DELETE FROM proyectos WHERE slug = 'proy-silenciar'`);
  await pg.end();
});

beforeEach(async () => {
  process.env.ATLAS_FIRMA_KEY = CLAVE;
  await pg.query(`UPDATE incidencias SET silenciada_hasta = NULL WHERE id = $1`, [
    idIncidencia,
  ]);
});

describe("silenciar desde la notificación", () => {
  it("un token válido silencia la incidencia", async () => {
    const respuesta = await GET(peticion(await tokenPara("2026-08-16T15:00:00.000Z")));

    expect(respuesta.status).toBe(200);
    expect(await silenciadaHasta()).not.toBeNull();
  });

  // La abre un navegador desde una notificación del sistema, no un programa.
  it("responde HTML, no JSON", async () => {
    const respuesta = await GET(peticion(await tokenPara("2026-08-16T15:00:00.000Z")));

    expect(respuesta.headers.get("content-type")).toContain("text/html");
    expect(await respuesta.text()).toContain("<");
  });

  it("«hasta resolver» se guarda como infinity", async () => {
    await GET(peticion(await tokenPara("infinity")));
    expect(await silenciadaHasta()).toBe("infinity");
  });

  // Pulsar dos veces el mismo enlace no puede dar un error ni cambiar nada.
  it("es idempotente", async () => {
    const token = await tokenPara("2026-08-16T15:00:00.000Z");
    const primera = await GET(peticion(token));
    const valorTrasPrimera = await silenciadaHasta();
    const segunda = await GET(peticion(token));

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(await silenciadaHasta()).toBe(valorTrasPrimera);
  });

  it("un token manipulado da 410, no 500 ni una traza", async () => {
    const token = await tokenPara("2026-08-16T15:00:00.000Z");
    const respuesta = await GET(peticion(token.slice(0, -4) + "AAAA"));

    expect(respuesta.status).toBe(410);
    expect(await silenciadaHasta()).toBeNull();
  });

  it("un token caducado da 410", async () => {
    const caducado = await tokenPara("2026-08-16T15:00:00.000Z", Date.now() - 1000);
    const respuesta = await GET(peticion(caducado));

    expect(respuesta.status).toBe(410);
    expect(await silenciadaHasta()).toBeNull();
  });

  it("sin token da 410", async () => {
    const respuesta = await GET(new Request("http://localhost:3010/api/silenciar"));
    expect(respuesta.status).toBe(410);
  });

  it("con basura por token da 410 y no revienta", async () => {
    for (const basura of ["x", "a.b", "....", "a.b.c"]) {
      const respuesta = await GET(peticion(basura));
      expect(respuesta.status, basura).toBe(410);
    }
  });

  // Firmado con otra clave: la firma es la ÚNICA autorización que hay aquí.
  it("un token firmado con otra clave no cuela", async () => {
    const otra = Buffer.from("otra-clave-de-32-bytes-distinta!").toString("base64");
    const ajeno = await firmar(
      {
        incidenciaId: idIncidencia,
        hasta: "2026-08-16T15:00:00.000Z",
        expira: Date.now() + 3_600_000,
      },
      otra
    );
    const respuesta = await GET(peticion(ajeno));

    expect(respuesta.status).toBe(410);
    expect(await silenciadaHasta()).toBeNull();
  });

  it("sin clave de firma configurada, no silencia nada", async () => {
    const token = await tokenPara("2026-08-16T15:00:00.000Z");
    process.env.ATLAS_FIRMA_KEY = "";
    const respuesta = await GET(peticion(token));

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    expect(await silenciadaHasta()).toBeNull();
  });

  // Un token bien firmado pero de una incidencia que ya no existe no debe
  // devolver 200 fingiendo que hizo algo.
  it("una incidencia inexistente da 410", async () => {
    const fantasma = await firmar(
      {
        incidenciaId: "99999999-9999-9999-9999-999999999999",
        hasta: "2026-08-16T15:00:00.000Z",
        expira: Date.now() + 3_600_000,
      },
      CLAVE
    );
    const respuesta = await GET(peticion(fantasma));
    expect(respuesta.status).toBe(410);
  });
});
