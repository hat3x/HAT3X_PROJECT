/**
 * Identidad DICOM: cómo viaja un paciente de Kairos al equipo de rayos.
 *
 * ── POR QUÉ ESTE MÓDULO EXISTE ──────────────────────────────────────────────
 * El plan es que Kairos publique la lista de trabajo (Modality Worklist) y que
 * la radiografía vuelva sola con el paciente ya identificado dentro del DICOM.
 * Para que eso funcione, el identificador tiene que sobrevivir al viaje de ida
 * y vuelta SIN AMBIGÜEDAD: si se confunde, una radiografía acaba en la ficha de
 * otra persona. Es el peor fallo posible de esta funcionalidad.
 *
 * ── LOS LÍMITES QUE IMPONE EL EQUIPO REAL ───────────────────────────────────
 * Leídos de la configuración de ImageSensor 3.0.2.8 en la clínica:
 *
 *   PIDSupportChar_RIS = ^[a-zA-Z0-9_-]{3,20}$   ID que llega por worklist
 *   PIDSupportChar     = ^[0-9]{10,20}$          ID tecleado a mano
 *   PatientNameLen     = 30
 *   PatientNameSupport = ^[\p{L}\p{M}\p{Nl}\.\d\s()·_-]{0,30}$
 *
 * Un `customers.id` de Kairos es un UUID de 36 caracteres: NO CABE. De ahí el
 * código corto de 10 dígitos, que además cumple los DOS patrones a la vez —
 * así el mismo identificador vale llegue por la lista o lo teclee alguien.
 */
import { describe, it, expect } from "vitest";

import {
  DICOM_PATIENT_NAME_MAX,
  formatDicomDate,
  formatDicomPersonName,
  formatDicomTime,
  formatPatientCode,
  isValidPatientCode,
  parsePatientCode,
} from "@/lib/dicom/identity";

// Los patrones EXACTOS del equipo. Si un día cambian, que fallen estos tests.
const PID_RIS = /^[a-zA-Z0-9_-]{3,20}$/;
const PID_MANUAL = /^[0-9]{10,20}$/;

// ---------------------------------------------------------------------------
// formatPatientCode — el identificador que viaja
// ---------------------------------------------------------------------------

describe("formatPatientCode", () => {
  it("rellena a 10 digitos", () => {
    expect(formatPatientCode(1)).toBe("0000000001");
    expect(formatPatientCode(4321)).toBe("0000004321");
  });

  it("cumple los DOS patrones del equipo, el de worklist y el manual", () => {
    for (const n of [1, 42, 999, 123456, 9999999999]) {
      const code = formatPatientCode(n);
      expect(code).toMatch(PID_RIS);
      expect(code).toMatch(PID_MANUAL);
    }
  });

  it("crece mas alla de 10 digitos sin romper el limite de 20", () => {
    const code = formatPatientCode(12345678901);
    expect(code).toBe("12345678901");
    expect(code.length).toBeLessThanOrEqual(20);
    expect(code).toMatch(PID_RIS);
  });

  it("rechaza el cero y los negativos: la numeracion empieza en 1", () => {
    expect(() => formatPatientCode(0)).toThrow(RangeError);
    expect(() => formatPatientCode(-1)).toThrow(RangeError);
  });

  it("rechaza lo que no es un entero", () => {
    expect(() => formatPatientCode(1.5)).toThrow(RangeError);
    expect(() => formatPatientCode(Number.NaN)).toThrow(RangeError);
  });
});

