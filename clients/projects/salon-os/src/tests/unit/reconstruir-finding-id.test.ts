/**
 * `elegirHallazgo` — la decisión de a qué hallazgo pertenece una línea de
 * presupuesto huérfana.
 *
 * Lo que hay que demostrar aquí no es que empareje, sino **que se calle cuando
 * no lo sabe**. Un enlace inventado es peor que ninguno: quien abra la ficha
 * leería que ese presupuesto es de ese hallazgo, y nadie se lo habría dicho.
 *
 * Función pura: sin red ni base de datos.
 */
import { describe, it, expect } from "vitest";

import { asignarPorConjunto, elegirHallazgo } from "../../../scripts/reconstruir-finding-id";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function hallazgo(
  id: string,
  recordedAt: string,
  surfaces: string[] | null = [],
): { id: string; surfaces: string[] | null; recorded_at: string } {
  return { id, surfaces, recorded_at: recordedAt };
}

const LINEA = {
  surfaces: ["mesial"],
  createdAt: "2026-08-05T10:00:00.000Z",
};

describe("elegirHallazgo", () => {
  it("sin candidatos no elige nada", () => {
    expect(elegirHallazgo(LINEA, [])).toBeNull();
  });

  it("con un solo candidato lo toma, sin mirar nada más", () => {
    // Superficies distintas y fecha lejana: da igual, no hay con qué confundirlo.
    const unico = hallazgo("h1", "2020-01-01T00:00:00.000Z", ["distal"]);

    expect(elegirHallazgo(LINEA, [unico])).toEqual({ hallazgoId: "h1", motivo: "unico" });
  });

  it("entre varios, gana el que coincide en superficies", () => {
    const elegido = elegirHallazgo(LINEA, [
      hallazgo("h1", "2026-08-05T09:59:00.000Z", ["distal"]), // más cercano en el tiempo
      hallazgo("h2", "2026-01-01T00:00:00.000Z", ["mesial"]), // pero este casa en superficie
    ]);

    // La superficie manda sobre la cercanía: es dato clínico, no una coincidencia.
    expect(elegido).toEqual({ hallazgoId: "h2", motivo: "superficies" });
  });

  it("las superficies se comparan como conjunto, no por orden", () => {
    const linea = { surfaces: ["oclusal", "mesial"], createdAt: LINEA.createdAt };
    const elegido = elegirHallazgo(linea, [
      hallazgo("h1", "2026-08-05T09:00:00.000Z", ["distal"]),
      hallazgo("h2", "2026-01-01T00:00:00.000Z", ["mesial", "oclusal"]),
    ]);

    expect(elegido).toEqual({ hallazgoId: "h2", motivo: "superficies" });
  });

  it("si varios coinciden en superficies, decide el más cercano en el tiempo", () => {
    const elegido = elegirHallazgo(LINEA, [
      hallazgo("lejano", "2026-01-01T00:00:00.000Z", ["mesial"]),
      hallazgo("cercano", "2026-08-05T11:00:00.000Z", ["mesial"]),
    ]);

    expect(elegido).toEqual({ hallazgoId: "cercano", motivo: "cercania" });
  });

  it("si ninguno coincide en superficies, cae a la cercanía entre todos", () => {
    const elegido = elegirHallazgo(LINEA, [
      hallazgo("lejano", "2026-01-01T00:00:00.000Z", ["distal"]),
      hallazgo("cercano", "2026-08-05T10:30:00.000Z", ["oclusal"]),
    ]);

    expect(elegido).toEqual({ hallazgoId: "cercano", motivo: "cercania" });
  });

  it("la cercanía es en valor absoluto: un hallazgo anterior también vale", () => {
    const elegido = elegirHallazgo(LINEA, [
      hallazgo("antes", "2026-08-05T09:50:00.000Z", ["distal"]),
      hallazgo("despues", "2026-08-06T10:00:00.000Z", ["oclusal"]),
    ]);

    expect(elegido).toEqual({ hallazgoId: "antes", motivo: "cercania" });
  });

  it("ante un empate exacto en el tiempo NO elige: se deja sin enlazar", () => {
    // Dos hallazgos del mismo diente registrados en el mismo instante. Es
    // justo el caso en que adivinar haría daño, y el volcado los creó a la vez.
    const elegido = elegirHallazgo(LINEA, [
      hallazgo("h1", "2026-08-05T09:00:00.000Z", ["distal"]),
      hallazgo("h2", "2026-08-05T11:00:00.000Z", ["oclusal"]),
    ]);

    expect(elegido).toBeNull();
  });

  it("un hallazgo sin superficies se compara como conjunto vacío, no revienta", () => {
    const lineaSinSuperficies = { surfaces: [], createdAt: LINEA.createdAt };
    const elegido = elegirHallazgo(lineaSinSuperficies, [
      hallazgo("h1", "2026-01-01T00:00:00.000Z", null),
      hallazgo("h2", "2026-08-05T09:00:00.000Z", ["mesial"]),
    ]);

    expect(elegido).toEqual({ hallazgoId: "h1", motivo: "superficies" });
  });
});

