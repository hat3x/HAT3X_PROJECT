import { describe, it, expect } from "vitest";
import { firmar, verificar, type CargaSilencio } from "@/lib/alertas/firma";

// 32 bytes exactos. Clave de pruebas: no abre nada real.
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");
const AHORA = 1_760_000_000_000;

const carga: CargaSilencio = {
  incidenciaId: "11111111-1111-1111-1111-111111111111",
  hasta: "2026-08-16T14:00:00.000Z",
  expira: AHORA + 86_400_000,
};

describe("firma del enlace de silenciar", () => {
  it("lo que firma se puede verificar", async () => {
    const token = await firmar(carga, CLAVE);
    expect(await verificar(token, CLAVE, AHORA)).toEqual(carga);
  });

  it("un token manipulado no cuela", async () => {
    const token = await firmar(carga, CLAVE);
    const roto = token.slice(0, -4) + "AAAA";
    expect(await verificar(roto, CLAVE, AHORA)).toBeNull();
  });

  it("cambiar la incidencia invalida la firma", async () => {
    const token = await firmar(carga, CLAVE);
    const sello = token.split(".")[1]!;
    const otroCuerpo = Buffer.from(
      JSON.stringify({ ...carga, incidenciaId: "22222222-2222-2222-2222-222222222222" })
    ).toString("base64url");
    expect(await verificar(`${otroCuerpo}.${sello}`, CLAVE, AHORA)).toBeNull();
  });

  it("con otra clave no vale", async () => {
    const token = await firmar(carga, CLAVE);
    const otra = Buffer.from("otra-clave-de-32-bytes-distinta!").toString("base64");
    expect(await verificar(token, otra, AHORA)).toBeNull();
  });

  it("caducado no vale: un enlace de hace un mes no puede seguir sirviendo", async () => {
    const token = await firmar(carga, CLAVE);
    expect(await verificar(token, CLAVE, carga.expira + 1)).toBeNull();
  });

  it("justo en el instante de caducidad todavía vale", async () => {
    const token = await firmar(carga, CLAVE);
    expect(await verificar(token, CLAVE, carga.expira)).toEqual(carga);
  });

  it("basura no revienta: devuelve null", async () => {
    for (const basura of [
      "",
      "sin-punto",
      "a.b",
      "....",
      "a.b.c",
      // Estos dos sí parten en dos trozos, pero con uno vacío.
      ".b",
      "a.",
    ]) {
      expect(await verificar(basura, CLAVE, AHORA), basura).toBeNull();
    }
  });

  it("«hasta resolver» viaja como infinity y vuelve igual", async () => {
    const infinita: CargaSilencio = { ...carga, hasta: "infinity" };
    const token = await firmar(infinita, CLAVE);
    expect(await verificar(token, CLAVE, AHORA)).toEqual(infinita);
  });

  // Un cuerpo válido pero sin `expira` no debe colar como enlace eterno.
  it("sin fecha de caducidad no vale", async () => {
    const sinExpira = { incidenciaId: "x", hasta: "infinity" };
    const token = await firmar(sinExpira as CargaSilencio, CLAVE);
    expect(await verificar(token, CLAVE, AHORA)).toBeNull();
  });
});
