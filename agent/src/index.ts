import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { captureRequestSchema, isAllowedOrigin } from "@/lib/imaging/protocol";

import { captureFromWatchedFolder, CaptureError } from "./capture.js";
import { ConfigError, findDevice, loadConfig, type AgentConfig } from "./config.js";

/**
 * Agente local de captura — servidor.
 *
 * Corre en el PC de la clínica y es el único que puede hablar con el equipo de
 * rayos, porque una página web no puede. La ficha del paciente le pide una
 * captura y **el agente devuelve los bytes al navegador**: es el navegador, que
 * ya está autenticado, quien sube la imagen a Salón OS.
 *
 * Esa dirección es deliberada. Significa que **aquí no hay credenciales**: si el
 * ordenador de la clínica se ve comprometido, no hay ninguna llave que robar.
 *
 * ── LAS CUATRO CERRADURAS ───────────────────────────────────────────────────
 * Un puerto en localhost lo alcanza cualquier página abierta en ese ordenador.
 * Sin cerrarlo, una web cualquiera en otra pestaña podría disparar radiografías
 * o leerse las imágenes recién capturadas. Se cierra por cuadruplicado:
 *
 *   1. Escucha SOLO en 127.0.0.1 — nadie de la red local llega.
 *   2. `Origin` exacto contra la lista emparejada, también en el preflight.
 *   3. Token de emparejamiento en cada mensaje, comparado en tiempo constante.
 *   4. (en `config.ts`) el navegador manda un `deviceId`, nunca una ruta, así
 *      que el agente no puede convertirse en un lector de ficheros a la carta.
 */

const AGENT_VERSION = "0.1.0";

/** Compara secretos sin filtrar por tiempo cuánto coincidían. */
function tokenMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  // `timingSafeEqual` exige la misma longitud; comparar longitudes antes filtra
  // solo eso, que no es el secreto.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sendJson(res: ServerResponse, status: number, body: unknown, origin?: string): void {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    // Una radiografía no debe quedar en ninguna caché intermedia.
    "cache-control": "no-store",
  };
  if (origin !== undefined) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    // El mensaje de captura son unos cientos de bytes; un cuerpo enorme solo
    // puede ser un intento de agotar la memoria del PC de la clínica.
    if (total > maxBytes) throw new Error("cuerpo demasiado grande");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function handlePreflight(res: ServerResponse, origin: string): void {
  res.writeHead(204, {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  });
  res.end();
}

export function createAgentServer(config: AgentConfig) {
  return createServer((req, res) => {
    void (async () => {
      const origin = req.headers.origin;

      // Cerradura 2: sin origen válido no se contesta NADA — ni siquiera qué
      // rutas existen. Se responde 403 sin cabeceras CORS, así que el navegador
      // que lo intente tampoco puede leer la respuesta.
      if (!isAllowedOrigin(origin, config.allowedOrigins)) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "origen no autorizado" }));
        return;
      }
      const allowedOrigin = origin as string;

      if (req.method === "OPTIONS") {
        handlePreflight(res, allowedOrigin);
        return;
      }

      // Sonda para que el panel sepa si hay agente en este ordenador. No revela
      // nada: ni equipos, ni rutas, ni si el token es correcto.
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true, version: AGENT_VERSION }, allowedOrigin);
        return;
      }

      if (req.method === "POST" && req.url === "/capture") {
        let body: unknown;
        try {
          body = await readBody(req);
        } catch {
          sendJson(res, 400, { error: "cuerpo no válido" }, allowedOrigin);
          return;
        }

        const parsed = captureRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "petición no válida" }, allowedOrigin);
          return;
        }

        // Cerradura 3.
        if (!tokenMatches(parsed.data.token, config.pairingToken)) {
          sendJson(res, 401, { error: "agente no emparejado con este panel" }, allowedOrigin);
          return;
        }

        const device = findDevice(config, parsed.data.deviceId);
        if (device === undefined) {
          sendJson(
            res,
            404,
            { error: "ese equipo no está configurado en este ordenador" },
            allowedOrigin,
          );
          return;
        }

        if (device.adapter !== "carpeta") {
          // TWAIN, DICOM y SDK son A1b: llegan cuando haya un equipo real con el
          // que probarlos. Decirlo claro es mejor que fallar de forma rara.
          sendJson(
            res,
            501,
            { error: `El adaptador "${device.adapter}" todavía no está disponible.` },
            allowedOrigin,
          );
          return;
        }

        try {
          const image = await captureFromWatchedFolder(device);
          sendJson(
            res,
            200,
            {
              filename: image.filename,
              mime: image.mime,
              base64: image.bytes.toString("base64"),
            },
            allowedOrigin,
          );
        } catch (error) {
          const message =
            error instanceof CaptureError ? error.message : "No se pudo capturar la imagen.";
          sendJson(res, 502, { error: message }, allowedOrigin);
        }
        return;
      }

      sendJson(res, 404, { error: "no existe" }, allowedOrigin);
    })();
  });
}

async function main(): Promise<void> {
  let config: AgentConfig;
  try {
    config = await loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[agente] Configuración incorrecta: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const server = createAgentServer(config);

  // Cerradura 1: solo 127.0.0.1. En 0.0.0.0 lo alcanzaría cualquier equipo de la
  // red de la clínica — y en muchas consultas esa red es la misma del wifi de la
  // sala de espera.
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`[agente] Escuchando en http://127.0.0.1:${config.port}`);
    console.log(`[agente] Equipos configurados: ${config.devices.length}`);
    console.log(`[agente] Orígenes emparejados: ${config.allowedOrigins.join(", ")}`);
  });
}

// Solo arranca si se ejecuta directamente; importarlo desde un test no levanta
// ningún servidor.
// Hay que preguntarlo de dos maneras porque el agente vive en dos mundos: en
// desarrollo es un módulo ESM y en el paquete de la clínica es CommonJS, donde
// `import.meta` sencillamente no existe. Leer `import.meta.url` allí no da
// `undefined` de forma benigna: revienta con un TypeError nada más cargar el
// fichero, o sea que el agente instalado no llegaría a escuchar nunca.
const ejecutadoDirectamente =
  typeof require !== "undefined" && typeof module !== "undefined"
    ? require.main === module
    : process.argv[1] !== undefined &&
      import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (ejecutadoDirectamente) {
  void main();
}
