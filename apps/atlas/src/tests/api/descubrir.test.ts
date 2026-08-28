import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { Client } from "pg";
import { cifrar } from "@/lib/cripto/cifrado";
import { aBytea } from "@/lib/db/credenciales";
import { BASE_RESERVAS } from "@/lib/descubrir/aplicar";
import {
  SLUG_KAIROS,
  PROVEEDOR_CENSO,
  ETIQUETA_CENSO,
  TIPO_ENLACE_CENSO,
} from "@/lib/descubrir/ajustes";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// 32 bytes exactos. Ninguna de las dos abre nada real.
const MAESTRA = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString(
  "base64"
);
const CRON = "secreto-de-cron-para-pruebas";

const URL_KAIROS = "https://kairos.ejemplo.test";
const CLAVE_KAIROS = "service_role_de_kairos_de_prueba";

let pg: Client;
let POST: (peticion: Request) => Promise<Response>;

/** La petición tal y como la manda `net.http_post` desde pg_cron. */
function peticion(autorizacion: string | null = `Bearer ${CRON}`): Request {
  return new Request("http://localhost:3010/api/descubrir", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(autorizacion ? { Authorization: autorizacion } : {}),
    },
    body: "{}",
  });
}

/** El de verdad, capturado antes de que nadie lo sustituya. */
const FETCH_REAL = globalThis.fetch;

/**
 * Responde a la RPC del censo con lo que se le diga, y DEJA PASAR todo lo demás.
 *
 * El pasapuertas no es un detalle: `supabase-js` resuelve `globalThis.fetch` en
 * cada llamada, así que un doble que responda a todo se tragaría también las
 * consultas a la base y el test comprobaría un mundo que no existe.
 */
function censoDevuelve(cuerpo: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (recurso: RequestInfo | URL, opciones?: RequestInit) => {
      if (!String(recurso).startsWith(URL_KAIROS)) {
        return FETCH_REAL(recurso, opciones);
      }
      return {
        ok,
        status,
        json: async () => cuerpo,
        text: async () => JSON.stringify(cuerpo),
      } as Response;
    })
  );
}

/** La llamada al censo, buscada entre las que además fueron a la base. */
function llamadaAlCenso() {
  const llamada = vi
    .mocked(fetch)
    .mock.calls.find(([recurso]) => String(recurso).startsWith(URL_KAIROS));
  if (!llamada) throw new Error("El descubridor no llamó a la RPC del censo.");
  return llamada;
}

async function limpiar() {
  await pg.query(`DELETE FROM proyectos WHERE slug = $1`, [SLUG_KAIROS]);
  await pg.query(`DELETE FROM descubrimientos`);
}

