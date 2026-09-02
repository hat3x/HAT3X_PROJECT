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

// ---------------------------------------------------------------------------
// DICOM (A1b) — el flujo de vuelta
//
// ── POR QUÉ EL DICOM NO ENCAJA EN EL MENSAJE DE CAPTURA ─────────────────────
// Con la carpeta vigilada el navegador pide una captura y espera: hay alguien
// delante. Un equipo DICOM no funciona así. El ortopantomógrafo pregunta por su
// cuenta a quién le toca (lista de trabajo) y envía la imagen cuando termina,
// que pueden ser cinco minutos después y con la ficha ya cerrada.
//
// Eso rompería la promesa de que el agente no guarda credenciales: para
// responder a la lista tendría que consultar la base, y para subir la imagen
// tendría que escribir en ella.
//
// Se resuelve invirtiendo quién lleva la iniciativa, con dos mensajes más:
//
//   · El navegador EMPUJA la lista de trabajo del día al agente, que la guarda
//     para poder contestarle al equipo aunque en ese momento no haya nadie.
//   · El agente ENCOLA en disco lo que reciba, y el navegador se lo lleva y lo
//     sube cuando alguien abre Kairos.
//
// El agente sigue sin llaves: solo tiene una copia de la agenda del día y unos
// ficheros esperando a que alguien autenticado se los lleve.
// ---------------------------------------------------------------------------

/**
 * Un registro de la lista de trabajo, tal y como el navegador se lo pasa al
 * agente. Es la salida de `buildWorklistItem`, ya construida en el servidor:
 * el agente no compone datos clínicos, solo los repite.
 */
const worklistEntrySchema = z
  .object({
    accession: z.string().min(1),
    studyInstanceUid: z.string().min(1),
    patientId: z.string().min(1),
    patientName: z.string(),
    patientBirthDate: z.string(),
    patientSex: z.string(),
    modality: z.string().min(1),
    scheduledDate: z.string().min(1),
    scheduledTime: z.string().min(1),
    procedureDescription: z.string(),
  })
  .strict();

export type WorklistEntry = z.infer<typeof worklistEntrySchema>;

/**
 * «Esta es la lista de trabajo de hoy».
 *
 * Se manda entera y sustituye a la anterior, en vez de ir por diferencias: una
 * lista de un día son unas decenas de registros, y reconciliar altas y bajas
 * sería inventar un problema para ahorrar unos kilobytes. Además, sustituir
 * completo hace imposible que quede un paciente fantasma de ayer.
 */
export const worklistPushSchema = z
  .object({
    type: z.literal("worklist-push"),
    token: pairingToken,
    entries: z.array(worklistEntrySchema).max(500),
  })
  .strict();

export type WorklistPush = z.infer<typeof worklistPushSchema>;

/** «¿Ha llegado alguna imagen mientras no había nadie?» */
export const queueListSchema = z
  .object({ type: z.literal("queue-list"), token: pairingToken })
  .strict();

/** «Dame los bytes de esta, que la subo». */
export const queueFetchSchema = z
  .object({
    type: z.literal("queue-fetch"),
    token: pairingToken,
    /** Nombre del fichero en la cola, tal y como lo devolvió `queue-list`. */
    item: z.string().min(1),
  })
  .strict();

/**
 * «Ya está subida, bórrala».
 *
 * El borrado lo ordena el navegador y no el agente al entregarla: si el agente
 * borrara al servirla, un corte de red entre la entrega y la subida perdería
 * una radiografía. Confirmar después cuesta un mensaje y hace que lo peor que
 * pueda pasar sea subirla dos veces.
 */
export const queueAckSchema = z
  .object({
    type: z.literal("queue-ack"),
    token: pairingToken,
    item: z.string().min(1),
  })
  .strict();
