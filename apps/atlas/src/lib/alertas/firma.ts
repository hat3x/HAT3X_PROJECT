//
// HMAC-SHA256 sobre WebCrypto, no sobre node:crypto: la Edge Function que
// genera los enlaces corre en Deno.
//
// No es un JWT a propósito: no hace falta una librería ni un formato con
// opciones, y el `alg: none` de JWT ha causado suficientes disgustos.
//

export type CargaSilencio = {
  incidenciaId: string;
  /** ISO 8601, o "infinity" para «hasta resolver». */
  hasta: string;
  /** Instante de caducidad del enlace, en ms desde epoch. */
  expira: number;
};

function aBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function clave(claveB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    deBase64Url(claveB64),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function firmar(carga: CargaSilencio, claveB64: string): Promise<string> {
  const cuerpo = aBase64Url(new TextEncoder().encode(JSON.stringify(carga)));
  const sello = await crypto.subtle.sign(
    "HMAC",
    await clave(claveB64),
    new TextEncoder().encode(cuerpo)
  );
  return `${cuerpo}.${aBase64Url(new Uint8Array(sello))}`;
}

/**
 * Devuelve la carga si el token es auténtico y no ha caducado, o null. Nunca
 * lanza: le llegan cadenas de la barra de direcciones, y ahí entra cualquier cosa.
 *
 * El instante actual entra por parámetro y no se lee del reloj: es lo que hace
 * probable la caducidad sin esperar un día.
 */
export async function verificar(
  token: string,
  claveB64: string,
  ahoraMs: number
): Promise<CargaSilencio | null> {
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [cuerpo, sello] = partes as [string, string];
  if (cuerpo === "" || sello === "") return null;

  try {
    // `crypto.subtle.verify` compara en tiempo constante; hacerlo a mano con
    // `===` filtraría información por el tiempo de respuesta.
    const valido = await crypto.subtle.verify(
      "HMAC",
      await clave(claveB64),
      deBase64Url(sello),
      new TextEncoder().encode(cuerpo)
    );
    if (!valido) return null;

    const carga = JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo)));
    // Sin `expira` no cuela: un enlace sin caducidad sería eterno.
    if (typeof carga?.expira !== "number" || ahoraMs > carga.expira) return null;
    return carga as CargaSilencio;
  } catch {
    // Base64 malformado, JSON roto: no cuela y no revienta.
    return null;
  }
}
