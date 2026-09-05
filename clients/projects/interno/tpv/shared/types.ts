// ============================================================================
// TPV · Tipos de dominio (filas de BD y respuestas de la API)
// ----------------------------------------------------------------------------
// Reflejan el esquema de db/migrations/20260713000001_tpv_module.up.sql.
// Los importes llegan como number (numeric → JS number vía supabase-js).
// Las marcas temporales son cadenas ISO-8601 (timestamptz serializado).
// ============================================================================

export type EstadoVenta = 'abierta' | 'pagada' | 'anulada' | 'reembolsada';
export type EstadoPago = 'completado' | 'pendiente' | 'reembolsado';
export type TipoLinea = 'servicio' | 'producto' | 'descuento' | 'otro';
export type EstadoFactura = 'emitida' | 'rectificada' | 'anulada';
export type EstadoCaja = 'abierta' | 'cerrada';
export type TipoMovimientoCaja = 'entrada' | 'salida';

/** Fila de `tpv_ventas` (cabecera de ticket). */
export interface Venta {
  id: string;
  salon_id: string;
  sesion_caja_id: string | null;
  reserva_id: string | null;
  cliente_id: string | null;
  empleado_id: string | null;
  numero_ticket: number;
  estado: EstadoVenta;
  subtotal: number;
  descuento_total: number;
  impuestos_total: number;
  total: number;
  notas: string | null;
  anulada_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de `tpv_lineas_ticket`. */
export interface LineaTicket {
  id: string;
  venta_id: string;
  salon_id: string;
  tipo: TipoLinea;
  referencia_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  tipo_impuesto: number;
  importe_impuesto: number;
  total_linea: number;
  orden: number;
  created_at: string;
}

/** Fila de `tpv_pagos`. */
export interface Pago {
  id: string;
  venta_id: string;
  salon_id: string;
  metodo_pago_id: string;
  sesion_caja_id: string | null;
  importe: number;
  estado: EstadoPago;
  referencia_externa: string | null;
  pagado_at: string;
  created_at: string;
}

/** Fila de `tpv_metodos_pago`. */
export interface MetodoPago {
  id: string;
  salon_id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
}

/** Saldo de cobro de un ticket (derivado, no persistido). */
export interface SaldoResumen {
  total: number;
  pagado: number;
  pendiente: number;
  sobrepago: number;
  cubierto: boolean;
}

/**
 * Respuesta estándar de las funciones que devuelven un ticket completo
 * (crear, actualizar líneas, registrar pago, obtener). Es el "agregado ticket".
 */
export interface TicketCompleto {
  venta: Venta;
  lineas: LineaTicket[];
  pagos: Pago[];
  saldo: SaldoResumen;
}

// ============================================================================
// Facturación (sub-6)
// ----------------------------------------------------------------------------
// Reflejan `tpv_config_facturacion` y `tpv_facturas` (+ columnas de snapshot de
// 20260713000003_tpv_facturacion). La factura es AUTOCONTENIDA: al emitirse
// congela emisor, desglose de IVA y líneas, y no depende de la config ni del
// ticket posteriores.
// ============================================================================

/** Datos fiscales del EMISOR (el salón) congelados en la factura. */
export interface DatosFiscalesEmisor {
  razon_social: string | null;
  nif: string | null;
  direccion_fiscal: string | null;
}

/** Datos fiscales del CLIENTE (destinatario) congelados en la factura. */
export interface DatosFiscalesCliente {
  razon_social: string | null;
  nif: string | null;
  direccion_fiscal: string | null;
  email: string | null;
}

/** Un tramo del desglose de IVA por tipo impositivo (snapshot en la factura). */
export interface DesgloseIvaTramo {
  tipo_impuesto: number;
  base: number;
  cuota: number;
}

/** Línea facturada congelada (copia inmutable de una línea de ticket). */
export interface LineaFacturaSnapshot {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  tipo_impuesto: number;
  importe_impuesto: number;
  total_linea: number;
}

/** Fila de `tpv_config_facturacion` (config de facturación por salón). */
export interface ConfigFacturacion {
  salon_id: string;
  serie_por_defecto: string;
  emisor_razon_social: string | null;
  emisor_nif: string | null;
  emisor_direccion_fiscal: string | null;
  pie_factura: string | null;
  moneda: string;
  created_at: string;
  updated_at: string;
}

/** Fila de `tpv_facturas` (incluye el snapshot fiscal de sub-6). */
export interface Factura {
  id: string;
  salon_id: string;
  venta_id: string | null;
  cliente_id: string | null;

  serie: string;
  numero: number;
  estado: EstadoFactura;

  // Snapshot del cliente (destinatario).
  razon_social: string | null;
  nif: string | null;
  direccion_fiscal: string | null;
  cliente_email: string | null;

  // Snapshot del emisor (el salón).
  emisor_razon_social: string | null;
  emisor_nif: string | null;
  emisor_direccion_fiscal: string | null;

  base_imponible: number;
  impuestos: number;
  total: number;
  moneda: string;

  desglose_iva: DesgloseIvaTramo[];
  lineas_snapshot: LineaFacturaSnapshot[];
  pie_factura: string | null;

