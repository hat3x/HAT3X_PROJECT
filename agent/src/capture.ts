import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  fileNameOf,
  hasSettled,
  isCaptureCandidate,
  pickCapturedFile,
  type FolderEntry,
} from "@/lib/imaging/watched-folder";

import type { AgentDevice } from "./config.js";

/**
 * Captura por CARPETA VIGILADA — la cáscara de disco.
 *
 * Las decisiones (qué fichero es candidato, cuál es el nuevo, si terminó de
 * escribirse) viven en `@/lib/imaging/watched-folder`, probadas en la suite de
 * la app sin tocar disco. Aquí solo están el `fs` y el reloj.
 *
 * El flujo es deliberadamente simple, porque es el que funciona con CUALQUIER
 * equipo sin pedirle nada a cambio:
 *   1. Foto de lo que hay en la carpeta ANTES de disparar.
 *   2. El profesional dispara en el aparato, como hace siempre.
 *   3. Aparece un fichero nuevo; se espera a que deje de crecer.
 *   4. Se leen sus bytes y se devuelven.
 *
 * Nada se escribe ni se borra en la carpeta de la clínica: es su archivo, y el
 * agente solo mira.
 */

/** Resultado de una captura. */
export interface CapturedImage {
  filename: string;
  mime: string;
  bytes: Buffer;
}

export class CaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureError";
  }
}

/** Cada cuánto se mira la carpeta. */
const POLL_MS = 400;

/**
 * Cuánto se espera a que aparezca la imagen.
 *
 * Treinta segundos son de sobra para colocar el sensor y disparar, y lo bastante
 * poco para que, si algo va mal, la pantalla lo diga en vez de quedarse girando
 * con el paciente en el sillón.
 */
const TIMEOUT_MS = 30_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  dcm: "application/dicom",
};

function mimeFor(filename: string): string {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/**
 * Cuántos niveles se baja por debajo de la carpeta configurada.
 *
 * Hay que bajar porque los equipos no dejan las imágenes sueltas: abren una
 * carpeta por estudio. ImageSensor escribe en `Images/<estudio>/<serie>/`, y
 * mirar solo el primer nivel no encuentra ni una radiografía — se ve una lista
 * de directorios y se concluye que el equipo no guarda nada.
 *
 * Y hay que ponerle tope porque esto se recorre entero cada 400 ms con el
 * paciente en el sillón. Tres niveles cubren lo que hemos visto en clínica con
 * margen; sin tope, apuntar sin querer a `C:\` congelaría la captura.
 */
const MAX_PROFUNDIDAD = 3;

/**
 * Recorre un nivel y baja a los siguientes.
 *
 * `estricto` distingue los dos errores que NO son el mismo: que no se pueda leer
 * la carpeta configurada —que es un fallo de configuración y hay que decirlo— y
 * que no se pueda leer una subcarpeta cualquiera, que puede ser un estudio que
 * el equipo está creando justo ahora y no es noticia.
 */
async function recorre(
  raiz: string,
  prefijo: string,
  profundidad: number,
  estricto: boolean,
  salida: FolderEntry[],
): Promise<void> {
  let entradas;
  try {
    entradas = await readdir(prefijo === "" ? raiz : join(raiz, prefijo), {
      withFileTypes: true,
    });
  } catch (error) {
    if (estricto) throw error;
    return;
  }

  for (const entrada of entradas) {
    const relativo = prefijo === "" ? entrada.name : `${prefijo}/${entrada.name}`;

    if (entrada.isDirectory()) {
      if (profundidad < MAX_PROFUNDIDAD) {
        await recorre(raiz, relativo, profundidad + 1, false, salida);
      }
      continue;
    }
    if (!entrada.isFile()) continue;

    // Se filtra ANTES de preguntar al disco por el tamaño: una carpeta de
    // equipo tiene miles de ficheros que no son imágenes, y este recorrido se
    // repite cada 400 ms.
    if (!isCaptureCandidate(relativo)) continue;

    try {
      const info = await stat(join(raiz, relativo));
      salida.push({ name: relativo, size: info.size, mtimeMs: info.mtimeMs });
    } catch {
      // Puede desaparecer entre el listado y el stat (un temporal que el
      // equipo acaba de renombrar). No es un fallo: simplemente ya no está.
    }
  }
}

/** Lista la carpeta y sus subcarpetas con lo justo para decidir. */
async function snapshot(folder: string): Promise<FolderEntry[]> {
  const encontrados: FolderEntry[] = [];
  await recorre(folder, "", 0, true, encontrados);
  return encontrados;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Espera a que aparezca una imagen nueva en la carpeta del equipo y la devuelve.
 *
 * `now` se inyecta para poder probar el vencimiento sin esperar de verdad.
 */
export async function captureFromWatchedFolder(
  device: AgentDevice,
  options: { timeoutMs?: number; now?: () => number } = {},
): Promise<CapturedImage> {
  const folder = device.settings.path;
  if (typeof folder !== "string" || folder.trim() === "") {
    throw new CaptureError("Este equipo no tiene carpeta configurada.");
  }

  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const startedAt = now();

  let before: string[];
  try {
    before = (await snapshot(folder)).map((entry) => entry.name);
  } catch {
    throw new CaptureError(`No puedo leer la carpeta ${folder}. ¿Existe y es accesible?`);
  }

  let pendingName: string | null = null;
  let previousSize = -1;

  while (now() - startedAt < timeoutMs) {
    await sleep(POLL_MS);

    const after = await snapshot(folder);

    if (pendingName === null) {
      const candidate = pickCapturedFile(before, after);
      if (candidate === null) continue;
      // Encontrado. A partir de aquí solo se vigila que termine de escribirse.
      pendingName = candidate.name;
      previousSize = candidate.size;
      continue;
    }

    const current = after.find((entry) => entry.name === pendingName);
    if (current === undefined) {
      // Desapareció: era un temporal que el equipo renombró. Se vuelve a buscar.
      pendingName = null;
      previousSize = -1;
      continue;
    }

    if (hasSettled(previousSize, current.size)) {
      const bytes = await readFile(join(folder, current.name));
      const nombre = fileNameOf(current.name);
      return { filename: nombre, mime: mimeFor(nombre), bytes };
    }

    previousSize = current.size;
  }

  throw new CaptureError(
    "No ha llegado ninguna imagen. Comprueba que el equipo guarda en la carpeta configurada.",
  );
}
