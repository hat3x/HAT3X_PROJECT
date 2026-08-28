import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  ajustesDeKairos,
  SLUG_KAIROS,
  PROVEEDOR_CENSO,
  ETIQUETA_CENSO,
  TIPO_ENLACE_CENSO,
} from "@/lib/descubrir/ajustes";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const URL_KAIROS = "https://kairos.ejemplo.test";

let pg: Client;
let sb: ReturnType<typeof createClient<Database>>;
let idProyecto = "";

async function limpiar() {
  await pg.query(`DELETE FROM proyectos WHERE slug IN ($1, 'otro-descubrir')`, [
    SLUG_KAIROS,
  ]);
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  // El descubridor corre con `service_role`: lo despierta pg_cron y no hay
  // usuario detrás. Se prueba con el mismo cliente con el que correrá, o RLS
  // taparía aquí un fallo que en producción no existiría.
  sb = createClient<Database>(URL_API, SERVICE, {
    auth: { persistSession: false },
  });
});

beforeEach(async () => {
  await limpiar();
  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Kairos', $1, 'producto-propio', 'produccion') RETURNING id`,
    [SLUG_KAIROS]
  );
  idProyecto = p.id;
});

afterAll(async () => {
  await limpiar();
  await pg.end();
});

/** Deja el enlace al Supabase de Kairos. */
async function conEnlace(url = URL_KAIROS) {
  await pg.query(
    `INSERT INTO enlaces (proyecto_id, etiqueta, url, tipo)
     VALUES ($1, 'Supabase', $2, $3)`,
    [idProyecto, url, TIPO_ENLACE_CENSO]
  );
}

/**
 * Deja la credencial de servicio en el llavero y devuelve su id. Los tres
 * `bytea` son relleno: aquí no se descifra nada, solo se busca la fila.
 */
async function conCredencial(proyecto = idProyecto): Promise<string> {
  const {
    rows: [c],
  } = await pg.query(
    `INSERT INTO credenciales (proveedor, etiqueta, proyecto_id,
                               secreto_cifrado, iv, tag, prefijo)
     VALUES ($1, $2, $3, '\\x00', '\\x00', '\\x00', 'sk_••••test')
     RETURNING id`,
    [PROVEEDOR_CENSO, ETIQUETA_CENSO, proyecto]
  );
  return c.id;
}

describe("ajustes de Kairos", () => {
  it("reúne proyecto, enlace y credencial", async () => {
    await conEnlace();
    const idCredencial = await conCredencial();

    const r = await ajustesDeKairos(sb);

    expect(r).toEqual({
      ok: true,
      ajustes: {
        proyectoId: idProyecto,
        urlSupabase: URL_KAIROS,
        credencialId: idCredencial,
      },
    });
  });

  // Los tres mensajes de abajo son la razón de que esto no sean variables de
  // entorno: cuando falta una pieza, el error dice qué crear y dónde. Un
  // `undefined` leído de `process.env` no dice nada.
  it("dice qué falta si no existe el proyecto", async () => {
    await limpiar();

    const r = await ajustesDeKairos(sb);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain(SLUG_KAIROS);
  });

  it("dice qué falta si no hay enlace al Supabase de Kairos", async () => {
    await conCredencial();

    const r = await ajustesDeKairos(sb);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain(TIPO_ENLACE_CENSO);
  });

  it("dice qué falta si la credencial no está en el llavero", async () => {
    await conEnlace();

    const r = await ajustesDeKairos(sb);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain(ETIQUETA_CENSO);
  });

  // Una credencial de otro proyecto con la misma etiqueta no vale: sería la
  // clave de servicio de OTRO Supabase, y la RPC del censo devolvería 404. Ese
  // 404 se lee como fallo de red, y el fallo sería de configuración.
  it("ignora una credencial que cuelga de otro proyecto", async () => {
    await conEnlace();
    const {
      rows: [otro],
    } = await pg.query(
      `INSERT INTO proyectos (nombre, slug, tipo, estado)
       VALUES ('Otro','otro-descubrir','producto-propio','produccion') RETURNING id`
    );
    await conCredencial(otro.id);

    const r = await ajustesDeKairos(sb);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain(ETIQUETA_CENSO);
  });
});
