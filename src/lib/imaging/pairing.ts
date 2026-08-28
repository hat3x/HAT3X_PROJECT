import { PAIRING_TOKEN_MIN_LENGTH } from "@/lib/imaging/protocol";

/**
 * Token de emparejamiento entre el panel y el agente local (A1a).
 *
 * Es el secreto compartido entre el panel de la clínica y el agente instalado en
 * el ordenador del equipo de rayos. Junto con la lista de orígenes, es lo único
 * que impide que una web cualquiera abierta en ese ordenador le pida al agente
 * que dispare una radiografía o le devuelva la última capturada.
 *
 * Se genera aquí y viaja UNA vez, del panel al fichero de configuración del
 * agente. Nadie lo teclea de memoria, así que puede ser largo — pero sí lo
 * copia y lo pega una persona, así que el alfabeto evita los caracteres que se
 * rompen al pasar por un correo o una URL.
 */

/** 32 bytes de aleatoriedad: 43 caracteres en base64url. */
const TOKEN_BYTES = 32;

/** Alfabeto base64url: sobrevive a correos, URLs y copiar-pegar. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Convierte bytes a base64url, sin relleno. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Genera un token nuevo.
 *
 * Usa `crypto.getRandomValues`, no `Math.random`: un generador predecible
 * convertiría el secreto en adivinable desde una pestaña del propio navegador,
 * que es exactamente de quien hay que defenderse.
 */
export function generatePairingToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * ¿Esto tiene forma de token válido?
 *
 * Se comprueba el alfabeto además de la longitud porque el fallo más común no es
 * un ataque: es un copiado a medias desde el correo, con un espacio o un salto
 * de línea dentro. Cazarlo aquí ahorra un 401 críptico en la clínica con el
 * paciente en el sillón.
 */
export function isValidPairingToken(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length < PAIRING_TOKEN_MIN_LENGTH) return false;
  return TOKEN_PATTERN.test(value);
}