// ---------------------------------------------------------------------------
// asignarPorConjunto — la pasada que resuelve el 88 % de los enlaces
//
// Dos obturaciones del mismo diente son indistinguibles una a una: el volcado
// las creó en el mismo instante y sin superficies. Pero si hay 2 líneas de
// obturación y exactamente 2 hallazgos de obturación, el conjunto se
// corresponde. Cuál va con cuál da igual —son equivalentes—; lo que NO puede
// pasar es que una endodoncia acabe colgando del hallazgo de una corona.
// ---------------------------------------------------------------------------

function linea(id: string, tipo: string, createdAt = "2026-01-01T00:00:00.000Z") {
  return { id, tipo, createdAt };
}

function hallazgoTipado(id: string, tipo: string, recordedAt = "2026-01-01T00:00:00.000Z") {
  return { id, finding_type: tipo, recorded_at: recordedAt };
}

describe("asignarPorConjunto", () => {
  it("empareja 1:1 cuando de ese tipo hay tantas líneas como hallazgos", () => {
    const asignacion = asignarPorConjunto(
      [linea("l1", "obturacion"), linea("l2", "obturacion")],
      [hallazgoTipado("h1", "obturacion"), hallazgoTipado("h2", "obturacion")],
    );

    expect(asignacion.size).toBe(2);
    // Ningún hallazgo repetido: dos líneas colgando del mismo sería peor que
    // dejar una sin enlazar.
    expect(new Set(asignacion.values()).size).toBe(2);
  });

  it("si no cuadra el número, deja ese tipo entero sin enlazar", () => {
    const asignacion = asignarPorConjunto(
      [linea("l1", "obturacion"), linea("l2", "obturacion")],
      [hallazgoTipado("h1", "obturacion")],
    );

    expect(asignacion.size).toBe(0);
  });

  it("nunca cruza tipos: una endodoncia no cuelga del hallazgo de una corona", () => {
    const asignacion = asignarPorConjunto(
      [linea("l1", "endodoncia")],
      [hallazgoTipado("h1", "corona")],
    );

    expect(asignacion.size).toBe(0);
  });

  it("dentro del mismo diente, resuelve los tipos que cuadran y deja los que no", () => {
    const asignacion = asignarPorConjunto(
      [linea("l1", "corona"), linea("l2", "obturacion"), linea("l3", "obturacion")],
      [
        hallazgoTipado("h1", "corona"),
        hallazgoTipado("h2", "obturacion"),
        // falta la segunda obturación: ese tipo no se toca
      ],
    );

    expect([...asignacion.keys()]).toEqual(["l1"]);
    expect(asignacion.get("l1")).toBe("h1");
  });

  it("es determinista: el mismo dato da el mismo emparejado", () => {
    const lineas = [
      linea("l2", "obturacion", "2026-03-01T00:00:00.000Z"),
      linea("l1", "obturacion", "2026-01-01T00:00:00.000Z"),
    ];
    const hallazgos = [
      hallazgoTipado("hB", "obturacion", "2026-03-01T00:00:00.000Z"),
      hallazgoTipado("hA", "obturacion", "2026-01-01T00:00:00.000Z"),
    ];

    const primera = asignarPorConjunto(lineas, hallazgos);
    const segunda = asignarPorConjunto([...lineas].reverse(), [...hallazgos].reverse());

    expect([...primera].sort()).toEqual([...segunda].sort());
    // Y el orden es por tiempo: la línea vieja con el hallazgo viejo.
    expect(primera.get("l1")).toBe("hA");
    expect(primera.get("l2")).toBe("hB");
  });

  it("sin líneas o sin hallazgos no inventa nada", () => {
    expect(asignarPorConjunto([], [hallazgoTipado("h1", "obturacion")]).size).toBe(0);
    expect(asignarPorConjunto([linea("l1", "obturacion")], []).size).toBe(0);
  });
});