describe("parsePatientCode / isValidPatientCode", () => {
  it("da la vuelta al formato", () => {
    expect(parsePatientCode("0000004321")).toBe(4321);
  });

  it("acepta lo que produce formatPatientCode", () => {
    for (const n of [1, 7, 4321, 9999999999]) {
      expect(isValidPatientCode(formatPatientCode(n))).toBe(true);
    }
  });

  it("rechaza lo que no reconoce, en vez de adivinar", () => {
    for (const malo of ["", "  ", "abc", "12345", "0000000000", "-1", "1e5", "0000004321x"]) {
      expect(isValidPatientCode(malo)).toBe(false);
      expect(parsePatientCode(malo)).toBeNull();
    }
  });

  it("un UUID NO es un codigo valido: es justo lo que no cabe en el equipo", () => {
    expect(isValidPatientCode("b707c628-215d-42cc-8d2e-78c744dd9981")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatDicomPersonName
// ---------------------------------------------------------------------------

describe("formatDicomPersonName", () => {
  it("mete el nombre COMPLETO en el componente de apellido", () => {
    // Kairos guarda `full_name` como texto libre. Partirlo en nombre y
    // apellidos es imposible de hacer bien en español —"Yolanda García del
    // Valle" no tiene una frontera fiable— y partirlo MAL sale en pantalla
    // como si fuera otra persona. El equipo muestra el componente 0
    // (NamePartInList=0), asi que el nombre entero ahi se lee tal cual.
    expect(formatDicomPersonName("Yolanda García del Valle")).toBe("Yolanda García del Valle");
  });

  it("conserva los acentos y la enye (el equipo usa ISO_IR 192, que es UTF-8)", () => {
    expect(formatDicomPersonName("Begoña Muñoz Íñigo")).toBe("Begoña Muñoz Íñigo");
  });

  it("quita el circunflejo: es el separador de componentes de DICOM", () => {
    // Sin esto, un nombre con ^ partiria el campo y el equipo mostraria basura.
    expect(formatDicomPersonName("Ana^Ruiz")).toBe("Ana Ruiz");
  });

  it("quita la barra invertida: separa valores multiples en DICOM", () => {
    expect(formatDicomPersonName("Ana\\Ruiz")).toBe("Ana Ruiz");
  });

  it("quita el igual: separa alfabetico de ideografico en DICOM", () => {
    expect(formatDicomPersonName("Ana=Ruiz")).toBe("Ana Ruiz");
  });

  it("colapsa espacios y recorta los extremos", () => {
    expect(formatDicomPersonName("  Ana   María   Ruiz  ")).toBe("Ana María Ruiz");
  });

  it("nunca pasa de 30 caracteres, que es el limite del equipo", () => {
    const largo = "María del Carmen Fernández de la Torre y Aguirre";
    const salida = formatDicomPersonName(largo);
    expect(salida.length).toBeLessThanOrEqual(DICOM_PATIENT_NAME_MAX);
  });

  it("al recortar, corta por palabra entera y no a mitad", () => {
    // Aprovecha los 30 caracteres hasta donde llega una palabra completa: aquí
    // entra el "de" (29), y lo que se cae es "la Torre y Aguirre".
    const salida = formatDicomPersonName("María del Carmen Fernández de la Torre y Aguirre");
    expect(salida).toBe("María del Carmen Fernández de");
    expect(salida.endsWith(" ")).toBe(false);
  });

  it("nunca parte una palabra por la mitad", () => {
    // La propiedad que de verdad importa, sobre varios largos: lo que sale
    // tiene que ser un prefijo de palabras enteras del original.
    const original = "Inmaculada Concepción Villaescusa Benavente";
    for (let corte = 0; corte < original.length; corte += 1) {
      const salida = formatDicomPersonName(original.slice(0, corte).trim());
      if (salida === "") continue;
      const palabras = original.split(" ");
      const salidaPalabras = salida.split(" ");
      // Cada palabra de la salida, salvo quizá la última si el original venía
      // ya cortado, coincide con la del original en la misma posición.
      salidaPalabras.slice(0, -1).forEach((palabra, i) => {
        expect(palabra).toBe(palabras[i]);
      });
    }
  });

  it("si una sola palabra ya pasa del limite, la corta igualmente", () => {
    const salida = formatDicomPersonName("A".repeat(45));
    expect(salida).toHaveLength(DICOM_PATIENT_NAME_MAX);
  });

  it("un nombre vacio da cadena vacia, no revienta", () => {
    // PatientName es tipo 2 en DICOM: obligatorio que esté, permitido vacío.
    expect(formatDicomPersonName("")).toBe("");
    expect(formatDicomPersonName("   ")).toBe("");
  });

  it("todo lo que produce cabe en el patron de nombre del equipo", () => {
    const patron = /^[\p{L}\p{M}\p{Nl}.\d\s()·_-]{0,30}$/u;
    const nombres = [
      "Yolanda García del Valle",
      "Begoña Muñoz Íñigo",
      "Ana^Ruiz",
      "José-María (padre)",
      "Ana\\Ruiz=X",
      "  varios   espacios  ",
    ];
    for (const n of nombres) {
      expect(formatDicomPersonName(n)).toMatch(patron);
    }
  });
});

// ---------------------------------------------------------------------------
// Fechas y horas
// ---------------------------------------------------------------------------

describe("formatDicomDate", () => {
  it("usa el formato DA de DICOM: YYYYMMDD", () => {
    expect(formatDicomDate(new Date(Date.UTC(2026, 7, 31)))).toBe("20260831");
  });

  it("rellena mes y dia con cero", () => {
    expect(formatDicomDate(new Date(Date.UTC(2026, 0, 5)))).toBe("20260105");
  });

  it("acepta una fecha en texto ISO, que es como viene de la base", () => {
    expect(formatDicomDate("1999-10-02")).toBe("19991002");
  });

  it("sin fecha devuelve vacio: en DICOM un tipo 2 puede ir vacio", () => {
    expect(formatDicomDate(null)).toBe("");
    expect(formatDicomDate(undefined)).toBe("");
  });

  it("una fecha imposible devuelve vacio en vez de inventarse una", () => {
    expect(formatDicomDate("no es una fecha")).toBe("");
  });
});

describe("formatDicomTime", () => {
  it("usa el formato TM de DICOM: HHMMSS", () => {
    expect(formatDicomTime(new Date(Date.UTC(2026, 7, 31, 9, 5, 3)), "UTC")).toBe("090503");
  });

  it("da la hora LOCAL de la clinica, no UTC", () => {
    // Una cita de las 10:00 en Madrid se guarda como 08:00 UTC en verano. El
    // equipo está en la clínica: tiene que leer 100000, no 080000.
    const cita = new Date("2026-08-31T08:00:00.000Z");
    expect(formatDicomTime(cita, "Europe/Madrid")).toBe("100000");
  });

  it("sin hora devuelve vacio", () => {
    expect(formatDicomTime(null, "Europe/Madrid")).toBe("");
  });
});
