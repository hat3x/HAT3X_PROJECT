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

// ----------------------------------------------------------------------------
// 5. Facturación (sub-6)
// ----------------------------------------------------------------------------

/** Serie de facturación: alfanumérica corta (p.ej. 'A', '2026', 'FR'). */
export const serieFacturaSchema = z
  .string()
  .trim()
  .min(1, 'La serie no puede estar vacía')
  .max(16, 'La serie es demasiado larga')
  .regex(/^[A-Za-z0-9-]+$/, 'La serie sólo admite letras, dígitos y guiones');

/**
 * Datos fiscales del CLIENTE al emitir. Todos opcionales: sin ellos la factura
 * es simplificada (tique). Se congelan como snapshot en la factura.
 */
export const datosFiscalesClienteSchema = z
  .object({
    razon_social: z.string().trim().max(200).nullish(),
    nif: z.string().trim().max(20).nullish(),
    direccion_fiscal: z.string().trim().max(400).nullish(),
    email: z.string().trim().email('Email no válido').max(200).nullish(),
  })
  .strict();

export type DatosFiscalesClienteInput = z.infer<typeof datosFiscalesClienteSchema>;

/**
 * Emitir factura a partir de un ticket. La numeración correlativa por
 * (salon, serie) la asigna la BD; los importes/desglose los recalcula el
 * servidor desde las líneas persistidas (nunca se envían importes).
 */
export const emitirFacturaSchema = z
  .object({
    venta_id: uuid,
    /** Serie a usar; si se omite se toma la del salón (config) o 'A'. */
    serie: serieFacturaSchema.optional(),
    /** Datos fiscales del cliente; si se omiten → factura simplificada. */
    cliente: datosFiscalesClienteSchema.optional(),
  })
  .strict();

export type EmitirFacturaInput = z.infer<typeof emitirFacturaSchema>;

/** Obtener una factura ya emitida (para ver / reimprimir / descargar). */
export const obtenerFacturaSchema = z
  .object({
    /** Por id de factura… */
    factura_id: uuid.optional(),
    /** …o por el ticket del que procede. Debe venir exactamente uno. */
    venta_id: uuid.optional(),
  })
  .strict()
  .refine((v) => !!v.factura_id !== !!v.venta_id, {
    message: 'Indica factura_id O venta_id (exactamente uno)',
    path: ['factura_id'],
  });

export type ObtenerFacturaInput = z.infer<typeof obtenerFacturaSchema>;

// ----------------------------------------------------------------------------
// 6. Caja (sub-5) — apertura, movimientos manuales, cierre con arqueo, histórico
// ----------------------------------------------------------------------------

export const tipoMovimientoCajaSchema = z.enum(['entrada', 'salida']);
export const estadoCajaSchema = z.enum(['abierta', 'cerrada']);

/**
 * Abrir caja con un fondo inicial. Como máximo puede haber UNA sesión abierta
 * por salón (índice único parcial en BD); el servidor traduce el conflicto.
 */
export const abrirCajaSchema = z
  .object({
    salon_id: uuid,
    /** Fondo de cambio con el que arranca el turno (≥ 0). */
    saldo_inicial: z.coerce.number().min(0, 'El fondo inicial no puede ser negativo'),
    empleado_apertura_id: uuid.nullish(),
    notas: z.string().trim().max(1000).nullish(),
  })
  .strict();

export type AbrirCajaInput = z.infer<typeof abrirCajaSchema>;

/**
 * Movimiento manual de efectivo sobre una sesión abierta. `importe` positivo;
 * el signo lo aporta `tipo` (entrada suma al cajón, salida resta).
 */
export const movimientoCajaSchema = z
  .object({
    sesion_caja_id: uuid,
    tipo: tipoMovimientoCajaSchema,
    importe: z.coerce.number().refine((n) => n >= 0.01, 'El importe debe ser > 0'),
    motivo: z.string().trim().min(1, 'El motivo es obligatorio').max(300),
    empleado_id: uuid.nullish(),
  })
  .strict();

export type MovimientoCajaInput = z.infer<typeof movimientoCajaSchema>;

/**
 * Cerrar caja con arqueo. El cajero aporta el efectivo REAL contado; el teórico
 * y el descuadre los calcula el servidor (fuente de verdad: shared/caja.ts).
 */
export const cerrarCajaSchema = z
  .object({
    sesion_caja_id: uuid,
    /** Efectivo físicamente contado en el cajón al cierre (≥ 0). */
    efectivo_real: z.coerce.number().min(0, 'El efectivo contado no puede ser negativo'),
    empleado_cierre_id: uuid.nullish(),
    /** Nota de cierre (p.ej. justificación de un descuadre). Se añade a notas. */
    notas_cierre: z.string().trim().max(1000).nullish(),
  })
  .strict();

export type CerrarCajaInput = z.infer<typeof cerrarCajaSchema>;

/**
 * Obtener una caja: por su id, o la sesión ABIERTA de un salón (para reanudar el
 * turno). Debe venir exactamente uno de los dos.
 */
export const obtenerCajaSchema = z
  .object({
    sesion_caja_id: uuid.optional(),
    /** Devuelve la sesión abierta del salón (o `null` si no hay ninguna). */
    salon_id: uuid.optional(),
  })
  .strict()
  .refine((v) => !!v.sesion_caja_id !== !!v.salon_id, {
    message: 'Indica sesion_caja_id O salon_id (exactamente uno)',
    path: ['sesion_caja_id'],
  });

export type ObtenerCajaInput = z.infer<typeof obtenerCajaSchema>;

/** Histórico de sesiones de caja de un salón, filtrable por estado y ventana. */
export const listarSesionesCajaSchema = z
  .object({
    salon_id: uuid,
    estado: estadoCajaSchema.optional(),
    /** Límite de filas (paginación simple, orden por apertura desc). */
    limite: z.coerce.number().int().min(1).max(200).default(50),
    /** Sólo sesiones abiertas a partir de esta marca ISO-8601 (opcional). */
    desde: z.string().datetime({ offset: true }).optional(),
    /** Sólo sesiones abiertas hasta esta marca ISO-8601 (opcional). */
    hasta: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type ListarSesionesCajaInput = z.infer<typeof listarSesionesCajaSchema>;

// ----------------------------------------------------------------------------
// 7. Integración con la agenda/reservas (sub-7)
// ----------------------------------------------------------------------------

/**
 * Crear un ticket PRECARGADO a partir de una reserva completada. El servidor
 * lee la reserva (vista `tpv_v_reserva_precarga`, RLS del usuario), valida su
 * estado y monta la línea de servicio + cliente/empleado. El cliente NO envía
 * importes ni descripción: sólo referencia la reserva. Idempotente: si la
 * reserva ya tiene un ticket vivo, se devuelve ese mismo ticket.
 */
export const crearTicketDesdeReservaSchema = z
  .object({
    reserva_id: uuid,
    /** Caja en la que se registra el cobro (opcional). */
    sesion_caja_id: uuid.nullish(),
    /** Empleado que cobra; si se omite, se toma el de la reserva. */
    empleado_id: uuid.nullish(),
    notas: z.string().trim().max(1000).nullish(),
  })
  .strict();

export type CrearTicketDesdeReservaInput = z.infer<
  typeof crearTicketDesdeReservaSchema
>;

/** Consultar el estado de cobro (enlace bidireccional) de una reserva. */
export const obtenerReservaCobroSchema = z
  .object({ reserva_id: uuid })
  .strict();

export type ObtenerReservaCobroInput = z.infer<typeof obtenerReservaCobroSchema>;
