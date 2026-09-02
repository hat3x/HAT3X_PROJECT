import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Cola en disco de las imágenes que llegan por DICOM.
 *
 * ── POR QUÉ HAY UNA COLA ────────────────────────────────────────────────────
 * El equipo envía la radiografía cuando termina, que pueden ser minutos después
 * y con la ficha ya cerrada. No hay un navegador esperando a quien devolvérsela,
 * y el agente no puede subirla él porque no tiene credenciales —esa es la
 * promesa del diseño: si el PC de la clínica se ve comprometido, aquí no hay
 * ninguna llave que robar—.
 *
 * Así que se guarda en disco y espera. Cuando alguien abre Kairos, su navegador
 * pregunta qué hay, se lo lleva y lo sube. La imagen no depende de que hubiera
 * alguien mirando en el momento del disparo.
 *
 * ── LO QUE NO SE FÍA ────────────────────────────────────────────────────────
 * El nombre del elemento viaja desde el navegador. Aceptarlo tal cual
 * convertiría al agente en un lector de ficheros a la carta: bastaría pedir
 * `../../../.ssh/id_rsa`. `esNombreValido` lo cierra, y además se comprueba que
 * la ruta resuelta siga dentro de la carpeta de la cola: dos cierres para el
 * mismo agujero, porque este es el que de verdad haría daño.
 */

/** Extensión de los ficheros encolados. */
const EXT = ".dcm";

/**
 * Nombres admitidos: los que genera esta misma cola.
 *
 * Deliberadamente estricto —hex, guiones y la extensión— en vez de "quitar los
 * puntos": una lista blanca no se queda corta cuando aparece una forma de
 * escapar que no habíamos previsto.
 */
const NOMBRE_VALIDO = /^[0-9a-f-]{36}\.dcm$/;

export function esNombreValido(nombre: string): boolean {
  return NOMBRE_VALIDO.test(nombre);
}

/**
 * Nombre con el que se escriben los bytes ANTES de renombrar al definitivo.
 *
 * Es una función y no una plantilla suelta para poder demostrar la invariante
 * que sostiene todo esto: un temporal NUNCA puede ser un nombre servible. Si
 * alguien relajara `esNombreValido`, el test lo caza.
 */
export function nombreTemporal(item: string): string {
  return `.${item}.parcial`;
}

export interface ElementoEnCola {
  /** Nombre del fichero; es lo que el navegador devuelve para pedirlo o borrarlo. */
  item: string;
  /** Bytes que ocupa, para que la pantalla pueda avisar de una subida grande. */
  bytes: number;
  /** Cuándo se recibió, en ISO. */
  recibidoEn: string;
}

/** Error de la cola, distinguible para poder contarlo sin confundirlo con otro. */
export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueError";
  }
}

export class ColaDicom {
  private readonly dir: string;

  constructor(directorio: string) {
    this.dir = resolve(directorio);
  }

  async asegurarDirectorio(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /**
   * Resuelve el fichero de un elemento, o lanza.
   *
   * Segunda cerradura: aunque `esNombreValido` ya lo impide, se comprueba que la
   * ruta final cuelgue de la carpeta de la cola. Si algún día alguien relaja la
   * expresión regular, esto sigue en pie.
   */
  private rutaDe(item: string): string {
    if (!esNombreValido(item)) {
      throw new QueueError("Nombre de elemento no válido.");
    }
    const ruta = resolve(join(this.dir, item));
    if (ruta !== join(this.dir, item)) {
      throw new QueueError("Nombre de elemento no válido.");
    }
    return ruta;
  }

  /**
   * Guarda una imagen recibida.
   *
   * Se escribe con un nombre temporal y se renombra al definitivo: `rename` es
   * atómico dentro del mismo volumen, así que el navegador nunca puede llevarse
   * un fichero a medio escribir. Sin eso, una imagen grande recibida justo
   * cuando alguien abre Kairos se subiría truncada.
   */
  async guardar(bytes: Uint8Array): Promise<string> {
    await this.asegurarDirectorio();
    const item = `${randomUUID()}${EXT}`;
    const temporal = join(this.dir, nombreTemporal(item));
    await writeFile(temporal, bytes);
    await rename(temporal, join(this.dir, item));
    return item;
  }

  /** Lo que espera a subirse, de lo más antiguo a lo más reciente. */
  async listar(): Promise<ElementoEnCola[]> {
    await this.asegurarDirectorio();
    const nombres = await readdir(this.dir);

    const elementos: ElementoEnCola[] = [];
    for (const nombre of nombres) {
      // Los `.parcial` son escrituras en curso: todavía no son una imagen.
      if (!esNombreValido(nombre)) continue;
      const info = await stat(join(this.dir, nombre));
      elementos.push({
        item: nombre,
        bytes: info.size,
        recibidoEn: info.mtime.toISOString(),
      });
    }

    return elementos.sort((a, b) => a.recibidoEn.localeCompare(b.recibidoEn));
  }

  /** Los bytes de un elemento, para que el navegador los suba. */
  async leer(item: string): Promise<Buffer> {
    return readFile(this.rutaDe(item));
  }

  /**
   * Lo borra, una vez subido.
   *
   * Si ya no está, no es un error: el navegador puede reintentar la confirmación
   * tras un corte de red, y fallar ahí solo conseguiría que la pantalla enseñara
   * un problema donde no lo hay.
   */
  async borrar(item: string): Promise<void> {
    try {
      await unlink(this.rutaDe(item));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }
}
