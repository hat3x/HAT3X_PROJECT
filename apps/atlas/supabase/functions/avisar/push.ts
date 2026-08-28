//
// Envío por Web Push.
//
// OJO: este fichero importa `npm:web-push` y por eso NINGÚN test de vitest lo
// importa — vite no resuelve especificadores `npm:`. El correo vive aparte, en
// `correo.ts`, justamente para que esa mitad sí se pueda probar.
//
// Cifrar un mensaje push a mano es AES-128-GCM con derivación HKDF sobre las
// claves del navegador, más un JWT firmado con la VAPID. Es de los sitios donde
// una librería con años de uso vale más que código propio.
//
import webpush from "npm:web-push@3.6.7";
import type { AvisoEnviable, Resultado } from "./correo.ts";

export type Suscripcion = { endpoint: string; p256dh: string; auth: string };
export type ClavesVapid = { publica: string; privada: string; contacto: string };

export type ResultadoPush = Resultado & {
  /** El navegador tiró la suscripción: hay que borrarla, no reintentarla. */
  caducada: boolean;
};

export async function enviarPush(
  sus: Suscripcion,
  aviso: AvisoEnviable,
  claves: ClavesVapid
): Promise<ResultadoPush> {
  if (claves.publica === "" || claves.privada === "") {
    return {
      ok: false,
      error: "Push sin configurar: faltan las claves VAPID.",
      caducada: false,
    };
  }

  try {
    webpush.setVapidDetails(claves.contacto, claves.publica, claves.privada);
    await webpush.sendNotification(
      { endpoint: sus.endpoint, keys: { p256dh: sus.p256dh, auth: sus.auth } },
      JSON.stringify(aviso)
    );
    return { ok: true, error: null, caducada: false };
  } catch (e: unknown) {
    // 404 y 410 significan que el navegador tiró la suscripción. No es un fallo
    // pasajero: hay que borrarla o se reintentará en cada aviso, para siempre.
    const codigo = (e as { statusCode?: number }).statusCode;
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      caducada: codigo === 404 || codigo === 410,
    };
  }
}
