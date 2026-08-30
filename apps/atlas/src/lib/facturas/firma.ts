// La firma electrónica de cada factura emitida (§7): ECDSA sobre la curva
// P-256, con SHA-256, vía `node:crypto`. Solo servidor: la clave privada pasa
// por el llavero y de ahí a memoria, nunca al navegador. El proyecto no usa el
// paquete "server-only" en ningún otro módulo (ni `cripto/cifrado.ts`, que
// hace lo mismo con WebCrypto) — aquí la barrera es la misma: solo lo importa
// código de servidor.
import crypto from "node:crypto";

/**
 * Un par de claves nuevo, en PEM. Para el alta inicial de la credencial de
 * firma y para los tests: en producción la privada se guarda cifrada en el
 * llavero y no vuelve a generarse.
 */
export function generarClavePem(): { privada: string; publica: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privada: privateKey, publica: publicKey };
}

/**
 * Firma en DER, codificada en base64: es el formato que produce `node:crypto`
 * por defecto y el que entiende cualquier verificador ECDSA estándar (no hay
 * que pedir el formato IEEE P1363 aparte).
 */
export function firmar(cadena: string, clavePrivadaPem: string): string {
  return crypto.sign("sha256", Buffer.from(cadena, "utf8"), clavePrivadaPem).toString("base64");
}

/**
 * Nunca lanza: una cadena alterada, una firma alterada o una clave que no
 * corresponde son un «no verifica» para quien llama, no una excepción que
 * tumbe la comprobación de una factura ya emitida.
 */
export function verificarFirma(cadena: string, firmaB64: string, clavePublicaPem: string): boolean {
  try {
    return crypto.verify(
      "sha256",
      Buffer.from(cadena, "utf8"),
      clavePublicaPem,
      Buffer.from(firmaB64, "base64")
    );
  } catch {
    // Una firma con base64 inválido, o una clave pública mal formada, hacen
    // que `crypto.verify` lance en vez de devolver `false`. Aquí se trata
    // igual que cualquier otra firma que no verifica.
    return false;
  }
}

/**
 * La pública que corresponde a una privada dada, derivada sin generar un par
 * nuevo. Sirve para guardar solo la privada en el llavero y recalcular la
 * pública cuando haga falta verificar.
 */
export function clavePublicaDe(clavePrivadaPem: string): string {
  return crypto.createPublicKey(clavePrivadaPem).export({ type: "spki", format: "pem" }).toString();
}
