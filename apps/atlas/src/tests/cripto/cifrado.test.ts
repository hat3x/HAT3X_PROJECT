import { describe, it, expect } from "vitest";
import { cifrar, descifrar, enmascarar } from "@/lib/cripto/cifrado";

// 32 bytes exactos, en base64. Valores sintéticos, solo para pruebas: nunca se
// lee ATLAS_MASTER_KEY en este fichero.
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");
const OTRA = Buffer.from("otra-clave-de-32-bytes-distinta!").toString("base64");

describe("cifrado del llavero", () => {
  it("ida y vuelta devuelve el mismo texto", async () => {
    const secreto = await cifrar("sk_test_0000abcd", CLAVE);
    expect(await descifrar(secreto, CLAVE)).toBe("sk_test_0000abcd");
  });

  it("dos cifrados del mismo texto dan resultados distintos", async () => {
    const a = await cifrar("mismo", CLAVE);
    const b = await cifrar("mismo", CLAVE);
    // IV aleatorio por cifrado: sin esto, textos iguales serían reconocibles.
    expect(Buffer.from(a.iv).toString("hex")).not.toBe(Buffer.from(b.iv).toString("hex"));
    expect(Buffer.from(a.cifrado).toString("hex"))
      .not.toBe(Buffer.from(b.cifrado).toString("hex"));
    expect(await descifrar(a, CLAVE)).toBe("mismo");
    expect(await descifrar(b, CLAVE)).toBe("mismo");
  });

  it("descifrar con otra clave falla", async () => {
    const secreto = await cifrar("sk_test_0000abcd", CLAVE);
    await expect(descifrar(secreto, OTRA)).rejects.toThrow();
  });

  it("detecta manipulación del texto cifrado", async () => {
    const secreto = await cifrar("sk_test_0000abcd", CLAVE);
    const alterado = new Uint8Array(secreto.cifrado);
    alterado[0] = (alterado[0]! ^ 0xff) & 0xff;
    await expect(descifrar({ ...secreto, cifrado: alterado }, CLAVE)).rejects.toThrow();
  });

  it("detecta manipulación de la etiqueta de autenticación", async () => {
    const secreto = await cifrar("sk_test_0000abcd", CLAVE);
    const tag = new Uint8Array(secreto.tag);
    tag[0] = (tag[0]! ^ 0xff) & 0xff;
    await expect(descifrar({ ...secreto, tag }, CLAVE)).rejects.toThrow();
  });

  it("el IV mide 12 bytes y la etiqueta 16", async () => {
    const secreto = await cifrar("x", CLAVE);
    expect(secreto.iv).toHaveLength(12);
    expect(secreto.tag).toHaveLength(16);
  });

  it("rechaza una clave maestra que no mida 32 bytes, con mensaje claro", async () => {
    const corta = Buffer.from("demasiado-corta").toString("base64");
    await expect(cifrar("x", corta)).rejects.toThrow(/32 bytes/);
  });

  it("enmascara conservando el prefijo y los últimos cuatro caracteres", () => {
    expect(enmascarar("sk_live_abc123def456")).toBe("sk_live_••••f456");
    expect(enmascarar("token1234567890")).toBe("toke••••7890");
  });

  it("enmascara por completo lo que sea demasiado corto para revelar nada", () => {
    expect(enmascarar("abc")).toBe("••••");
    expect(enmascarar("")).toBe("••••");
  });
});
