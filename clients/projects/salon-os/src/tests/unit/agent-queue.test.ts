/**
 * Cola en disco del agente de imagen (A1b).
 *
 * Lo que hay que demostrar aquí, por orden de importancia:
 *
 *   1. Que el nombre que llega del navegador NO puede salirse de la carpeta de
 *      la cola. Es el único agujero de esta pieza que haría daño de verdad:
 *      convertiría al agente en un lector de ficheros del PC de la clínica.
 *   2. Que el nombre con el que se escribe mientras llega la imagen nunca es
 *      servible. La atomicidad en sí descansa en `rename`, que es del sistema
 *      de ficheros y no se puede provocar desde un test: se dice aquí en vez de
 *      fingir que está cubierta.
 *   3. Que confirmar dos veces no revienta, porque el navegador reintenta.
 */
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

import {
  ColaDicom,
  esNombreValido,
  nombreTemporal,
  QueueError,
} from "../../../agent/src/queue";

let dir: string;
let cola: ColaDicom;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cola-dicom-"));
  cola = new ColaDicom(dir);
});

describe("nombreTemporal", () => {
  it("el nombre en el que se escribe NUNCA es un nombre servible", () => {
    // Los bytes se escriben aquí y solo al terminar se renombra al definitivo.
    // Si un temporal pudiera colarse por `esNombreValido`, quien abriera Kairos
    // a mitad de una recepción se llevaría la radiografía truncada.
    const item = "b3f1a2c4-5d6e-4f70-8a91-2b3c4d5e6f70.dcm";

    expect(esNombreValido(item)).toBe(true);
    expect(esNombreValido(nombreTemporal(item))).toBe(false);
  });
});

describe("esNombreValido", () => {
  it("acepta los nombres que genera la propia cola", () => {
    expect(esNombreValido("b3f1a2c4-5d6e-4f70-8a91-2b3c4d5e6f70.dcm")).toBe(true);
  });

  it("rechaza el paso de directorios en todas sus formas", () => {
    // El fallo clásico se intenta de varias maneras; la lista blanca las corta
    // todas de una vez, en lugar de ir tapando una por una.
    for (const intento of [
      "../secreto.dcm",
      "../../.ssh/id_rsa",
      "..\\windows\\system32\\config",
      "/etc/passwd",
      "subcarpeta/fichero.dcm",
      ".b3f1a2c4-5d6e-4f70-8a91-2b3c4d5e6f70.dcm.parcial",
    ]) {
      expect(esNombreValido(intento), intento).toBe(false);
    }
  });

  it("rechaza un nombre con la forma correcta pero otra extensión", () => {
    expect(esNombreValido("b3f1a2c4-5d6e-4f70-8a91-2b3c4d5e6f70.exe")).toBe(false);
  });
});

describe("ColaDicom", () => {
  it("guarda una imagen y la devuelve entera", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const item = await cola.guardar(bytes);
    const leido = await cola.leer(item);

    expect(esNombreValido(item)).toBe(true);
    expect([...leido]).toEqual([...bytes]);
  });

  it("no lista lo que todavía se está escribiendo", async () => {
    await cola.asegurarDirectorio();
    // Un fichero parcial es una recepción en curso. Servirlo subiría una
    // radiografía truncada a la ficha del paciente.
    await writeFile(join(dir, ".a-medias.dcm.parcial"), "a medias");

    expect(await cola.listar()).toEqual([]);
  });

  it("no deja rastro del temporal una vez guardada", async () => {
    await cola.guardar(new Uint8Array([9]));

    const ficheros = await readdir(dir);
    expect(ficheros).toHaveLength(1);
    expect(ficheros[0]!.endsWith(".parcial")).toBe(false);
  });

  it("lista de lo más antiguo a lo más reciente", async () => {
    const primero = await cola.guardar(new Uint8Array([1]));
    await new Promise((r) => setTimeout(r, 12));
    const segundo = await cola.guardar(new Uint8Array([2]));

    // Se sube en el orden en que llegaron: es el orden en que se hicieron.
    expect((await cola.listar()).map((e) => e.item)).toEqual([primero, segundo]);
  });

  it("leer un nombre que se sale de la carpeta lanza en vez de leerlo", async () => {
    await expect(cola.leer("../secreto.dcm")).rejects.toBeInstanceOf(QueueError);
  });

  it("borrar un nombre que se sale de la carpeta también lanza", async () => {
    // Sin esta guarda, el agente podría borrar ficheros del PC de la clínica.
    await expect(cola.borrar("../../importante.dcm")).rejects.toBeInstanceOf(QueueError);
  });

  it("borra tras subir, y confirmar dos veces no es un error", async () => {
    const item = await cola.guardar(new Uint8Array([7]));

    await cola.borrar(item);
    await expect(cola.borrar(item)).resolves.toBeUndefined();
    expect(await cola.listar()).toEqual([]);
  });

  it("una cola vacía se lista sin haber existido nunca la carpeta", async () => {
    const nueva = new ColaDicom(join(dir, "todavia-no-existe"));

    expect(await nueva.listar()).toEqual([]);
  });
});
