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
