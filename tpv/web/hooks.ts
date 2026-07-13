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
  abrirCaja,
  actualizarLineas,
  cerrarCaja,
  crearTicket,
  crearTicketDesdeReserva,
  emitirFactura,
  listarSesionesCaja,
  obtenerCaja,
  obtenerFactura,
  obtenerReservaCobro,
  obtenerTicket,
  registrarMovimiento,
  registrarPago,
} from './apiClient';
import { tpvKeys } from './queryKeys';
import type {
  ArqueoCaja,
  CajaCompleta,
  FacturaCompleta,
  ReservaCobro,
  ResumenSesion,
  TicketCompleto,
  TicketDesdeReserva,
} from '../shared/types';
import type {
  AbrirCajaInput,
  ActualizarLineasInput,
  CerrarCajaInput,
  CrearTicketDesdeReservaInput,
  CrearTicketInput,
  EmitirFacturaInput,
  LineaInput,
  ListarSesionesCajaInput,
  MovimientoCajaInput,
  RegistrarPagoInput,
} from '../shared/schemas';
import { calcularTicket, type ResumenTicket } from '../shared/money';
import {
  calcularArqueo,
  type CobroCalculable,
  type MovimientoCalculable,
} from '../shared/caja';

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

// ----------------------------------------------------------------------------
// Integración con la agenda/reservas (sub-7)
// ----------------------------------------------------------------------------

/**
 * Mutación: crear (o recuperar) el ticket precargado de una reserva completada.
 * Escribe el ticket devuelto en la caché e invalida el estado de cobro de la
 * reserva (que pasa a 'ticket_abierto'). Es idempotente en el servidor.
 */
export function useCrearTicketDesdeReserva(
  sb: SupabaseClient,
): UseMutationResult<TicketDesdeReserva, Error, CrearTicketDesdeReservaInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearTicketDesdeReservaInput) =>
      crearTicketDesdeReserva(sb, input),
    onSuccess: (res, variables) => {
      sincronizarCache(qc, res.ticket);
      qc.invalidateQueries({
        queryKey: tpvKeys.reservaCobro(variables.reserva_id),
      });
    },
  });
}

/**
 * Query: estado de cobro de una reserva (enlace bidireccional). Útil para pintar
 * en la agenda si la reserva está cobrada / pendiente / sin ticket, y para abrir
 * el ticket asociado. `null` mientras no haya `reservaId`.
 */
export function useReservaCobro(
  sb: SupabaseClient,
  reservaId: string | null | undefined,
): UseQueryResult<ReservaCobro, Error> {
  return useQuery({
    queryKey: tpvKeys.reservaCobro(reservaId ?? '∅'),
    queryFn: () => obtenerReservaCobro(sb, { reserva_id: reservaId as string }),
    enabled: !!reservaId,
    staleTime: 15_000,
  });
}

// ----------------------------------------------------------------------------
// Caja (sub-5)
// ----------------------------------------------------------------------------

/**
 * Previsualiza el arqueo en cliente mientras el cajero cuenta el cajón, con el
 * MISMO cálculo que aplica el servidor al cerrar. El teórico definitivo lo fija
 * el servidor; esto sólo evita round-trips al teclear el efectivo contado.
 */
export function previsualizarArqueo(
  saldoInicial: number,
  cobros: CobroCalculable[],
  movimientos: MovimientoCalculable[],
  efectivoReal: number | null,
): ArqueoCaja {
  return calcularArqueo({
    saldo_inicial: saldoInicial,
    cobros,
    movimientos,
    efectivo_real: efectivoReal,
  });
}

/** Escribe el agregado de caja en la caché (por sesión y por salón/abierta). */
function sincronizarCaja(
  qc: ReturnType<typeof useQueryClient>,
  caja: CajaCompleta,
): void {
  qc.setQueryData(tpvKeys.sesionCaja(caja.sesion.id), caja);
  qc.setQueryData(
    tpvKeys.cajaAbierta(caja.sesion.salon_id),
    caja.sesion.estado === 'abierta' ? caja : null,
  );
  qc.invalidateQueries({ queryKey: tpvKeys.sesionesCaja(caja.sesion.salon_id) });
}

/** Query: una sesión de caja por id (agregado completo). `null` sin id. */
export function useCaja(
  sb: SupabaseClient,
  sesionId: string | null | undefined,
): UseQueryResult<CajaCompleta, Error> {
  return useQuery({
    queryKey: tpvKeys.sesionCaja(sesionId ?? '∅'),
    queryFn: () => obtenerCaja(sb, { sesion_caja_id: sesionId as string }),
    enabled: !!sesionId,
    staleTime: 10_000, // el arqueo cambia con cada cobro/movimiento
  });
}

/**
 * Query: la sesión de caja ABIERTA de un salón (o `null` si no hay ninguna).
 * Es la consulta de arranque del TPV: decide si mostrar "abrir caja" o el turno.
 */
export function useCajaAbierta(
  sb: SupabaseClient,
  salonId: string | null | undefined,
): UseQueryResult<CajaCompleta | null, Error> {
  return useQuery({
    queryKey: tpvKeys.cajaAbierta(salonId ?? '∅'),
    queryFn: () => obtenerCaja(sb, { salon_id: salonId as string }),
    enabled: !!salonId,
    staleTime: 10_000,
  });
}

/** Query: histórico de sesiones de caja de un salón (con total y nº tickets). */
export function useSesionesCaja(
  sb: SupabaseClient,
  input: ListarSesionesCajaInput | null,
): UseQueryResult<ResumenSesion[], Error> {
  return useQuery({
    queryKey: tpvKeys.sesionesCaja(input?.salon_id ?? '∅', {
      estado: input?.estado,
      desde: input?.desde,
      hasta: input?.hasta,
      limite: input?.limite,
    }),
    queryFn: () => listarSesionesCaja(sb, input as ListarSesionesCajaInput),
    enabled: !!input?.salon_id,
    staleTime: 30_000,
  });
}

/** Mutación: abrir caja con fondo inicial. */
export function useAbrirCaja(
  sb: SupabaseClient,
): UseMutationResult<CajaCompleta, Error, AbrirCajaInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AbrirCajaInput) => abrirCaja(sb, input),
    onSuccess: (caja) => sincronizarCaja(qc, caja),
  });
}

/** Mutación: registrar un movimiento manual de efectivo (entrada/salida). */
export function useMovimientoCaja(
  sb: SupabaseClient,
): UseMutationResult<CajaCompleta, Error, MovimientoCajaInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MovimientoCajaInput) => registrarMovimiento(sb, input),
    onSuccess: (caja) => sincronizarCaja(qc, caja),
  });
}

/** Mutación: cerrar caja con arqueo (aporta el efectivo real contado). */
export function useCerrarCaja(
  sb: SupabaseClient,
): UseMutationResult<CajaCompleta, Error, CerrarCajaInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CerrarCajaInput) => cerrarCaja(sb, input),
    onSuccess: (caja) => sincronizarCaja(qc, caja),
  });
}
