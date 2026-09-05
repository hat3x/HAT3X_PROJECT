/**
 * Lista de trabajo DICOM — las citas del día vistas desde el equipo de rayos.
 *
 * ── QUÉ SE CONSTRUYE AQUÍ ───────────────────────────────────────────────────
 * Cuando el profesional abre la lista en ImageSensor, el equipo lanza una
 * consulta C-FIND y espera una respuesta con unos campos concretos. Este módulo
 * produce EXACTAMENTE esos campos.
 *
 * No son campos elegidos por nosotros: son los que el equipo pide, leídos de su
 * `MWLQueryCriteriaItem.xml`. Si sobra alguno lo ignora; si falta el que usa
 * para identificar al paciente, la radiografía vuelve huérfana.
 *
 * ── LO QUE ESTOS TESTS PROTEGEN ─────────────────────────────────────────────
 * Que el paciente viaje identificado y que los identificadores de estudio sean
 * únicos de verdad. Un `StudyInstanceUID` repetido haría que dos radiografías
 * distintas se pisaran en cualquier archivo DICOM del mundo, no solo en el
 * nuestro.
 */
import { describe, it, expect } from "vitest";

import {
  buildWorklistItem,
  dicomUidFromUuid,
  DICOM_UID_MAX,
  isValidDicomUid,
  worklistItemToDataset,
  type WorklistOrderInput,
} from "@/lib/dicom/worklist";

// ---------------------------------------------------------------------------
// Identificadores de estudio (UID)
// ---------------------------------------------------------------------------