async function darDeAltaKairos({
  conEnlace = true,
  conCredencial = true,
} = {}): Promise<string> {
  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Kairos', $1, 'producto-propio', 'produccion') RETURNING id`,
    [SLUG_KAIROS]
  );

  if (conEnlace) {
    await pg.query(
      `INSERT INTO enlaces (proyecto_id, etiqueta, url, tipo)
       VALUES ($1, 'Supabase', $2, $3)`,
      [p.id, URL_KAIROS, TIPO_ENLACE_CENSO]
    );
  }

  if (conCredencial) {
    // Cifrada de verdad con la clave maestra de pruebas: así el camino que se
    // recorre es el mismo que en producción, descifrado incluido.
    const s = await cifrar(CLAVE_KAIROS, MAESTRA);
    await pg.query(
      `INSERT INTO credenciales (proveedor, etiqueta, proyecto_id,
                                 secreto_cifrado, iv, tag)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        PROVEEDOR_CENSO,
        ETIQUETA_CENSO,
        p.id,
        aBytea(s.cifrado),
        aBytea(s.iv),
        aBytea(s.tag),
      ]
    );
  }

  return p.id as string;
}

async function ultimoDescubrimiento() {
  const { rows } = await pg.query(
    `SELECT ok, altas, pausados, reactivados, error
     FROM descubrimientos ORDER BY ejecutado_en DESC, id DESC LIMIT 1`
  );
  return rows[0] ?? null;
}

async function checksDe(proyectoId: string) {
  const { rows } = await pg.query(
    `SELECT c.url, c.activo, c.notifica FROM checks c
     JOIN servicios s ON s.id = c.servicio_id
     WHERE s.proyecto_id = $1 ORDER BY c.url`,
    [proyectoId]
  );
  return rows;
}

beforeAll(async () => {
  process.env.ATLAS_CRON_KEY = CRON;
  process.env.ATLAS_MASTER_KEY = MAESTRA;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;

  // Se importa DESPUÉS de fijar el entorno. El módulo lo lee al recibir la
  // petición, pero importarlo antes dejaría el orden a merced del cargador.
  ({ POST } = await import("@/app/api/descubrir/route"));

  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
});

beforeEach(async () => {
  vi.unstubAllGlobals();
  await limpiar();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await limpiar();
  await pg.end();
});

describe("POST /api/descubrir", () => {
  // Quien llegue aquí sin la clave puede dar de alta y pausar la vigilancia de
  // cualquier cliente. Se comprueba antes de tocar nada, y sin dejar registro:
  // un intento fallido no es una pasada del descubridor.
  it("sin autorización devuelve 401 y no hace nada", async () => {
    await darDeAltaKairos();

    const r = await POST(peticion(null));

    expect(r.status).toBe(401);
    expect(await ultimoDescubrimiento()).toBeNull();
  });

  it("con una clave equivocada devuelve 401", async () => {
    const r = await POST(peticion("Bearer no-es-esta"));

    expect(r.status).toBe(401);
    expect(await ultimoDescubrimiento()).toBeNull();
  });

  it("da de alta el salón que está en el censo y no se vigilaba", async () => {
    const idProyecto = await darDeAltaKairos();
    censoDevuelve([
      { slug: "salon-uno", name: "Salón Uno", sector: "peluqueria" },
    ]);

    const r = await POST(peticion());

    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true,
      altas: 1,
      pausados: 0,
      reactivados: 0,
    });
    expect(await checksDe(idProyecto)).toEqual([
      { url: `${BASE_RESERVAS}/salon-uno`, activo: true, notifica: true },
    ]);
  });

  it("manda la clave descifrada de Kairos a su RPC", async () => {
    await darDeAltaKairos();
    censoDevuelve([]);

    await POST(peticion());

    const [url, opciones] = llamadaAlCenso();
    expect(url).toBe(`${URL_KAIROS}/rest/v1/rpc/atlas_list_salons`);
    const cab = (opciones as RequestInit).headers as Record<string, string>;
    expect(cab.apikey).toBe(CLAVE_KAIROS);
  });

  it("deja escrita la pasada que salió bien", async () => {
    await darDeAltaKairos();
    censoDevuelve([{ slug: "uno", name: "Uno", sector: "peluqueria" }]);

    await POST(peticion());

    expect(await ultimoDescubrimiento()).toEqual({
      ok: true,
      altas: 1,
      pausados: 0,
      reactivados: 0,
      error: null,
    });
  });

  // El estado de hoy: la RPC todavía no está desplegada en Kairos. Tiene que
  // quedar escrito y no reconciliar nada — nunca pausar por un fallo de red.
  it("con la RPC sin desplegar no toca la vigilancia y anota el motivo", async () => {
    const idProyecto = await darDeAltaKairos();
    censoDevuelve({ message: "Not Found" }, false, 404);

    const r = await POST(peticion());

    expect(r.status).toBe(500);
    expect(await checksDe(idProyecto)).toEqual([]);
    const fila = await ultimoDescubrimiento();
    expect(fila.ok).toBe(false);
    expect(fila.error).toContain("404");
  });

  it("sin la credencial en el llavero lo anota en vez de reventar", async () => {
    await darDeAltaKairos({ conCredencial: false });

    const r = await POST(peticion());

    expect(r.status).toBe(500);
    const fila = await ultimoDescubrimiento();
    expect(fila.ok).toBe(false);
    expect(fila.error).toContain(ETIQUETA_CENSO);
  });

  // Las demos se vigilan igual, pero no despiertan a nadie de madrugada.
  it("da de alta las demos sin avisos", async () => {
    const idProyecto = await darDeAltaKairos();
    censoDevuelve([
      { slug: "demo-peluqueria", name: "Demo", sector: "peluqueria" },
    ]);

    await POST(peticion());

    expect(await checksDe(idProyecto)).toEqual([
      {
        url: `${BASE_RESERVAS}/demo-peluqueria`,
        activo: true,
        notifica: false,
      },
    ]);
  });
});
