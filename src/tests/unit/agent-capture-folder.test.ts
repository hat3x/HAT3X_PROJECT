/**
 * Captura por carpeta vigilada — el recorrido de disco (A1a).
 *
 * Las decisiones puras viven en `@/lib/imaging/watched-folder` y se prueban
 * aparte. Aquí se prueba lo único que aquel no puede: que el agente ENCUENTRE la
 * radiografía donde el equipo la deja de verdad.
 *
 * Y no la deja donde parecía. El diagnóstico del puesto de radiología de
 * Biodental (31/08/2026) mostró que ImageSensor escribe en
 * `Images/<estudio>/<serie>/`, nunca suelta en `Images`. Con un listado de un
 * solo nivel, la captura no veía más que directorios y vencía a los 30 segundos
 * con el paciente en el sillón — y el mensaje habría dicho que el equipo no
 * guarda en la carpeta configurada, que es mentira y manda a buscar el fallo al
 * sitio equivocado.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

import { captureFromWatchedFolder, CaptureError } from "../../../agent/src/capture";

let raiz: string;

const equipo = (path: string) => ({
  id: "11111111-2222-4333-8444-555555555555",
  adapter: "carpeta" as const,
  settings: { path },
});

/** Deja un fichero creando por el camino las carpetas que hagan falta. */
async function deja(relativo: string, contenido = "bytes-de-imagen"): Promise<void> {
  const destino = join(raiz, relativo);
  await mkdir(join(destino, ".."), { recursive: true });
  await writeFile(destino, contenido);
}

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "captura-"));
});

describe("captureFromWatchedFolder", () => {
  it("encuentra la imagen en la carpeta por estudio, como la deja ImageSensor", async () => {
    // Tal cual salió en el diagnóstico: Images/<estudio>/<serie>/
    const disparo = deja("202604140052510003/2608310052510004/rx-0001.dcm", "radiografia");

    const capturada = await captureFromWatchedFolder(equipo(raiz), { timeoutMs: 4_000 });
    await disparo;

    // El nombre con el que se archiva es el del fichero, NO el camino del
    // ordenador de la clínica.
    expect(capturada.filename).toBe("rx-0001.dcm");
    expect(capturada.mime).toBe("application/dicom");
    expect(capturada.bytes.toString()).toBe("radiografia");
  });

  it("no confunde una imagen que ya estaba con la recién disparada", async () => {
    // La carpeta de un equipo acumula meses de estudios. Devolver una antigua
    // sería adjuntar a esta visita la radiografía de otro día.
    await deja("202508010052510001/2508010052510001/vieja.jpg", "de-agosto");

    const disparo = (async () => {
      await new Promise((r) => setTimeout(r, 60));
      await deja("202608310052510003/2608310052510004/nueva.jpg", "de-hoy");
    })();

    const capturada = await captureFromWatchedFolder(equipo(raiz), { timeoutMs: 4_000 });
    await disparo;

    expect(capturada.filename).toBe("nueva.jpg");
    expect(capturada.bytes.toString()).toBe("de-hoy");
  });

  it("no baja indefinidamente: por debajo del tope no busca", async () => {
    // El tope existe porque esto se recorre entero cada 400 ms. Si alguien
    // configura una carpeta demasiado alta, la captura tiene que vencer con su
    // mensaje, no quedarse recorriendo el disco.
    await deja("uno/dos/tres/cuatro/demasiado-hondo.jpg", "no-deberia-verse");

    await expect(
      captureFromWatchedFolder(equipo(raiz), { timeoutMs: 1_200 }),
    ).rejects.toBeInstanceOf(CaptureError);
  });

  it("dice que la carpeta no se puede leer, en vez de esperar en balde", async () => {
    // Un fallo de configuración tiene que dar la cara al momento: esperar 30
    // segundos y decir "no ha llegado ninguna imagen" manda a mirar el equipo
    // cuando el problema es la ruta.
    await expect(
      captureFromWatchedFolder(equipo(join(raiz, "no-existe")), { timeoutMs: 1_200 }),
    ).rejects.toThrow(/No puedo leer la carpeta/);
  });
});
