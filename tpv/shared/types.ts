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
