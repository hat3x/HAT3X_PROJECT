import { z } from "zod";

/**
 * Validación del registro de un implante colocado (A3).
 *
 * El formulario se rellena con el paciente en el sillón y la caja en la mano.
 * Lo que aquí se guarde es lo que habrá que enseñar años después, cuando el
 * fabricante retire un lote o venga una inspección, sin nadie que recuerde el
 * caso.
 *
 * Dos tensiones opuestas, y el equilibrio entre ellas ES el esquema:
 *
 *  · **Exigir poco.** Si pide demasiado, alguien cierra el formulario y el
 *    implante no queda registrado en ninguna parte. Un registro con lote pero
 *    sin medidas vale infinitamente más que ninguno. Solo son obligatorios el
 *    paciente y el diente.
 *  · **No admitir basura que parezca dato.** Un diente "99" o un GTIN a medias
 *    pasan desapercibidos en la ficha y fallan justo el día que se buscan.
 */

/** Vacío o solo espacios → `null`. Nunca cadena vacía. */
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v));

export const implantPlacementSchema = z.object({
  customerId: z.string().uuid("Elige un paciente"),

  /**
   * Numeración FDI por cuadrantes: 11–18, 21–28, 31–38, 41–48. El rango
   * 11–48 acota lo suficiente para atrapar el error de tecleo, que es lo que
   * de verdad ocurre; afinar cuadrante a cuadrante rechazaría también dientes
   * supernumerarios que alguna clínica anota así.
   */
  fdiCode: z
    .number({ required_error: "Indica el diente" })
    .int("Diente no válido")
    .min(11, "Diente no válido (numeración FDI: 11–48)")
    .max(48, "Diente no válido (numeración FDI: 11–48)"),

  /** El código leído sin interpretar: si mañana sabemos leerlo mejor, sigue ahí. */
  udiRaw: opcional(400),

  gtin: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "El GTIN tiene 14 cifras")
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),

  lot: opcional(64),
  serial: opcional(64),
  ref: opcional(64),
  brand: opcional(120),

  /** ISO `YYYY-MM-DD`. */
  expiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida")
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),

  // Medidas: un cero o un negativo no es "no lo sé", es un dato falso. Se
  // rechazan; dejarlas en blanco sí es una respuesta legítima.
  diameterMm: z.number().positive("El diámetro debe ser mayor que 0").nullable().optional(),
  lengthMm: z.number().positive("La longitud debe ser mayor que 0").nullable().optional(),

  professionalId: z.string().uuid().nullable().optional(),
  appointmentId: z.string().uuid().nullable().optional(),
  notes: opcional(1000),
});

export type ImplantPlacementInput = z.input<typeof implantPlacementSchema>;
export type ImplantPlacementValues = z.output<typeof implantPlacementSchema>;
