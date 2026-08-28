import { z } from "zod";

import { isImageModality } from "@/lib/dental/consents";
import { isValidFDI } from "@/lib/dental/tooth";

/**
 * Protocolo entre el navegador y el agente local de captura (A1a).
 *
 * ── LA FORMA DEL SISTEMA ────────────────────────────────────────────────────
 * El agente es un servicio en el PC de la clínica: es el único que puede hablar
 * con un sensor USB, porque una página web no puede. La ficha del paciente le
 * pide una captura por `localhost`, el agente dispara y **devuelve los bytes al
 * navegador**; es el navegador —que ya está autenticado— quien sube la imagen a
 * Salón OS.
 *
 * Esa dirección importa: significa que **el agente no necesita credenciales de
 * Supabase**. Si el PC de la clínica se ve comprometido, no hay ninguna llave
 * que robar en él. Invertir el flujo (que el agente subiera por su cuenta)
 * obligaría a repartir credenciales por todos los ordenadores de todas las
 * clínicas.
 *
 * ── POR QUÉ HACE FALTA CERRAR EL PUERTO ─────────────────────────────────────
 * Un servidor en `localhost` es alcanzable por CUALQUIER página abierta en ese
 * ordenador. Sin protección, una web cualquiera que la recepcionista tenga en
 * otra pestaña podría disparar radiografías o leerse las imágenes recién
 * capturadas. Se cierra con dos llaves independientes:
 *   1. `isAllowedOrigin` — solo se atiende a los orígenes emparejados.
 *   2. El token de emparejamiento, que viaja en cada mensaje y se genera al
 *      instalar el agente.
 */

/**
 * ¿Puede este origen hablar con el agente?
 *
 * Comparación EXACTA contra la lista, deliberadamente. La tentación es usar
 * `startsWith`, y ese es el fallo clásico: `https://kairosmanager.app` como
 * prefijo también acepta `https://kairosmanager.app.example.com`, que es un
 * dominio que puede registrar cualquiera. Un origen ya incluye esquema, host y
 * puerto, así que la igualdad es exactamente la comprobación correcta.
 *
 * Sin origen (`null`, `undefined` o vacío) se rechaza: detrás no hay una pestaña
 * legítima, y aquí el valor por defecto es que no.
 */
export function isAllowedOrigin(
  origin: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}

/**
 * Longitud mínima del token de emparejamiento.
 *
 * No es una contraseña que teclee nadie: la genera el instalador del agente. 32
 * caracteres es lo bastante para que no se pueda adivinar por fuerza bruta desde
 * una pestaña del propio navegador.
 */
export const PAIRING_TOKEN_MIN_LENGTH = 32;

const pairingToken = z
  .string({ required_error: "Falta el token de emparejamiento" })
  .min(PAIRING_TOKEN_MIN_LENGTH, "Token de emparejamiento no válido");

/**
 * Petición de captura: «hazme una radiografía de este diente, de este paciente,
 * con este equipo».
 *
 * `.strict()` a propósito: el mensaje es cerrado. Una clave de más —un
 * `uploadTo`, por ejemplo— sería justo la forma de convertir el agente en algo
 * que manda las imágenes a otro sitio.
 */
export const captureRequestSchema = z
  .object({
    type: z.literal("capture"),
    token: pairingToken,
    /** Equipo elegido, de `salon_imaging_device`. */
    deviceId: z.string().uuid(),
    /** Paciente al que se le adjudica la imagen. */
    customerId: z.string().uuid(),
    /** Misma lista que `patient_images.modality`, no una copia. */
    modality: z
      .string({ required_error: "Falta la modalidad" })
      .refine(isImageModality, "Modalidad de imagen no válida"),
    /**
     * Diente en numeración FDI. Opcional porque hay modalidades que no son de un
     * diente concreto: una panorámica o una cefalométrica son de toda la boca.
     */
    fdiCode: z
      .number()
      .int()
      .refine(isValidFDI, "Ese diente no existe en la numeración FDI")
      .optional(),
  })
  .strict();

export type CaptureRequest = z.infer<typeof captureRequestSchema>;
