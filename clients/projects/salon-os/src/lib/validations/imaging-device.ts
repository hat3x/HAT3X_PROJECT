import { z } from "zod";

import { isImageModality } from "@/lib/dental/consents";

/**
 * Equipos de imagen configurados por cada salón (A1a).
 *
 * Aquí vive la decisión de producto de A1: **el equipo lo elige cada clínica**.
 * Salón OS no se ata a un fabricante — eso dejaría fuera a cualquier clínica con
 * otro aparato, que son casi todas. En su lugar hay ADAPTADORES, y cada clínica
 * configura los suyos: lo normal es un sensor por gabinete más un
 * ortopantomógrafo compartido.
 *
 * Los cuatro adaptadores, de universal a específico:
 *
 *  · `carpeta` — vigila un directorio. Funciona con CUALQUIER equipo capaz de
 *    exportar a disco, ortopantomógrafos incluidos. Es el suelo: ninguna clínica
 *    se queda fuera, y se puede construir y probar sin hardware delante.
 *  · `twain`   — el estándar de los sensores intraorales. Carestream, Vatech,
 *    Dürr y los sensores de terceros bajo Romexis exponen driver TWAIN, así que
 *    una integración cubre lo que veinte por marca cubrirían.
 *  · `dicom`   — ortopantomógrafos y CBCT de gama alta, que hablan DICOM.
 *  · `sdk`     — SDK propietario. Aporta captura multiplexada y metadatos que
 *    TWAIN pierde; es mejora, no requisito de entrada.
 *
 * Cada adaptador se valida con `.strict()` a propósito. Una configuración
 * incoherente —una carpeta vigilada con un AE title de DICOM— no falla al
 * guardarse: falla el día que alguien intenta hacer una radiografía con el
 * paciente en el sillón. Aquí se corta en el formulario.
 */

/** Adaptadores disponibles, en el orden en que se ofrecen al configurar. */
export const IMAGING_ADAPTERS = ["carpeta", "twain", "dicom", "sdk"] as const;

export type ImagingAdapter = (typeof IMAGING_ADAPTERS)[number];

/** Etiquetas de UI. Como en el resto del dominio, viven aquí y no en el componente. */
export const IMAGING_ADAPTER_LABELS: Record<ImagingAdapter, string> = {
  carpeta: "Carpeta vigilada",
  twain: "Sensor TWAIN",
  dicom: "Equipo DICOM",
  sdk: "SDK del fabricante",
};

/** Ayuda breve por adaptador, para el formulario de ajustes. */
export const IMAGING_ADAPTER_HINTS: Record<ImagingAdapter, string> = {
  carpeta: "Vigila una carpeta donde el equipo deja las imágenes. Funciona con cualquier aparato que sepa exportar a disco.",
  twain: "Sensores intraorales con driver TWAIN. Es lo habitual en Carestream, Vatech, Dürr y compatibles.",
  dicom: "Ortopantomógrafos y CBCT que envían por DICOM.",
  sdk: "Integración específica del fabricante, cuando el equipo no expone TWAIN.",
};

const nonEmpty = (message: string) => z.string().trim().min(1, message);

/**
 * La modalidad se valida contra el MISMO catálogo que usa `patient_images`
 * (`isImageModality`), no contra una lista copiada: una copia se desincroniza en
 * cuanto alguien añada una modalidad nueva a la migración.
 */
const modalitySchema = z
  .string({ required_error: "Elige una modalidad" })
  .refine(isImageModality, "Modalidad de imagen no válida");

const carpetaSettings = z
  .object({
    path: nonEmpty("Indica la carpeta que hay que vigilar"),
  })
  .strict();

const twainSettings = z
  .object({
    source: nonEmpty("Indica el nombre de la fuente TWAIN"),
  })
  .strict();

const dicomSettings = z
  .object({
    aeTitle: nonEmpty("Indica el AE title"),
    port: z
      .number({ required_error: "Indica el puerto" })
      .int("El puerto debe ser un número entero")
      .min(1, "Puerto fuera de rango")
      .max(65535, "Puerto fuera de rango"),
  })
  .strict();

const sdkSettings = z
  .object({
    vendor: nonEmpty("Indica el fabricante"),
  })
  .strict();

/**
 * Un equipo de imagen del salón.
 *
 * Se modela como unión DISCRIMINADA por `adapter`: así el tipo de `settings`
 * queda determinado por el adaptador elegido, tanto para Zod como para
 * TypeScript, y no cabe guardar los ajustes de un adaptador bajo otro.
 */
export const imagingDeviceSchema = z.discriminatedUnion("adapter", [
  z.object({
    name: nonEmpty("Ponle un nombre al equipo"),
    adapter: z.literal("carpeta"),
    settings: carpetaSettings,
    modality: modalitySchema,
    active: z.boolean().default(true),
  }),
  z.object({
    name: nonEmpty("Ponle un nombre al equipo"),
    adapter: z.literal("twain"),
    settings: twainSettings,
    modality: modalitySchema,
    active: z.boolean().default(true),
  }),
  z.object({
    name: nonEmpty("Ponle un nombre al equipo"),
    adapter: z.literal("dicom"),
    settings: dicomSettings,
    modality: modalitySchema,
    active: z.boolean().default(true),
  }),
  z.object({
    name: nonEmpty("Ponle un nombre al equipo"),
    adapter: z.literal("sdk"),
    settings: sdkSettings,
    modality: modalitySchema,
    active: z.boolean().default(true),
  }),
]);

export type ImagingDeviceInput = z.infer<typeof imagingDeviceSchema>;
