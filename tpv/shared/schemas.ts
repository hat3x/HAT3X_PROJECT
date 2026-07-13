// ============================================================================
// TPV · Esquemas de validación Zod (contrato de la API de cobros)
// ----------------------------------------------------------------------------
// Un único origen de verdad para la validación de entrada, compartido entre las
// Edge Functions (que hacen `safeParse` del body) y la capa web (que puede
// validar antes de enviar). Los tipos de payload se INFIEREN de estos esquemas
// con z.infer — no se duplican interfaces a mano.
//
// El especificador `zod` se resuelve vía import_map en Deno (npm:zod) y vía
// node_modules en la web: el mismo `import { z } from 'zod'` sirve en ambos.
// ============================================================================

import { z } from 'zod';

// ----------------------------------------------------------------------------
// Piezas reutilizables
// ----------------------------------------------------------------------------

const uuid = z.string().uuid('Identificador UUID no válido');

export const tipoLineaSchema = z.enum([
  'servicio',
  'producto',
  'descuento',
  'otro',
]);

export const estadoPagoSchema = z.enum([
  'completado',
  'pendiente',
  'reembolsado',
]);

/**
 * Línea de ticket de entrada. El cliente NO envía importes calculados
 * (importe_impuesto, total_linea): el servidor los deriva con money.ts.
 * `descuento` (importe) y `descuento_pct` (%) son excluyentes.
 */
export const lineaInputSchema = z
  .object({
    tipo: tipoLineaSchema.default('servicio'),
    referencia_id: uuid.nullish(),
    descripcion: z.string().trim().min(1, 'La descripción es obligatoria').max(300),
    cantidad: z.coerce.number().positive('La cantidad debe ser > 0'),
    precio_unitario: z.coerce
      .number()
      .min(0, 'El precio no puede ser negativo'),
    descuento: z.coerce.number().min(0, 'El descuento no puede ser negativo').default(0),
    descuento_pct: z.coerce
      .number()
      .min(0)
      .max(100, 'El descuento porcentual debe estar entre 0 y 100')
      .optional(),
    tipo_impuesto: z.coerce
      .number()
      .min(0, 'El % de IVA no puede ser negativo')
      .max(100)
      .default(21),
    orden: z.coerce.number().int().min(0).optional(),
  })
  .strict()
  .refine((l) => !(l.descuento > 0 && l.descuento_pct != null), {
    message: 'Usa descuento (importe) o descuento_pct (%), no ambos',
    path: ['descuento_pct'],
  });

export type LineaInput = z.infer<typeof lineaInputSchema>;

// ----------------------------------------------------------------------------
// 1. Crear ticket
// ----------------------------------------------------------------------------
export const crearTicketSchema = z
  .object({
    salon_id: uuid,
    sesion_caja_id: uuid.nullish(),
    reserva_id: uuid.nullish(),
    cliente_id: uuid.nullish(),
    empleado_id: uuid.nullish(),
    notas: z.string().trim().max(1000).nullish(),
    /** Líneas iniciales opcionales (permite crear un ticket vacío). */
    lineas: z.array(lineaInputSchema).max(200).default([]),
  })
  .strict();

export type CrearTicketInput = z.infer<typeof crearTicketSchema>;

// ----------------------------------------------------------------------------
// 2. Actualizar líneas (añadir / editar / eliminar / aplicar descuentos)
//    Semántica declarativa: `lineas` es el CONJUNTO COMPLETO deseado. El
//    servidor reemplaza las líneas del ticket y recalcula la cabecera. Cubre
//    de forma uniforme añadir, editar, borrar y descontar.
// ----------------------------------------------------------------------------
export const actualizarLineasSchema = z
  .object({
    venta_id: uuid,
    lineas: z.array(lineaInputSchema).max(200),
  })
  .strict();

export type ActualizarLineasInput = z.infer<typeof actualizarLineasSchema>;

// ----------------------------------------------------------------------------
// 3. Registrar pago (efectivo, tarjeta, mixto)
// ----------------------------------------------------------------------------
export const pagoInputSchema = z
  .object({
    metodo_pago_id: uuid,
    /** Positivo = cobro; negativo = devolución/cambio. Nunca 0. */
    importe: z.coerce
      .number()
      .refine((n) => Math.abs(n) >= 0.01, 'El importe del pago no puede ser 0'),
    referencia_externa: z.string().trim().max(120).nullish(),
    estado: estadoPagoSchema.default('completado'),
  })
  .strict();

export type PagoInput = z.infer<typeof pagoInputSchema>;

export const registrarPagoSchema = z
  .object({
    venta_id: uuid,
    /** Caja para el cuadre de efectivo (si el pago se hace dentro de una sesión). */
    sesion_caja_id: uuid.nullish(),
    /** Uno o varios pagos → pago mixto (p.ej. parte efectivo + parte tarjeta). */
    pagos: z.array(pagoInputSchema).min(1, 'Debe haber al menos un pago').max(20),
    /** Marcar la venta como 'pagada' si queda cubierta. */
    marcar_pagada: z.boolean().default(true),
    /** Permitir cobro parcial (no exige cubrir el total). */
    permitir_parcial: z.boolean().default(false),
  })
  .strict();

export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;

// ----------------------------------------------------------------------------
// 4. Obtener ticket
// ----------------------------------------------------------------------------
export const obtenerTicketSchema = z
  .object({ venta_id: uuid })
  .strict();

export type ObtenerTicketInput = z.infer<typeof obtenerTicketSchema>;
