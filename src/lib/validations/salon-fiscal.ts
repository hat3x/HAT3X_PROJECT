import { z } from "zod";

/**
 * Esquema de validación de los datos fiscales del salón (emisor de facturas).
 *
 * Mapea los conceptos fiscales españoles a los nombres en inglés del esquema:
 *   NIF/CIF        → tax_id         (varchar 20)
 *   razón social   → legal_name     (varchar 200)
 *   domicilio fisc.→ fiscal_address (text)
 *
 * Los tres campos son opcionales en base de datos (proyecto en desarrollo, sin
 * datos de producción). Aun así, para poder emitir una factura completa hacen
 * falta los tres, así que el formulario los presenta juntos como un bloque.
 *
 * Siguiendo el patrón de `salonSettingsSchema`/`customerSchema`, los opcionales
 * vacíos se normalizan a `undefined` para que el Server Action los traduzca a
 * `null`. No imponemos una regex de NIF/CIF: admite prefijo de país (IVA
 * intracomunitario) y evita rechazar formatos válidos poco comunes.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

export const salonFiscalSchema = z.object({
  tax_id: optionalText(20),
  legal_name: optionalText(200),
  fiscal_address: optionalText(1000),
});

export type SalonFiscalInput = z.input<typeof salonFiscalSchema>;
export type SalonFiscalValues = z.output<typeof salonFiscalSchema>;
