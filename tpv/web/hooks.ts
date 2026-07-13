// ============================================================================
// TPV · Hooks de dominio TanStack Query (cobros)
// ----------------------------------------------------------------------------
// Encapsulan la lógica de fetching/mutación del TPV. La UI sólo consume hooks
// (`useTicket`, `useCrearTicket`, `useActualizarLineas`, `useRegistrarPago`).
//
// Todas las mutaciones devuelven el agregado `TicketCompleto` autoritativo del
// servidor; se escribe directamente en la caché del detalle (setQueryData) y se
// invalidan las listas del salón. Además se expone `previsualizarTicket` para
// calcular totales/IVA en cliente (mismo núcleo que el servidor) sin ir a red.
//
// Peer deps: react, @tanstack/react-query, @supabase/supabase-js.
// ============================================================================

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  actualizarLineas,
  crearTicket,
  emitirFactura,
  obtenerFactura,
  obtenerTicket,
  registrarPago,
} from './apiClient';
import { tpvKeys } from './queryKeys';
import type { FacturaCompleta, TicketCompleto } from '../shared/types';
import type {
  ActualizarLineasInput,
  CrearTicketInput,
  EmitirFacturaInput,
  LineaInput,
  RegistrarPagoInput,
} from '../shared/schemas';
import { calcularTicket, type ResumenTicket } from '../shared/money';

/**
 * Previsualización de totales/IVA en cliente para el carrito en curso, con el
 * MISMO cálculo que aplica el servidor. Útil para mostrar el total mientras el
 * cajero edita, sin round-trips. El importe definitivo lo fija el servidor.
 */
export function previsualizarTicket(lineas: LineaInput[]): ResumenTicket {
  return calcularTicket(lineas).totales;
}

// ----------------------------------------------------------------------------
// Query: ticket completo
// ----------------------------------------------------------------------------
export function useTicket(
  sb: SupabaseClient,
  ventaId: string | null | undefined,
): UseQueryResult<TicketCompleto, Error> {
  return useQuery({
    queryKey: tpvKeys.ticket(ventaId ?? '∅'),
    queryFn: () => obtenerTicket(sb, { venta_id: ventaId as string }),
    enabled: !!ventaId,
    staleTime: 15_000, // el ticket cambia con cada acción del cajero
  });
}

/** Escribe el agregado devuelto en la caché e invalida las listas del salón. */
function sincronizarCache(
  qc: ReturnType<typeof useQueryClient>,
  ticket: TicketCompleto,
): void {
  qc.setQueryData(tpvKeys.ticket(ticket.venta.id), ticket);
  qc.invalidateQueries({ queryKey: tpvKeys.ticketsList(ticket.venta.salon_id) });
}

// ----------------------------------------------------------------------------
// Mutación: crear ticket
// ----------------------------------------------------------------------------
export function useCrearTicket(
  sb: SupabaseClient,
): UseMutationResult<TicketCompleto, Error, CrearTicketInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearTicketInput) => crearTicket(sb, input),
    onSuccess: (ticket) => sincronizarCache(qc, ticket),
  });
}

// ----------------------------------------------------------------------------
// Mutación: actualizar líneas (añadir / editar / borrar / descuentos)
// ----------------------------------------------------------------------------
export function useActualizarLineas(
  sb: SupabaseClient,
): UseMutationResult<TicketCompleto, Error, ActualizarLineasInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActualizarLineasInput) => actualizarLineas(sb, input),
    onSuccess: (ticket) => sincronizarCache(qc, ticket),
  });
}

// ----------------------------------------------------------------------------
// Mutación: registrar pago (efectivo, tarjeta, mixto)
// ----------------------------------------------------------------------------
export function useRegistrarPago(
  sb: SupabaseClient,
): UseMutationResult<TicketCompleto, Error, RegistrarPagoInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegistrarPagoInput) => registrarPago(sb, input),
    onSuccess: (ticket) => sincronizarCache(qc, ticket),
  });
}

// ----------------------------------------------------------------------------
// Facturación (sub-6)
// ----------------------------------------------------------------------------

/** Query: factura ya emitida de un ticket (null mientras no exista venta_id). */
export function useFactura(
  sb: SupabaseClient,
  ventaId: string | null | undefined,
): UseQueryResult<FacturaCompleta, Error> {
  return useQuery({
    queryKey: tpvKeys.facturaDeVenta(ventaId ?? '∅'),
    queryFn: () => obtenerFactura(sb, { venta_id: ventaId as string }),
    enabled: !!ventaId,
    staleTime: Infinity, // una factura emitida es inmutable
    retry: false, // 404 (aún no facturado) no debe reintentarse
  });
}

/**
 * Mutación: emitir factura a partir de un ticket. Escribe la factura en la caché
 * (por id y por venta) e invalida el ticket, que pasa a estar facturado.
 */
export function useEmitirFactura(
  sb: SupabaseClient,
): UseMutationResult<FacturaCompleta, Error, EmitirFacturaInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmitirFacturaInput) => emitirFactura(sb, input),
    onSuccess: (res) => {
      qc.setQueryData(tpvKeys.factura(res.factura.id), res);
      if (res.factura.venta_id) {
        qc.setQueryData(tpvKeys.facturaDeVenta(res.factura.venta_id), res);
        qc.invalidateQueries({ queryKey: tpvKeys.ticket(res.factura.venta_id) });
      }
      qc.invalidateQueries({
        queryKey: tpvKeys.ticketsList(res.factura.salon_id),
      });
    },
  });
}
