/**
 * La vuelta: a qué ficha va una radiografía que acaba de llegar.
 *
 * ── LA REGLA QUE GOBIERNA TODO ESTE FICHERO ─────────────────────────────────
 * Una radiografía sin asignar es un incordio: alguien la coloca en dos clics.
 * Una radiografía en la ficha EQUIVOCADA es un problema clínico, y además
 * silencioso — nadie se entera hasta que un dentista diagnostica sobre la boca
 * de otra persona.
 *
 * Por eso este módulo prefiere SIEMPRE dudar. Solo empareja cuando los
 * identificadores que él mismo emitió vuelven intactos y coherentes entre sí.
 * Ante cualquier discrepancia manda la imagen a "sin asignar", que es la
 * respuesta segura.
 *
 * ── DE DÓNDE SALEN LOS DATOS ────────────────────────────────────────────────
 * De las etiquetas del propio fichero DICOM que envía el equipo. Son las que
 * Kairos puso en la lista de trabajo y que ImageSensor copia a la imagen.
 */
import { describe, it, expect } from "vitest";

import {
  matchIncomingImage,
  readDicomTag,
  type IncomingDicomTags,
  type KnownOrder,
} from "@/lib/dicom/incoming";

// Una petición que Kairos publicó y que sigue viva.
const PETICION: KnownOrder = {
  id: "11111111-1111-1111-1111-111111111111",
  salonId: "b707c628-215d-42cc-8d2e-78c744dd9981",
  customerId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  accession: 42,
  patientCode: 4321,
  studyInstanceUid: "2.25.123456789",
};

