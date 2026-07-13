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
} as const;
