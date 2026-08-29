// src/tests/cobro/pendientes.test.ts
import { describe, it, expect } from "vitest";
import {
  pendientesDeCobro,
  type PeriodoSinFacturar,
  type FacturaSinCobrar,
} from "@/lib/cobro/pendientes";

const HOY = "2026-09-15";

function periodo(p: Partial<PeriodoSinFacturar> = {}): PeriodoSinFacturar {
  return {
    contratoId: "c1",
    clienteNombre: "Biodental",
    periodo: "2026-08-01",
    importeEsperadoCentimos: 35000,
    ...p,
  };
}

function factura(f: Partial<FacturaSinCobrar> = {}): FacturaSinCobrar {
  return {
    id: "f1",
    serie: "A",
    numero: 1,
    clienteNombre: "Biodental",
    totalCentimos: 42350,
    fechaVencimiento: "2026-09-01",
    ...f,
  };
}

describe("pendientes de cobro", () => {
  it("sin nada pendiente, no hay nada que avisar", () => {
    const c = pendientesDeCobro([], [], HOY);
    expect(c.hayAlgo).toBe(false);
    expect(c.totalSinFacturarCentimos).toBe(0);
    expect(c.totalVencidoCentimos).toBe(0);
  });

  it("suma lo que falta por facturar", () => {
    const c = pendientesDeCobro(
      [periodo(), periodo({ contratoId: "c2", importeEsperadoCentimos: 6000 })],
      [],
      HOY
    );
    expect(c.totalSinFacturarCentimos).toBe(41000);
    expect(c.hayAlgo).toBe(true);
  });

  // Una factura que aún no ha vencido NO es una deuda: es un plazo en curso.
  // Perseguirla sería avisar de algo que el cliente está cumpliendo.
  it("una factura que todavía no ha vencido no cuenta", () => {
    const c = pendientesDeCobro([], [factura({ fechaVencimiento: "2026-10-01" })], HOY);
    expect(c.vencidas).toEqual([]);
    expect(c.hayAlgo).toBe(false);
  });

  it("la que vence hoy tampoco: se cumple durante todo el día", () => {
    const c = pendientesDeCobro([], [factura({ fechaVencimiento: HOY })], HOY);
    expect(c.vencidas).toEqual([]);
  });

  // Comparar cadenas ISO solo vale si las dos tienen el mismo formato. Con la
  // hora incluida, la fecha sola es prefijo estricto y por tanto «menor», así
  // que la que vence hoy se colaría como vencida.
  it("da igual que la fecha de hoy venga con hora", () => {
    const conHora = pendientesDeCobro(
      [],
      [factura({ fechaVencimiento: HOY })],
      `${HOY}T09:00:00.000Z`
    );
    expect(conHora.vencidas).toEqual([]);
  });

  it("la que venció ayer sí", () => {
    const c = pendientesDeCobro([], [factura({ fechaVencimiento: "2026-09-14" })], HOY);
    expect(c.vencidas).toHaveLength(1);
    expect(c.totalVencidoCentimos).toBe(42350);
  });

  // Sin fecha de vencimiento no hay plazo que incumplir. Tratarla como vencida
  // llenaría el aviso de facturas que nadie acordó cuándo pagar.
  it("una factura sin vencimiento no se persigue", () => {
    const c = pendientesDeCobro([], [factura({ fechaVencimiento: null })], HOY);
    expect(c.vencidas).toEqual([]);
  });

  // Lo más viejo primero: es lo que más urge y lo que peor pinta tiene.
  it("ordena las vencidas de más antigua a más reciente", () => {
    const c = pendientesDeCobro(
      [],
      [
        factura({ id: "nueva", fechaVencimiento: "2026-09-10" }),
        factura({ id: "vieja", fechaVencimiento: "2026-06-01" }),
      ],
      HOY
    );
    expect(c.vencidas.map((f) => f.id)).toEqual(["vieja", "nueva"]);
  });

  it("el aviso dice las dos cosas cuando las hay", () => {
    const c = pendientesDeCobro(
      [periodo()],
      [factura({ fechaVencimiento: "2026-09-01" })],
      HOY
    );
    expect(c.titulo).toBe("Cobro: 1 mes sin facturar y 1 factura vencida");
    expect(c.cuerpo).toContain("350,00");
    expect(c.cuerpo).toContain("423,50");
  });

  it("y solo lo que hay cuando falta una de las dos", () => {
    const soloVencidas = pendientesDeCobro(
      [],
      [factura({ fechaVencimiento: "2026-09-01" })],
      HOY
    );
    expect(soloVencidas.titulo).toBe("Cobro: 1 factura vencida");

    const soloSinFacturar = pendientesDeCobro([periodo()], [], HOY);
    expect(soloSinFacturar.titulo).toBe("Cobro: 1 mes sin facturar");
  });

  // El plural importa más de lo que parece: un aviso que dice «1 meses» se lee
  // como un fallo del sistema, y un aviso que parece roto se deja de leer.
  it("concuerda el plural", () => {
    const c = pendientesDeCobro([periodo(), periodo({ contratoId: "c2" })], [], HOY);
    expect(c.titulo).toBe("Cobro: 2 meses sin facturar");
  });

  // El defecto original solo se veía con nVen >= 2: con una sola vencida
  // "factura vencida" ya suena bien aunque el plural esté mal resuelto.
  it("concuerda el plural también en las vencidas", () => {
    const c = pendientesDeCobro(
      [],
      [
        factura({ id: "f1", fechaVencimiento: "2026-09-01" }),
        factura({ id: "f2", fechaVencimiento: "2026-09-02" }),
      ],
      HOY
    );
    expect(c.titulo).toBe("Cobro: 2 facturas vencidas");
  });

  // El título combinado con ambos en plural es el caso que dejaba pasar el
  // defecto de usar `${nSin}` a pelo en vez de `trozoSin`.
  it("concuerda el plural en el título combinado", () => {
    const c = pendientesDeCobro(
      [periodo(), periodo({ contratoId: "c2" })],
      [
        factura({ id: "f1", fechaVencimiento: "2026-09-01" }),
        factura({ id: "f2", fechaVencimiento: "2026-09-02" }),
        factura({ id: "f3", fechaVencimiento: "2026-09-03" }),
      ],
      HOY
    );
    expect(c.titulo).toBe("Cobro: 2 meses sin facturar y 3 facturas vencidas");
  });
});