/** Lo que trae una imagen bien formada. */
function etiquetas(overrides: Partial<IncomingDicomTags> = {}): IncomingDicomTags {
  return {
    patientId: "0000004321",
    accessionNumber: "0000000042",
    studyInstanceUid: "2.25.123456789",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// El camino feliz
// ---------------------------------------------------------------------------

describe("matchIncomingImage · cuando todo cuadra", () => {
  it("empareja con la peticion y con su paciente", () => {
    const r = matchIncomingImage(etiquetas(), [PETICION]);
    expect(r.kind).toBe("order");
    if (r.kind === "order") {
      expect(r.orderId).toBe(PETICION.id);
      expect(r.customerId).toBe(PETICION.customerId);
    }
  });

  it("elige la peticion correcta cuando hay varias abiertas", () => {
    const otra: KnownOrder = {
      ...PETICION,
      id: "22222222-2222-2222-2222-222222222222",
      accession: 43,
      patientCode: 999,
      studyInstanceUid: "2.25.987654321",
      customerId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    };
    const r = matchIncomingImage(etiquetas(), [otra, PETICION]);
    expect(r.kind).toBe("order");
    if (r.kind === "order") expect(r.orderId).toBe(PETICION.id);
  });
});

// ---------------------------------------------------------------------------
// Las discrepancias: aquí es donde se protege al paciente
// ---------------------------------------------------------------------------

describe("matchIncomingImage · cuando algo no cuadra", () => {
  it("si el paciente de la imagen NO es el de la peticion, no empareja", () => {
    // El caso peligroso de verdad: alguien eligió una entrada de la lista y
    // luego cambió el paciente a mano en el equipo. Los identificadores dejan
    // de ser coherentes entre sí, y eso es exactamente lo que hay que detectar.
    const r = matchIncomingImage(etiquetas({ patientId: "0000000999" }), [PETICION]);
    expect(r.kind).toBe("unassigned");
    if (r.kind === "unassigned") expect(r.reason).toBe("identificadores-incoherentes");
  });

  it("si el UID del estudio no es el de la peticion, no empareja", () => {
    const r = matchIncomingImage(etiquetas({ studyInstanceUid: "2.25.555" }), [PETICION]);
    expect(r.kind).toBe("unassigned");
    if (r.kind === "unassigned") expect(r.reason).toBe("identificadores-incoherentes");
  });

  it("un numero de peticion desconocido no se empareja por parecido", () => {
    const r = matchIncomingImage(etiquetas({ accessionNumber: "0000009999" }), [PETICION]);
    expect(r.kind).not.toBe("order");
  });
});

// ---------------------------------------------------------------------------
// Sin petición: la imagen tomada a mano en el equipo
// ---------------------------------------------------------------------------

describe("matchIncomingImage · sin peticion", () => {
  it("con un codigo de paciente valido, va a la ficha de ese paciente", () => {
    // Caso real: el profesional no usó la lista y tecleó el número. Si el
    // código es de los nuestros y no hay nada que lo contradiga, vale.
    const r = matchIncomingImage(
      { patientId: "0000004321", accessionNumber: "", studyInstanceUid: "2.25.777" },
      [],
      { resolvePatientCode: (code) => (code === 4321 ? PETICION.customerId : null) },
    );
    expect(r.kind).toBe("patient");
    if (r.kind === "patient") expect(r.customerId).toBe(PETICION.customerId);
  });

  it("con un codigo que no existe en el salon, queda sin asignar", () => {
    const r = matchIncomingImage(
      { patientId: "0000009999", accessionNumber: "", studyInstanceUid: "2.25.777" },
      [],
      { resolvePatientCode: () => null },
    );
    expect(r.kind).toBe("unassigned");
    if (r.kind === "unassigned") expect(r.reason).toBe("paciente-desconocido");
  });

  it("sin resolvedor de codigos, no inventa: queda sin asignar", () => {
    const r = matchIncomingImage(
      { patientId: "0000004321", accessionNumber: "", studyInstanceUid: "2.25.777" },
      [],
    );
    expect(r.kind).toBe("unassigned");
  });
});

// ---------------------------------------------------------------------------
// Basura y casos límite
// ---------------------------------------------------------------------------

describe("matchIncomingImage · entradas que no valen", () => {
  it("sin identificador de paciente Y SIN peticion que lo cubra, queda sin asignar", () => {
    const r = matchIncomingImage(etiquetas({ patientId: "", accessionNumber: "" }), [PETICION]);
    expect(r.kind).toBe("unassigned");
    if (r.kind === "unassigned") expect(r.reason).toBe("sin-identificador");
  });

  it("sin paciente en la imagen PERO con la peticion intacta, SI empareja", () => {
    // Este test nacio afirmando lo contrario, por instinto de "ante la duda, no
    // asignes". Pero aqui no hay duda: el numero de peticion y el UID del
    // estudio son DOS identificadores que emitio Kairos, que coinciden, y que
    // determinan al paciente sin ambiguedad. Un campo vacio no contradice nada.
    //
    // Y rechazarlo romperia la funcionalidad de verdad: hay equipos que no
    // copian el PatientID a la imagen cuando el estudio vino de la lista de
    // trabajo, porque se apoyan en el estudio. Mandariamos a la bandeja de sin
    // asignar radiografias perfectamente identificadas, sin ganar seguridad.
    const r = matchIncomingImage(etiquetas({ patientId: "" }), [PETICION]);
    expect(r.kind).toBe("order");
    if (r.kind === "order") expect(r.customerId).toBe(PETICION.customerId);
  });

  it("un identificador que no es de los nuestros no se fuerza", () => {
    // El equipo permite teclear IDs a mano y su patron admite otras formas.
    // Que exista no lo convierte en un codigo de Kairos.
    for (const raro of ["ABC123", "0000000000", "12345", "paciente-1"]) {
      const r = matchIncomingImage(
        { patientId: raro, accessionNumber: "", studyInstanceUid: "2.25.777" },
        [],
        { resolvePatientCode: () => PETICION.customerId },
      );
      expect(r.kind).toBe("unassigned");
    }
  });

  it("una peticion ya recibida sigue emparejando: una visita da varias imagenes", () => {
    // Un periapical del 36 y otro del 46 comparten petición. La segunda imagen
    // no puede quedarse sin asignar por llegar después.
    const primera = matchIncomingImage(etiquetas(), [PETICION]);
    const segunda = matchIncomingImage(etiquetas(), [PETICION]);
    expect(primera.kind).toBe("order");
    expect(segunda.kind).toBe("order");
  });

  it("sin peticiones y sin nada mas, queda sin asignar y no revienta", () => {
    const r = matchIncomingImage({ patientId: "", accessionNumber: "", studyInstanceUid: "" }, []);
    expect(r.kind).toBe("unassigned");
  });
});

// ---------------------------------------------------------------------------
// Lectura de etiquetas
// ---------------------------------------------------------------------------

describe("readDicomTag", () => {
  it("lee el valor de una etiqueta", () => {
    expect(readDicomTag({ "00100020": "0000004321" }, "00100020")).toBe("0000004321");
  });

  it("recorta el relleno con que DICOM iguala la longitud de los campos", () => {
    // Los valores DICOM se rellenan a longitud par con un espacio o con un nulo.
    expect(readDicomTag({ "00100020": "0000004321 " }, "00100020")).toBe("0000004321");
    expect(readDicomTag({ "00100020": "0000004321 " }, "00100020")).toBe("0000004321");
  });

  it("una etiqueta ausente o de otro tipo da cadena vacia, no undefined", () => {
    expect(readDicomTag({}, "00100020")).toBe("");
    expect(readDicomTag({ "00100020": null }, "00100020")).toBe("");
    expect(readDicomTag({ "00100020": 42 }, "00100020")).toBe("");
  });

  it("no distingue mayusculas en la etiqueta", () => {
    expect(readDicomTag({ "0020000D": "2.25.1" }, "0020000d")).toBe("2.25.1");
  });
});