  factura_rectificada_id: string | null;
  emitida_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Referencia legible de la factura: "A/000123" (serie/número con relleno).
 * Es un derivado de presentación, no una columna persistida.
 */
export interface FacturaCompleta {
  factura: Factura;
  /** Número formateado para mostrar/imprimir, p.ej. "A/000123". */
  referencia: string;
}

// ============================================================================
// Caja (sub-5)
// ----------------------------------------------------------------------------
// Reflejan `tpv_sesiones_caja` (apertura/cierre, sub-1) y `tpv_movimientos_caja`
// (ajustes manuales de efectivo, 20260713000004_tpv_caja). El arqueo y el
// resumen de cobros son DERIVADOS (los calcula shared/caja.ts), no columnas.
// ============================================================================

/** Fila de `tpv_sesiones_caja` (una sesión de caja = un turno). */
export interface SesionCaja {
  id: string;
  salon_id: string;
  empleado_apertura_id: string | null;
  empleado_cierre_id: string | null;
  estado: EstadoCaja;

  saldo_inicial: number;
  /** Efectivo teórico calculado por la app al cerrar. null mientras abierta. */
  saldo_final_teorico: number | null;
  /** Efectivo real contado al cerrar. null mientras abierta. */
  saldo_final_real: number | null;
  /** real − teórico, fijado al cerrar. null mientras abierta. */
  descuadre: number | null;

  notas: string | null;
  abierta_at: string;
  cerrada_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de `tpv_movimientos_caja` (entrada/salida manual de efectivo). */
export interface MovimientoCaja {
  id: string;
  sesion_caja_id: string;
  salon_id: string;
  empleado_id: string | null;
  tipo: TipoMovimientoCaja;
  /** Siempre > 0; el signo lo aporta `tipo`. */
  importe: number;
  motivo: string;
  created_at: string;
}

/** Arqueo derivado de una sesión (teórico desglosado + real + descuadre). */
export interface ArqueoCaja {
  saldo_inicial: number;
  cobros_efectivo: number;
  entradas: number;
  salidas: number;
  movimientos_neto: number;
  efectivo_teorico: number;
  efectivo_real: number | null;
  descuadre: number | null;
  cuadra: boolean;
}

/** Total cobrado por método de pago (para el resumen diario de cobros). */
export interface CobroPorMetodo {
  metodo_pago_id: string;
  codigo: string;
  nombre: string;
  numero_pagos: number;
  total: number;
}

/** Desglose de lo cobrado en la sesión (efectivo vs. resto + por método). */
export interface ResumenCaja {
  total: number;
  efectivo: number;
  otros: number;
  numero_cobros: number;
  /** Número de tickets cobrados en la sesión. */
  numero_tickets: number;
  por_metodo: CobroPorMetodo[];
}

/**
 * Agregado "caja": la sesión + sus movimientos + el arqueo derivado + el resumen
 * de cobros. Es la respuesta estándar de las funciones de caja (abrir, movimiento,
 * cerrar, obtener), análoga a `TicketCompleto`.
 */
export interface CajaCompleta {
  sesion: SesionCaja;
  movimientos: MovimientoCaja[];
  arqueo: ArqueoCaja;
  resumen: ResumenCaja;
}

/** Fila del histórico de sesiones: la sesión + totales para la lista. */
export interface ResumenSesion {
  sesion: SesionCaja;
  /** Total cobrado en la sesión (todos los métodos). */
  total_cobrado: number;
  numero_tickets: number;
}

// ============================================================================
// Integración con la agenda/reservas (sub-7)
// ----------------------------------------------------------------------------
// Reflejan las vistas `tpv_v_reserva_precarga` y `tpv_v_reservas_cobro` de
// 20260713000005_tpv_reservas_integracion. El enlace es NO INVASIVO: el estado
// de cobro se DERIVA de `tpv_ventas`, no se escribe en `reservas`.
// ============================================================================

/** Estado de cobro de una reserva, derivado del ticket vivo asociado. */
export type EstadoCobroReserva =
  | 'sin_ticket'      // aún no hay ticket para la reserva
  | 'ticket_abierto'  // ticket creado, pendiente de cobro
  | 'cobrada'         // ticket 'pagada'
  | 'reembolsada';    // ticket 'reembolsada'

/** Fila de `tpv_v_reserva_precarga`: la reserva normalizada para abrir ticket. */
export interface ReservaPrecarga {
  reserva_id: string;
  salon_id: string;
  cliente_id: string | null;
  empleado_id: string | null;
  servicio_id: string | null;
  servicio_nombre: string;
  /** Precio BASE sin IVA del servicio. */
  precio: number;
  /** % de IVA a aplicar a la línea del servicio. */
  tipo_impuesto: number;
  /** Estado crudo de la reserva en la agenda (p.ej. 'completada'). */
  reserva_estado: string;
  inicio_at: string | null;
}

/** Fila de `tpv_v_reservas_cobro`: enlace bidireccional reserva ↔ ticket. */
export interface ReservaCobro {
  reserva_id: string;
  salon_id: string;
  /** Ticket vivo (no anulado) asociado, o null si no hay ninguno. */
  venta_id: string | null;
  numero_ticket: number | null;
  ticket_estado: EstadoVenta | null;
  total: number | null;
  estado_cobro: EstadoCobroReserva;
  actualizado_at: string | null;
}

/**
 * Respuesta de `tpv-crear-ticket-desde-reserva`: el ticket precargado más un
 * flag que indica si ya existía (idempotencia) en vez de haberse creado ahora.
 */
export interface TicketDesdeReserva {
  ticket: TicketCompleto;
  /** true si la reserva ya tenía un ticket vivo y se devolvió ese. */
  ya_existia: boolean;
}
