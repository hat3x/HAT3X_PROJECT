import { describe, it, expect } from "vitest";
import { clasificar, repartirSellos, type FilaPendiente } from "@/lib/alertas/pendientes";

const AHORA = "2026-08-16T12:00:00.000Z";

function fila(campos: Partial<FilaPendiente> = {}): FilaPendiente {
  return {
    id: "i1",
    abiertaEn: "2026-08-16T11:00:00.000Z",
    cerradaEn: null,
    notificadaEn: null,
    recuperacionNotificadaEn: null,
    silenciadaHasta: null,
    ...campos,
  };
}

describe("clasificar", () => {
  it("una incidencia recién abierta se avisa como apertura", () => {
    expect(clasificar(fila(), AHORA)).toEqual({ tipo: "apertura", sello: "apertura" });
  });

  it("una apertura ya avisada no se repite", () => {
    const y = fila({ notificadaEn: "2026-08-16T11:01:00.000Z" });
    expect(clasificar(y, AHORA)).toEqual({ tipo: null, sello: null });
  });

  // El fallo que la batería no veía: la fila sigue sellada de la apertura, así
  // que la recuperación no se seleccionaba nunca.
  it("una incidencia cerrada tras avisarse se avisa como recuperación", () => {
    const y = fila({
      notificadaEn: "2026-08-16T11:01:00.000Z",
      cerradaEn: "2026-08-16T11:50:00.000Z",
    });
    expect(clasificar(y, AHORA)).toEqual({ tipo: "recuperacion", sello: "recuperacion" });
  });

  it("no repite la recuperación una vez avisada", () => {
    const y = fila({
      notificadaEn: "2026-08-16T11:01:00.000Z",
      cerradaEn: "2026-08-16T11:50:00.000Z",
      recuperacionNotificadaEn: "2026-08-16T11:51:00.000Z",
    });
    expect(clasificar(y, AHORA)).toEqual({ tipo: null, sello: null });
  });

  // Decir «ya funciona» de algo que nunca se dijo que estaba roto desconcierta
  // más que informar. Se sellan los dos campos para que no vuelva a mirarse.
  it("no avisa la recuperación de una caída que nunca se avisó", () => {
    const y = fila({ cerradaEn: "2026-08-16T11:50:00.000Z" });
    expect(clasificar(y, AHORA)).toEqual({ tipo: null, sello: "ambos" });
  });

  it("una silenciada se sella pero no se envía", () => {
    const y = fila({ silenciadaHasta: "2026-08-16T13:00:00.000Z" });
    expect(clasificar(y, AHORA)).toEqual({ tipo: null, sello: "apertura" });
  });

  it("con el silencio ya vencido vuelve a avisar", () => {
    const y = fila({ silenciadaHasta: "2026-08-16T11:30:00.000Z" });
    expect(clasificar(y, AHORA)).toEqual({ tipo: "apertura", sello: "apertura" });
  });

  // Silenciar «para siempre» se guarda como el infinito de Postgres, que no es
  // una fecha y no se puede comparar como tal.
  it("entiende el silencio infinito", () => {
    const y = fila({ silenciadaHasta: "infinity" });
    expect(clasificar(y, AHORA)).toEqual({ tipo: null, sello: "apertura" });
  });

  it("una recuperación silenciada tampoco se envía, pero se sella", () => {
    const y = fila({
      notificadaEn: "2026-08-16T11:01:00.000Z",
      cerradaEn: "2026-08-16T11:50:00.000Z",
      silenciadaHasta: "infinity",
    });
    expect(clasificar(y, AHORA)).toEqual({ tipo: null, sello: "recuperacion" });
  });
});

describe("repartirSellos", () => {
  it("separa cada fila en el campo que le toca", () => {
    const filas = [
      fila({ id: "abre" }),
      fila({ id: "cierra", notificadaEn: AHORA, cerradaEn: "2026-08-16T11:50:00.000Z" }),
      fila({ id: "nunca-avisada", cerradaEn: "2026-08-16T11:50:00.000Z" }),
      fila({ id: "ya-sellada", notificadaEn: AHORA }),
    ];

    expect(repartirSellos(filas, AHORA)).toEqual({
      apertura: ["abre", "nunca-avisada"],
      recuperacion: ["cierra", "nunca-avisada"],
    });
  });

  it("sin nada que sellar devuelve las dos listas vacías", () => {
    expect(repartirSellos([], AHORA)).toEqual({ apertura: [], recuperacion: [] });
  });
});
