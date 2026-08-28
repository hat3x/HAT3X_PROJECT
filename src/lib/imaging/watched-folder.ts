/**
 * Adaptador de CARPETA VIGILADA — decisiones puras (A1a).
 *
 * El adaptador universal: funciona con cualquier equipo capaz de exportar a
 * disco, ortopantomógrafos incluidos. No necesita driver, ni SDK, ni que el
 * fabricante colabore — solo una carpeta.
 *
 * Aquí viven las DECISIONES; el `fs` lo pone el agente. Esa separación es lo que
 * permite probar sin hardware el trozo donde de verdad se falla: distinguir la
 * radiografía buena del temporal a medio escribir.
 */

/** Una entrada de la carpeta, con lo justo para decidir. */
export interface FolderEntry {
  name: string;
  size: number;
  mtimeMs: number;
}

/**
 * Extensiones que sueltan los equipos dentales.
 *
 * `dcm` incluido: los ortopantomógrafos y CBCT suelen escribir DICOM aunque no
 * hablen DICOM por red, y para este adaptador eso es un fichero más.
 */
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "tif", "tiff", "bmp", "dcm"]);

/**
 * Extensiones de escritura en curso.
 *
 * El equipo vuelca aquí y renombra al terminar. Coger el temporal es coger media
 * radiografía — y en una imagen truncada, el trozo que falta puede ser justo la
 * lesión que se buscaba.
 */
const PARTIAL_EXTENSIONS = new Set(["tmp", "part", "crdownload", "temp", "download"]);

/** ¿Este fichero puede ser la captura que esperamos? */
export function isCaptureCandidate(name: string): boolean {
  // Ficheros ocultos y basura del sistema: no son de nadie.
  if (name.startsWith(".")) return false;
  if (name.toLowerCase() === "thumbs.db" || name.toLowerCase() === "desktop.ini") return false;

  const parts = name.toLowerCase().split(".");
  if (parts.length < 2) return false;

  const extension = parts[parts.length - 1]!;
  // `captura.jpg.tmp` tiene extensión de imagen por el medio: manda la última.
  if (PARTIAL_EXTENSIONS.has(extension)) return false;

  return IMAGE_EXTENSIONS.has(extension);
}

/**
 * ¿Terminó el volcado?
 *
 * Se compara el tamaño entre dos lecturas separadas en el tiempo: si no ha
 * cambiado, nadie sigue escribiendo. Un tamaño de cero NO cuenta como estable
 * aunque se repita — el equipo crea el fichero vacío y escribe después, y darlo
 * por bueno ahí archivaría una radiografía de cero bytes.
 */
export function hasSettled(previousSize: number, currentSize: number): boolean {
  if (currentSize <= 0) return false;
  return previousSize === currentSize;
}

/**
 * De todo lo que hay ahora en la carpeta, ¿cuál es la captura recién hecha?
 *
 * Se compara contra la foto de antes de disparar: lo que ya estaba no es nuestro
 * —la carpeta de un equipo acumula meses de estudios—. Entre los nuevos que sean
 * candidatos, el más reciente. Si el equipo dejó un temporal más nuevo que la
 * imagen buena, el temporal se descarta y gana la imagen.
 */
export function pickCapturedFile(
  before: readonly string[],
  after: readonly FolderEntry[],
): FolderEntry | null {
  const previous = new Set(before);

  const candidates = after
    .filter((entry) => !previous.has(entry.name))
    .filter((entry) => isCaptureCandidate(entry.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates[0] ?? null;
}
