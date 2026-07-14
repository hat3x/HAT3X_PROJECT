import { z } from "zod";

import { saleLineSchema } from "./sale";

/**
 * Esquema de validación de la emisión de una factura Veri*factu.
 *
 * Se usa en el Server Action (`app/(dashboard)/tpv/invoice-actions.ts`) como
 * validación de confianza en servidor. La aritmética de IVA NO se valida aquí:
 * el servidor recalcula los totales desde las líneas con `@/lib/payments` (misma
 * fuente que la caja), nunca desde importes del cliente.
 *
 * Dos formas de indicar QUÉ se factura (excluyentes):
 *   · `saleId`  → factura de una venta ya registrada (se leen sus líneas de BD).
 *   · `lines`   → factura libre (líneas enviadas directamente, como en el TPV).
 *
 * Dos formas de indicar el RECEPTOR de una factura completa (F1):
 *   · `customerId` → se cargan los datos fiscales del cliente guardado.
 *   · `recipient`  → datos fiscales introducidos a mano (cliente no fichado).
 * El 'ticket' (F2) es simplificado y no lleva receptor.
 */

/** Serie de facturación: letras/dígitos y separadores habituales, 1–60 chars. */
const seriesSchema = z
  .string({ required_error: "La serie es obligatoria" })
  .trim()
  .min(1, "La serie es obligatoria")
  .max(60, "La serie no puede superar 60 caracteres")
  .regex(/^[A-Za-z0-9/-]+$/, "Serie no válida (usa letras, dígitos, '-' o '/')");

/** Datos fiscales del receptor introducidos a mano (factura completa sin ficha). */
export const recipientSchema = z.object({
  taxId: z
    .string({ required_error: "El NIF del cliente es obligatorio" })
    .trim()
    .min(1, "El NIF del cliente es obligatorio")
    .max(20, "El NIF no puede superar 20 caracteres"),
  name: z
    .string({ required_error: "El nombre del cliente es obligatorio" })
    .trim()
    .min(1, "El nombre del cliente es obligatorio")
    .max(200, "El nombre no puede superar 200 caracteres"),
  address: z
    .string()
    .trim()
    .max(1000, "La dirección no puede superar 1000 caracteres")
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value)),
});

export const invoiceEmissionSchema = z
  .object({
    /** Tipo de factura: 'ticket' (simplificada) | 'completa' (con receptor). */
    invoiceType: z.enum(["ticket", "completa"], {
      required_error: "Selecciona el tipo de factura",
    }),
    /** Serie de facturación (numeración correlativa por serie). */
    series: seriesSchema,
    /** Venta de origen a facturar; excluyente con `lines`. */
    saleId: z.string().uuid().nullable().optional(),
    /** Líneas a facturar directamente (factura libre); excluyente con `saleId`. */
    lines: z.array(saleLineSchema).min(1, "Añade al menos una línea").optional(),
    /** Cliente fichado del que tomar los datos fiscales (receptor). */
    customerId: z.string().uuid().nullable().optional(),
    /** Datos fiscales del receptor a mano; alternativa a `customerId`. */
    recipient: recipientSchema.optional(),
  })
  .refine((value) => value.saleId != null || (value.lines?.length ?? 0) > 0, {
    message: "Indica una venta (saleId) o al menos una línea a facturar",
    path: ["lines"],
  })
  .refine(
    (value) =>
      value.invoiceType !== "completa" ||
      value.customerId != null ||
      value.recipient !== undefined,
    {
      message: "Una factura completa requiere el cliente (customerId) o sus datos fiscales",
      path: ["recipient"],
    },
  );

/** Entrada (importes como texto en las líneas). */
export type InvoiceEmissionInput = z.input<typeof invoiceEmissionSchema>;
/** Salida validada (importes de línea en céntimos). */
export type InvoiceEmissionValues = z.output<typeof invoiceEmissionSchema>;
/** Receptor validado. */
export type RecipientValues = z.output<typeof recipientSchema>;