describe("dicomUidFromUuid", () => {
  it("usa la rama 2.25, que es la que no exige registrar nada", () => {
    // DICOM PS3.5 anexo B.2: 2.25 + el UUID leído como entero decimal es un UID
    // universalmente único SIN tener que registrar una raíz OID propia.
    const uid = dicomUidFromUuid("b707c628-215d-42cc-8d2e-78c744dd9981");
    expect(uid.startsWith("2.25.")).toBe(true);
  });

  it("convierte el UUID a su valor decimal exacto", () => {
    // 128 bits a cero → 2.25.0 . Comprueba que no se pierde precisión por el
    // camino: con `Number` en vez de BigInt esto saldría mal.
    expect(dicomUidFromUuid("00000000-0000-0000-0000-000000000000")).toBe("2.25.0");
    expect(dicomUidFromUuid("00000000-0000-0000-0000-000000000001")).toBe("2.25.1");
    expect(dicomUidFromUuid("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(
      "2.25.340282366920938463463374607431768211455",
    );
  });

  it("es determinista: el mismo UUID da siempre el mismo UID", () => {
    const uuid = "8f14e45f-ceea-467a-9575-5a4a5a1a1234";
    expect(dicomUidFromUuid(uuid)).toBe(dicomUidFromUuid(uuid));
  });

  it("UUID distintos dan UID distintos", () => {
    const a = dicomUidFromUuid("8f14e45f-ceea-467a-9575-5a4a5a1a1234");
    const b = dicomUidFromUuid("8f14e45f-ceea-467a-9575-5a4a5a1a1235");
    expect(a).not.toBe(b);
  });

  it("acepta el UUID en mayusculas y sin guiones", () => {
    const conGuiones = dicomUidFromUuid("b707c628-215d-42cc-8d2e-78c744dd9981");
    expect(dicomUidFromUuid("B707C628215D42CC8D2E78C744DD9981")).toBe(conGuiones);
  });

  it("rechaza lo que no es un UUID en vez de producir un UID invalido", () => {
    const malos = [
      "",
      "no-es-uuid",
      "b707c628-215d-42cc-8d2e",
      "zzzzzzzz-215d-42cc-8d2e-78c744dd9981",
    ];
    for (const malo of malos) {
      expect(() => dicomUidFromUuid(malo)).toThrow(TypeError);
    }
  });

  it("lo que produce cabe en los 64 caracteres que permite DICOM", () => {
    const maximo = dicomUidFromUuid("ffffffff-ffff-ffff-ffff-ffffffffffff");
    expect(maximo.length).toBeLessThanOrEqual(DICOM_UID_MAX);
  });
});

describe("isValidDicomUid", () => {
  it("acepta los UID que produce el propio modulo", () => {
    expect(isValidDicomUid(dicomUidFromUuid("b707c628-215d-42cc-8d2e-78c744dd9981"))).toBe(true);
  });

  it("acepta UID conocidos del estandar", () => {
    // SOP Class de radiografia intraoral "for presentation".
    expect(isValidDicomUid("1.2.840.10008.5.1.4.1.1.1.3")).toBe(true);
  });

  it("rechaza componentes con cero a la izquierda, que el estandar prohibe", () => {
    expect(isValidDicomUid("1.2.03")).toBe(false);
    expect(isValidDicomUid("1.2.0")).toBe(true); // un cero solo si vale
  });

  it("rechaza lo que no es una secuencia de numeros con puntos", () => {
    for (const malo of ["", ".", "1..2", "1.2.", "a.b", "1.2.3 ", " 1.2"]) {
      expect(isValidDicomUid(malo)).toBe(false);
    }
  });

  it("rechaza pasar de 64 caracteres", () => {
    expect(isValidDicomUid("1." + "9".repeat(64))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El registro de la lista de trabajo
// ---------------------------------------------------------------------------

/** Una cita de ejemplo, con overrides. */
function orden(overrides: Partial<WorklistOrderInput> = {}): WorklistOrderInput {
  return {
    accession: "0000000042",
    studyInstanceUid: "2.25.123456789",
    patientCode: 4321,
    patientFullName: "Yolanda García del Valle",
    patientBirthDate: "1978-04-12",
    scheduledAt: "2026-09-01T08:30:00.000Z", // 10:30 en Madrid
    timeZone: "Europe/Madrid",
    modality: "IO",
    stationAeTitle: "IMAGESENSOR",
    procedureDescription: "Periapical 36",
    performingPhysician: "Nadia Ros",
    ...overrides,
  };
}

describe("buildWorklistItem", () => {
  it("lleva el codigo del paciente como identificador, no el UUID", () => {
    const item = buildWorklistItem(orden());
    expect(item.patientId).toBe("0000004321");
  });

  it("lleva el nombre tal cual, sin partirlo", () => {
    const item = buildWorklistItem(orden());
    expect(item.patientName).toBe("Yolanda García del Valle");
  });

  it("pone la fecha y la hora en la zona de la clinica", () => {
    const item = buildWorklistItem(orden());
    expect(item.scheduledDate).toBe("20260901");
    expect(item.scheduledTime).toBe("103000");
  });

  it("calcula la edad a la fecha de la CITA, no a la de hoy", () => {
    // Un informe impreso meses después tiene que decir la edad que tenía cuando
    // se hizo la radiografía.
    //
    // La cita va DELIBERADAMENTE lejos en el pasado. La primera versión de este
    // test usaba la cita del ejemplo, un día después de hoy, y entonces "a la
    // fecha de la cita" y "a la de hoy" daban lo mismo: el test pasaba igual
    // aunque el código mirase el reloj. Lo destapó una prueba de mutación.
    const enSuDia = buildWorklistItem(
      orden({ patientBirthDate: "1978-04-12", scheduledAt: "2005-06-15T09:00:00.000Z" }),
    );
    expect(enSuDia.patientAge).toBe("027Y");
  });

  it("dos citas del mismo paciente en anios distintos dan edades distintas", () => {
    const joven = buildWorklistItem(
      orden({ patientBirthDate: "1978-04-12", scheduledAt: "1990-01-01T09:00:00.000Z" }),
    );
    const mayor = buildWorklistItem(
      orden({ patientBirthDate: "1978-04-12", scheduledAt: "2040-01-01T09:00:00.000Z" }),
    );
    expect(joven.patientAge).toBe("011Y");
    expect(mayor.patientAge).toBe("061Y");
  });

  it("la edad de la cita del ejemplo", () => {
    expect(buildWorklistItem(orden()).patientAge).toBe("048Y");
  });

  it("la edad respeta si el cumpleanos ya paso o no", () => {
    const antes = buildWorklistItem(
      orden({ patientBirthDate: "1978-12-31", scheduledAt: "2026-09-01T08:30:00.000Z" }),
    );
    expect(antes.patientAge).toBe("047Y");
  });

  it("sin fecha de nacimiento, la edad va vacia en vez de inventada", () => {
    const item = buildWorklistItem(orden({ patientBirthDate: null }));
    expect(item.patientAge).toBe("");
    expect(item.patientBirthDate).toBe("");
  });

  it("el sexo va vacio: Kairos no lo guarda y DICOM permite el tipo 2 vacio", () => {
    // Rellenarlo con un valor por defecto seria afirmar algo que no sabemos.
    // El propio equipo trae 'F' por defecto en su plantilla, que es peor.
    expect(buildWorklistItem(orden()).patientSex).toBe("");
  });

  it("conserva la modalidad y el equipo al que va dirigida la cita", () => {
    const item = buildWorklistItem(orden());
    expect(item.modality).toBe("IO");
    expect(item.stationAeTitle).toBe("IMAGESENSOR");
  });

  it("sin profesional ni descripcion, van vacios y no rompe", () => {
    const item = buildWorklistItem(
      orden({ performingPhysician: null, procedureDescription: null }),
    );
    expect(item.performingPhysician).toBe("");
    expect(item.procedureDescription).toBe("");
  });

  it("limpia el nombre del profesional igual que el del paciente", () => {
    const item = buildWorklistItem(orden({ performingPhysician: "Ros^Nadia" }));
    expect(item.performingPhysician).toBe("Ros Nadia");
  });

  it("rechaza un numero de peticion que el equipo no aceptaria", () => {
    // AccNumSupportChar_RIS = ^[a-zA-Z0-9_-]{3,20}$ — un UUID no cabe.
    expect(() =>
      buildWorklistItem(orden({ accession: "b707c628-215d-42cc-8d2e-78c744dd9981" })),
    ).toThrow(RangeError);
    expect(() => buildWorklistItem(orden({ accession: "ab" }))).toThrow(RangeError);
    expect(() => buildWorklistItem(orden({ accession: "con espacio" }))).toThrow(RangeError);
  });

  it("rechaza un UID de estudio invalido en vez de mandarlo", () => {
    expect(() => buildWorklistItem(orden({ studyInstanceUid: "no-es-un-uid" }))).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// La traducción a etiquetas DICOM: lo que de verdad viaja por el cable
// ---------------------------------------------------------------------------

describe("worklistItemToDataset", () => {
  const ds = worklistItemToDataset(buildWorklistItem(orden()));

  it("declara UTF-8, que es lo que el equipo tiene configurado", () => {
    // Sin esto, "García" y "Muñoz" llegarían rotos.
    expect(ds["00080005"]).toBe("ISO_IR 192");
  });

  it("coloca cada dato en su etiqueta del estandar", () => {
    expect(ds["00080050"]).toBe("0000000042"); // AccessionNumber
    expect(ds["00100010"]).toBe("Yolanda García del Valle"); // PatientName
    expect(ds["00100020"]).toBe("0000004321"); // PatientID
    expect(ds["00100030"]).toBe("19780412"); // PatientBirthDate
    expect(ds["0020000D"]).toBe("2.25.123456789"); // StudyInstanceUID
  });

  it("repite fecha y hora en StudyDate/StudyTime, que es lo que el equipo copia", () => {
    // Su DatasetMapperWS2L.xml mapea ScheduledProcedureStepStartDate → StudyDate.
    expect(ds["00080020"]).toBe("20260901");
    expect(ds["00080030"]).toBe("103000");
  });

  it("mete el paso programado en su secuencia (0040,0100)", () => {
    const paso = ds["00400100"] as Record<string, unknown>[];
    expect(Array.isArray(paso)).toBe(true);
    expect(paso).toHaveLength(1);
    expect(paso[0]?.["00080060"]).toBe("IO"); // Modality
    expect(paso[0]?.["00400001"]).toBe("IMAGESENSOR"); // ScheduledStationAETitle
    expect(paso[0]?.["00400002"]).toBe("20260901"); // fecha de inicio
    expect(paso[0]?.["00400003"]).toBe("103000"); // hora de inicio
    expect(paso[0]?.["00400007"]).toBe("Periapical 36"); // descripcion
    expect(paso[0]?.["00400006"]).toBe("Nadia Ros"); // profesional
  });

  it("incluye TODOS los campos que el equipo consulta", () => {
    // De MWLQueryCriteriaItem.xml. Si el equipo pide un campo y no está en la
    // respuesta, algunos clientes descartan el registro entero.
    const pedidos = [
      "00080005",
      "00080020",
      "00080030",
      "00080050",
      "00080090",
      "00100010",
      "00100020",
      "00100030",
      "00100040",
      "00101010",
      "0020000D",
      "00400100",
    ];
    for (const tag of pedidos) {
      expect(Object.keys(ds)).toContain(tag);
    }
  });

  it("ningun valor es null o undefined: DICOM manda vacio, no ausente", () => {
    for (const [tag, valor] of Object.entries(ds)) {
      expect(valor, `la etiqueta ${tag} no puede ser nula`).not.toBeNull();
      expect(valor, `la etiqueta ${tag} no puede ser undefined`).not.toBeUndefined();
    }
  });
});
