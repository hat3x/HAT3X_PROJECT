import { describe, it, expect } from "vitest";
import { cadenaCanonica, huellaDe, importeAeat, fechaAeat, instanteMadrid, numSerie, verificarCadena, type RegistroAlta } from "@/lib/facturas/huella";

// Los dos ejemplos del documento «especificaciones técnicas para la generación
// de la huella» v0.1.2 de la AEAT. Si esto deja de pasar, la cadena entera
// deja de valer: no se toca sin un documento nuevo delante.
const V1: RegistroAlta = { nifEmisor: "89890001K", numSerie: "12345678/G33", fechaExpedicion: "2024-01-01", tipoFactura: "F1", cuotaTotalCentimos: 1235, importeTotalCentimos: 12345, huellaAnterior: null, genEn: "2024-01-01T19:20:30+01:00" };
const H1 = "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60";
const V2: RegistroAlta = { ...V1, numSerie: "12345679/G34", huellaAnterior: H1, genEn: "2024-01-01T19:20:35+01:00" };
const H2 = "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97";

describe("cadenaCanonica", () => {
  it("es exactamente la cadena del documento de la AEAT", () => {
    expect(cadenaCanonica(V1)).toBe("IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00");
  });
  it("recorta espacios de los valores", () => {
    expect(cadenaCanonica({ ...V1, nifEmisor: " 89890001K " })).toBe(cadenaCanonica(V1));
  });
});

describe("huellaDe — vectores de la AEAT", () => {
  it("primer registro", async () => { expect(await huellaDe(V1)).toBe(H1); });
  it("encadenado", async () => { expect(await huellaDe(V2)).toBe(H2); });
  it("cambiar un céntimo cambia la huella", async () => {
    expect(await huellaDe({ ...V1, importeTotalCentimos: 12346 })).not.toBe(H1);
  });
});

describe("formatos", () => {
  it("importes con punto y dos decimales, negativos con signo", () => {
    expect(importeAeat(12345)).toBe("123.45");
    expect(importeAeat(0)).toBe("0.00");
    expect(importeAeat(-1230)).toBe("-12.30");
    expect(importeAeat(5)).toBe("0.05");
  });
  it("fecha dd-mm-aaaa", () => { expect(fechaAeat("2024-01-01")).toBe("01-01-2024"); });
  it("instante de Madrid con su desfase, verano e invierno", () => {
    expect(instanteMadrid(Date.parse("2026-08-01T10:15:00Z"))).toBe("2026-08-01T12:15:00+02:00");
    expect(instanteMadrid(Date.parse("2026-01-15T10:15:00Z"))).toBe("2026-01-15T11:15:00+01:00");
  });
  it("serie y número con guion", () => { expect(numSerie("A", 12)).toBe("A-12"); });
});

describe("verificarCadena", () => {
  it("una cadena íntegra pasa; una huella tocada dice dónde", async () => {
    const buena = [{ ...V1, huella: H1 }, { ...V2, huella: H2 }];
    expect(await verificarCadena(buena)).toEqual({ ok: true });
    const rota = [{ ...V1, huella: H1 }, { ...V2, huella: "0".repeat(64) }];
    const r = await verificarCadena(rota);
    expect(r).toMatchObject({ ok: false, rotaEn: 1, esperada: H2 });
  });
  it("un eslabón cuya huellaAnterior no es la huella del anterior también rompe", async () => {
    const r = await verificarCadena([{ ...V1, huella: H1 }, { ...V2, huellaAnterior: "1".repeat(64), huella: H2 }]);
    expect(r).toMatchObject({ ok: false, rotaEn: 1 });
  });
  it("vacía es íntegra", async () => { expect(await verificarCadena([])).toEqual({ ok: true }); });
});
