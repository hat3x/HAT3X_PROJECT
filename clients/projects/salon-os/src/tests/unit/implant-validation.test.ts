/**
 * Validación del registro de un implante (A3).
 *
 * Este formulario se rellena con el paciente en el sillón y la caja del
 * implante en la mano. Lo que se guarde aquí es lo que habrá que enseñar el día
 * que el fabricante retire un lote o venga una inspección — años después, y sin
 * nadie que recuerde el caso.
 *
 * De ahí las dos tensiones que resuelve el esquema:
 *
 *  · **Exigir poco para no perder el registro.** Si pide demasiado, alguien
 *    cierra el formulario y el implante no queda anotado en ninguna parte. Un
 *    registro con lote pero sin medidas vale infinitamente más que ninguno.
 *  · **No admitir basura que parezca dato.** Un diente "99" o un GTIN de siete
 *    cifras pasan desapercibidos en la ficha y fallan justo cuando se buscan.
 */
import { describe, expect, it } from "vitest";

import { implantPlacementSchema } from "@/lib/validations/implant";

const PACIENTE = "11111111-1111-1111-1111-111111111111";

function base(extra: Record<string, unknown> = {}) {
  return { customerId: PACIENTE, fdiCode: 46, ...extra };
}

describe("implantPlacementSchema", () => {
  it("acepta lo mínimo: a quién y en qué diente", () => {
    // Un implante anotado a medias sigue siendo trazable. Uno no anotado, no.
    const r = implantPlacementSchema.safeParse(base());

    expect(r.success).toBe(true);
  });

  it("guarda lote, GTIN y marca cuando se leen del código", () => {
    const r = implantPlacementSchema.safeParse(
      base({ gtin: "07612345678904", lot: "LOT123", brand: "Straumann" }),
    );

    expect(r.success).toBe(true);
    expect(r.success && r.data.lot).toBe("LOT123");
  });

  it("rechaza un diente que no existe en la numeración FDI", () => {
    // FDI va de 11 a 48 por cuadrantes. El "99" no es un diente: es un error
    // de tecleo que nadie detecta hasta que hace falta el dato.
    expect(implantPlacementSchema.safeParse(base({ fdiCode: 99 })).success).toBe(false);
    expect(implantPlacementSchema.safeParse(base({ fdiCode: 10 })).success).toBe(false);
    expect(implantPlacementSchema.safeParse(base({ fdiCode: 49 })).success).toBe(false);
  });

  it("rechaza un GTIN que no tenga 14 cifras", () => {
    // Medio GTIN parece valido en la ficha y no cruza con el del fabricante.
    expect(implantPlacementSchema.safeParse(base({ gtin: "0761234" })).success).toBe(false);
    expect(implantPlacementSchema.safeParse(base({ gtin: "07612345678904" })).success).toBe(true);
  });

  it("rechaza medidas imposibles en vez de guardarlas", () => {
    expect(implantPlacementSchema.safeParse(base({ diameterMm: 0 })).success).toBe(false);
    expect(implantPlacementSchema.safeParse(base({ lengthMm: -3 })).success).toBe(false);
    expect(
      implantPlacementSchema.safeParse(base({ diameterMm: 4.1, lengthMm: 11.5 })).success,
    ).toBe(true);
  });

  it("un campo opcional en blanco entra como nulo, no como cadena vacía", () => {
    // Una cadena vacia en `lot` haria que el implante apareciera al buscar por
    // "lote desconocido" y ensuciaria el indice de la consulta que importa.
    const r = implantPlacementSchema.safeParse(base({ lot: "   ", brand: "" }));

    expect(r.success).toBe(true);
    expect(r.success && r.data.lot).toBeNull();
    expect(r.success && r.data.brand).toBeNull();
  });

  it("conserva el código leído tal cual, aunque no se entienda", () => {
    // Si el lector devuelve algo que no sabemos interpretar, se guarda igual:
    // mañana puede que sepamos leerlo, y el original ya no se recupera.
    const r = implantPlacementSchema.safeParse(base({ udiRaw: "(01)07612345678904(240)REF-9" }));

    expect(r.success && r.data.udiRaw).toBe("(01)07612345678904(240)REF-9");
  });

  it("exige un paciente: un implante sin dueño no es trazabilidad", () => {
    expect(implantPlacementSchema.safeParse({ fdiCode: 46 }).success).toBe(false);
  });
});
