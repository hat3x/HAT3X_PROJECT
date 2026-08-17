/**
 * Endpoint `GET /api/cron/reminders` (`@/app/api/cron/reminders/route`).
 *
 * Es el disparador de los recordatorios de cita: reenvía a la Edge Function
 * `process-reminders`, que envía WhatsApp y SMS REALES a los clientes. Por eso
 * lo que se prueba aquí es, sobre todo, QUIÉN puede dispararlo.
 *
 * El caso que motiva este fichero es el primero: sin `CRON_SECRET` definida, la
 * versión anterior se saltaba la comprobación entera —`if (cronSecret) { … }`— y
 * ejecutaba igual. Una variable de entorno que faltaba desactivaba la seguridad
 * y dejaba la ruta abierta a cualquiera. Ahora falla cerrado: sin secreto no se
 * dispara nada, y se comprueba que NO se llama a la Edge Function, no solo que
 * el código de estado sea feo.
 *
 * Se mockea `fetch` global: aquí no se habla con Supabase ni se envía nada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/cron/reminders/route";

const SECRETO = "secreto-de-prueba";
const URL_SUPABASE = "https://ejemplo.supabase.co";
const SERVICE_ROLE = "service-role-de-prueba";

const entorno = { ...process.env };
const fetchMock = vi.fn();

function peticion(cabeceras: Record<string, string> = {}): Request {
  return new Request("https://ejemplo.test/api/cron/reminders", { headers: cabeceras });
}

function respuestaEdge(cuerpo: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => cuerpo,
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(respuestaEdge({ processed: 3 }));

  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_SUPABASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  process.env.CRON_SECRET = SECRETO;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...entorno };
});

describe("autorización del disparador", () => {
  // El fallo que había: sin secreto configurado, la comprobación se saltaba y
  // la ruta quedaba abierta al mundo, disparando envíos reales.
  it("sin CRON_SECRET no dispara NADA y responde 500", async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(peticion());

    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("CRON_SECRET"),
    });
  });

  it("con CRON_SECRET vacía tampoco: una cadena de espacios no es un secreto", async () => {
    process.env.CRON_SECRET = "   ";

    const res = await GET(peticion());

    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin credencial responde 401 sin llamar a la Edge Function", async () => {
    const res = await GET(peticion());

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con un secreto que no es el bueno, 401", async () => {
    const res = await GET(peticion({ authorization: "Bearer otro-secreto" }));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acepta el Bearer que adjunta Vercel", async () => {
    const res = await GET(peticion({ authorization: `Bearer ${SECRETO}` }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("acepta también la cabecera directa, para poder dispararlo a mano", async () => {
    const res = await GET(peticion({ "x-cron-secret": SECRETO }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("reenvío a la Edge Function", () => {
  it("llama a process-reminders con la clave de servicio", async () => {
    await GET(peticion({ authorization: `Bearer ${SECRETO}` }));

    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${URL_SUPABASE}/functions/v1/process-reminders`);
    expect(opciones.method).toBe("POST");
    expect(opciones.headers.Authorization).toBe(`Bearer ${SERVICE_ROLE}`);
  });

  it("devuelve lo que responda la Edge Function", async () => {
    const res = await GET(peticion({ authorization: `Bearer ${SECRETO}` }));
    await expect(res.json()).resolves.toEqual({ processed: 3 });
  });

  it("sin la URL o la clave de Supabase, 500 y sin llamar", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await GET(peticion({ authorization: `Bearer ${SECRETO}` }));

    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Que la función no esté desplegada es exactamente lo que pasa hoy: conviene
  // que se distinga de «se disparó y fue bien».
  it("si la Edge Function falla, 502 y no finge que fue bien", async () => {
    fetchMock.mockResolvedValue(respuestaEdge({ error: "NOT_FOUND" }, false));

    const res = await GET(peticion({ authorization: `Bearer ${SECRETO}` }));

    expect(res.status).toBe(502);
  });

  it("si la red falla, 500 en vez de reventar", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET(peticion({ authorization: `Bearer ${SECRETO}` }));

    expect(res.status).toBe(500);
  });
});
