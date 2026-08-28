/**
 * Adaptador de CARPETA VIGILADA — decisiones puras (A1a).
 *
 * Es el adaptador universal: funciona con cualquier equipo capaz de exportar a
 * disco, ortopantomógrafos incluidos, y es el único que se puede construir y
 * probar entero sin hardware delante.
 *
 * Lo que se decide aquí no es trivial, y es donde están los fallos que solo
 * aparecen en una clínica de verdad:
 *
 *  · El software del equipo escribe el fichero POCO A POCO. Si lo recoges en
 *    cuanto aparece, te llevas una radiografía a medias — y en una imagen
 *    truncada el trozo que falta puede ser justo la lesión.
 *  · Muchos programas escriben primero un temporal (`.tmp`, `.part`) y luego
 *    renombran. Ese temporal no es la captura.
 *  · En la carpeta hay basura del sistema (`Thumbs.db`) que no es de nadie.
 *
 * El `fs` no vive aquí: esto son las decisiones, y el agente pone el disco.
 */
import { describe, it, expect } from "vitest";

import {
  hasSettled,
  isCaptureCandidate,
  pickCapturedFile,
  type FolderEntry,
} from "@/lib/imaging/watched-folder";

describe("isCaptureCandidate", () => {
  it("acepta los formatos que sueltan los equipos dentales", () => {
    for (const name of [
      "rx-0001.jpg",
      "rx-0001.jpeg",
      "panoramica.png",
      "captura.tif",
      "captura.tiff",
      "estudio.dcm",
      "sensor.bmp",
    ]) {
      expect(isCaptureCandidate(name)).toBe(true);
    }
  });

  it("no distingue mayúsculas en la extensión", () => {
    expect(isCaptureCandidate("RX-0001.JPG")).toBe(true);
  });

  it("rechaza los temporales de escritura", () => {
    // El equipo escribe aquí mientras vuelca; el fichero bueno llega después.
    for (const name of ["captura.tmp", "captura.part", "captura.crdownload", "captura.jpg.tmp"]) {
      expect(isCaptureCandidate(name)).toBe(false);
    }
  });

  it("rechaza basura del sistema y ficheros ocultos", () => {
    for (const name of ["Thumbs.db", ".DS_Store", "desktop.ini"]) {
      expect(isCaptureCandidate(name)).toBe(false);
    }
  });

  it("rechaza lo que no tiene extensión de imagen", () => {
    expect(isCaptureCandidate("informe.pdf")).toBe(false);
    expect(isCaptureCandidate("sinextension")).toBe(false);
  });
});

describe("hasSettled", () => {
  it("dos lecturas con el mismo tamaño: el volcado terminó", () => {
    expect(hasSettled(482_112, 482_112)).toBe(true);
  });

  it("el tamaño sigue creciendo: aún se está escribiendo", () => {
    expect(hasSettled(120_000, 482_112)).toBe(false);
  });

  it("tamaño cero no cuenta como estable aunque no cambie", () => {
    // El equipo crea el fichero vacío y escribe después. Darlo por bueno aquí
    // significa archivar una radiografía de cero bytes.
    expect(hasSettled(0, 0)).toBe(false);
  });
});

describe("pickCapturedFile", () => {
  const entry = (name: string, mtimeMs: number, size = 482_112): FolderEntry => ({
    name,
    size,
    mtimeMs,
  });

  it("devuelve el fichero que no estaba antes", () => {
    const antes = ["viejo.jpg"];
    const despues = [entry("viejo.jpg", 1000), entry("rx-0002.jpg", 2000)];

    expect(pickCapturedFile(antes, despues)?.name).toBe("rx-0002.jpg");
  });

  it("con varios nuevos, se queda con el más reciente", () => {
    const despues = [entry("rx-0002.jpg", 2000), entry("rx-0003.jpg", 3000)];

    expect(pickCapturedFile([], despues)?.name).toBe("rx-0003.jpg");
  });

  it("ignora los nuevos que no son candidatos", () => {
    // El temporal es más reciente que la imagen buena y aun así no se elige.
    const despues = [entry("rx-0002.jpg", 2000), entry("rx-0002.jpg.tmp", 3000)];

    expect(pickCapturedFile([], despues)?.name).toBe("rx-0002.jpg");
  });

  it("null si no ha aparecido nada nuevo", () => {
    const antes = ["viejo.jpg"];
    const despues = [entry("viejo.jpg", 1000)];

    expect(pickCapturedFile(antes, despues)).toBeNull();
  });

  it("null si lo único nuevo es basura", () => {
    expect(pickCapturedFile([], [entry("Thumbs.db", 5000)])).toBeNull();
  });
});
