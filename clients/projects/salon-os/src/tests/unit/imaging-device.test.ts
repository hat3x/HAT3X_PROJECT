/**
 * Configuración de equipos de imagen por salón (A1a del roadmap de odontología).
 *
 * La decisión de producto que estos tests protegen: el equipo lo elige CADA
 * CLÍNICA, no nosotros. Por eso no hay un fabricante cableado, sino adaptadores
 * con ajustes propios, y lo que se valida es que los ajustes correspondan al
 * adaptador elegido.
 *
 * Por qué importa que sea estricto: una configuración incoherente —una carpeta
 * vigilada con un AE title de DICOM, por ejemplo— no falla al guardarse. Falla
 * el día que alguien intenta hacer una radiografía con el paciente en el sillón.
 * Mejor rechazarla en el formulario de ajustes.
 */
import { describe, it, expect } from "vitest";

import { imagingDeviceSchema } from "@/lib/validations/imaging-device";

/** Base válida a la que cada caso le cambia solo lo que quiere probar. */
function device(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Sensor del gabinete 2",
    adapter: "carpeta",
    settings: { path: "C:\\Radiografias\\salida" },
    modality: "periapical",
    active: true,
    ...overrides,
  };
}

describe("imagingDeviceSchema — adaptador carpeta vigilada", () => {
  it("acepta una carpeta con ruta", () => {
    expect(imagingDeviceSchema.safeParse(device()).success).toBe(true);
  });

  it("rechaza una carpeta sin ruta: no habría dónde vigilar", () => {
    const result = imagingDeviceSchema.safeParse(device({ adapter: "carpeta", settings: {} }));
    expect(result.success).toBe(false);
  });
});

describe("imagingDeviceSchema — adaptador TWAIN", () => {
  it("acepta una fuente TWAIN por nombre", () => {
    const twain = device({ adapter: "twain", settings: { source: "CS 1500 TWAIN" } });
    expect(imagingDeviceSchema.safeParse(twain).success).toBe(true);
  });

  it("rechaza TWAIN sin nombre de fuente", () => {
    const twain = device({ adapter: "twain", settings: {} });
    expect(imagingDeviceSchema.safeParse(twain).success).toBe(false);
  });
});

describe("imagingDeviceSchema — adaptador DICOM", () => {
  it("acepta AE title y puerto", () => {
    const dicom = device({
      adapter: "dicom",
      settings: { aeTitle: "KAIROS_SCP", port: 11112 },
      modality: "panoramic",
    });
    expect(imagingDeviceSchema.safeParse(dicom).success).toBe(true);
  });

  it("rechaza un puerto fuera de rango", () => {
    const dicom = device({
      adapter: "dicom",
      settings: { aeTitle: "KAIROS_SCP", port: 70000 },
    });
    expect(imagingDeviceSchema.safeParse(dicom).success).toBe(false);
  });
});

describe("imagingDeviceSchema — coherencia entre adaptador y ajustes", () => {
  it("no acepta ajustes de OTRO adaptador", () => {
    // Una carpeta con AE title es una configuración que nadie puede usar: se
    // guardaría sin protestar y reventaría con el paciente en el sillón.
    const mezcla = device({ adapter: "carpeta", settings: { aeTitle: "KAIROS_SCP" } });
    expect(imagingDeviceSchema.safeParse(mezcla).success).toBe(false);
  });

  it("no acepta claves de más junto a las correctas", () => {
    const conExtra = device({
      adapter: "carpeta",
      settings: { path: "C:\\Radiografias\\salida", source: "CS 1500 TWAIN" },
    });
    expect(imagingDeviceSchema.safeParse(conExtra).success).toBe(false);
  });

  it("rechaza un adaptador que no existe", () => {
    expect(imagingDeviceSchema.safeParse(device({ adapter: "magia" })).success).toBe(false);
  });
});

describe("imagingDeviceSchema — campos comunes", () => {
  it("exige nombre: la clínica tiene que poder distinguir sus equipos", () => {
    expect(imagingDeviceSchema.safeParse(device({ name: "  " })).success).toBe(false);
  });

  it("exige una modalidad del catálogo clínico", () => {
    expect(imagingDeviceSchema.safeParse(device({ modality: "selfie" })).success).toBe(false);
  });

  it("acepta las modalidades que ya usa patient_images", () => {
    for (const modality of ["periapical", "bitewing", "panoramic", "cbct", "cefalometrica"]) {
      expect(imagingDeviceSchema.safeParse(device({ modality })).success).toBe(true);
    }
  });
});
