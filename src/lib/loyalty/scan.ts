/**
 * Utilidades PURAS del escaneo por cámara del carné de fidelización (§ TPV).
 *
 * Se aíslan aquí —sin dependencias de React ni del navegador— para poder
 * probarlas en unitarios: la lógica delicada del escáner es la NORMALIZACIÓN del
 * texto leído y la TRADUCCIÓN de los fallos de cámara a un mensaje accionable.
 * El componente cliente (`loyalty-scan-button.tsx`) solo orquesta cámara + UI.
 */

/**
 * Normaliza el texto crudo decodificado del QR a un `qr_token` utilizable por
 * {@link import("@/app/(dashboard)/tpv/actions").lookupLoyaltyByQr}.
 *
 * El carné de Salón OS codifica el token EN CRUDO (ver `customer-qr.tsx`), así
 * que el camino normal es simplemente recortar espacios. Por robustez —QRs
 * impresos por terceros o versiones futuras que envuelvan el token en una URL—
 * también se admite extraerlo de `?token=`/`?t=` o del último segmento de ruta.
 *
 * @returns el token limpio, o `""` si el contenido no aporta ninguno.
 */
export function normalizeScannedToken(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const param = url.searchParams.get("token") ?? url.searchParams.get("t");
      if (param !== null && param.trim() !== "") return param.trim();

      const segments = url.pathname.split("/").filter((segment) => segment !== "");
      const last = segments.at(-1);
      if (last !== undefined && last !== "") return decodeURIComponent(last);
    } catch {
      // URL malformada: caemos al texto tal cual (mejor intentar el lookup que
      // descartar un token que quizá solo "parecía" una URL).
    }
  }

  return trimmed;
}

/** Mensaje cuando el navegador/contexto no permite acceder a la cámara. */
export const CAMERA_UNSUPPORTED_MESSAGE =
  "Este navegador no permite usar la cámara. Requiere una conexión segura (HTTPS).";

/**
 * Traduce un error de `getUserMedia` (el que lanza ZXing al abrir la cámara) a un
 * mensaje en español, claro y ACCIONABLE para quien está en el mostrador. Se guía
 * por el `name` del `DOMException`, que es estable entre navegadores.
 */
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permiso de cámara denegado. Actívalo en el navegador y vuelve a intentarlo.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se ha encontrado ninguna cámara disponible en este dispositivo.";
    case "NotReadableError":
    case "TrackStartError":
      return "La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentarlo.";
    default:
      return "No se ha podido acceder a la cámara. Comprueba los permisos y vuelve a intentarlo.";
  }
}
