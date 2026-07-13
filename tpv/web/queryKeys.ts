// ============================================================================
// TPV · Fábrica de query keys de TanStack Query
// ----------------------------------------------------------------------------
// Claves jerárquicas y tipadas para el dominio de cobros. Evita literales
// sueltos y permite invalidaciones por rama (p.ej. invalidar todos los tickets
// de un salón, o un ticket concreto).
// ============================================================================

export const tpvKeys = {
  all: ['tpv'] as const,

  tickets: () => [...tpvKeys.all, 'tickets'] as const,
  /** Lista de tickets de un salón (con filtros opcionales serializables). */
  ticketsList: (salonId: string, filtros?: Record<string, unknown>) =>
    [...tpvKeys.tickets(), 'list', salonId, filtros ?? {}] as const,
  /** Un ticket concreto (agregado completo). */
  ticket: (ventaId: string) => [...tpvKeys.tickets(), 'detail', ventaId] as const,

  metodosPago: (salonId: string) =>
    [...tpvKeys.all, 'metodos-pago', salonId] as const,

  facturas: () => [...tpvKeys.all, 'facturas'] as const,
  /** Una factura concreta por su id. */
  factura: (facturaId: string) =>
    [...tpvKeys.facturas(), 'detail', facturaId] as const,
  /** La factura asociada a un ticket (si existe). */
  facturaDeVenta: (ventaId: string) =>
    [...tpvKeys.facturas(), 'de-venta', ventaId] as const,
  /** Config de facturación de un salón (serie + datos fiscales). */
  configFacturacion: (salonId: string) =>
    [...tpvKeys.all, 'config-facturacion', salonId] as const,

  /** Estado de cobro (enlace bidireccional) de una reserva de la agenda (sub-7). */
  reservaCobro: (reservaId: string) =>
    [...tpvKeys.all, 'reserva-cobro', reservaId] as const,

  // -- Caja (sub-5) -----------------------------------------------------------
  caja: () => [...tpvKeys.all, 'caja'] as const,
  /** Una sesión de caja concreta (agregado completo). */
  sesionCaja: (sesionId: string) => [...tpvKeys.caja(), 'detail', sesionId] as const,
  /** La sesión de caja ABIERTA de un salón (o su ausencia). */
  cajaAbierta: (salonId: string) => [...tpvKeys.caja(), 'abierta', salonId] as const,
  /** Histórico de sesiones de un salón (con filtros serializables). */
  sesionesCaja: (salonId: string, filtros?: Record<string, unknown>) =>
    [...tpvKeys.caja(), 'list', salonId, filtros ?? {}] as const,
} as const;
