// ============================================================================
// TPV · Lógica de dominio del agregado "caja" (reutilizada por las funciones)
// ----------------------------------------------------------------------------
// Carga de la caja completa (sesión + movimientos + arqueo derivado + resumen de
// cobros) y helpers de estado. El servidor SIEMPRE recalcula el efectivo teórico
// y el desglose de cobros desde lo persistido (fuente de verdad: shared/caja.ts).
// ============================================================================

import { calcularArqueo, resumirCobros } from '../../shared/caja.ts';
import { redondear2 } from '../../shared/money.ts';
import { ErrorTpv } from '../../shared/errors.ts';
import type {
  CajaCompleta,
  CobroPorMetodo,
  MovimientoCaja,
  ResumenCaja,
  SesionCaja,
} from '../../shared/types.ts';
import { mapearErrorPg, type SupabaseClient } from './supabase.ts';

/** Código del método de pago que mueve el efectivo del cajón. */
const CODIGO_EFECTIVO = 'efectivo';

/** Lanza si la sesión no está 'abierta' (no admite movimientos ni recierre). */
export function exigirSesionAbierta(sesion: SesionCaja): void {
  if (sesion.estado !== 'abierta') {
    throw new ErrorTpv(
      'CAJA_NO_ABIERTA',
      'La sesión de caja está cerrada y no admite cambios',
      { sesion_caja_id: sesion.id },
    );
  }
}

/** Carga una sesión de caja por id (RLS decide visibilidad); 404 si no existe. */
export async function cargarSesion(
  sb: SupabaseClient,
  sesionId: string,
): Promise<SesionCaja> {
  const { data, error } = await sb
    .from('tpv_sesiones_caja')
    .select('*')
    .eq('id', sesionId)
    .maybeSingle();
  if (error) throw mapearErrorPg(error);
  if (!data) throw new ErrorTpv('NO_ENCONTRADO', 'Sesión de caja no encontrada');
  return data as SesionCaja;
}

/** Devuelve la sesión ABIERTA de un salón, o null si no hay ninguna. */
export async function sesionAbiertaDeSalon(
  sb: SupabaseClient,
  salonId: string,
): Promise<SesionCaja | null> {
  const { data, error } = await sb
    .from('tpv_sesiones_caja')
    .select('*')
    .eq('salon_id', salonId)
    .eq('estado', 'abierta')
    .maybeSingle();
  if (error) throw mapearErrorPg(error);
  return (data as SesionCaja | null) ?? null;
}

/** Pago mínimo de la sesión con su método embebido (para arqueo y resumen). */
interface PagoDeSesion {
  importe: number;
  venta_id: string;
  metodo_pago_id: string;
  metodo: { codigo: string; nombre: string } | null;
}

/**
 * Carga el agregado completo de una sesión: movimientos + arqueo + resumen de
 * cobros. `efectivo_real` sólo está fijado si la sesión ya se cerró; mientras
 * está abierta el arqueo muestra el teórico y deja el descuadre en null.
 */
export async function cargarCaja(
  sb: SupabaseClient,
  sesion: SesionCaja,
): Promise<CajaCompleta> {
  const [movRes, pagosRes] = await Promise.all([
    sb
      .from('tpv_movimientos_caja')
      .select('*')
      .eq('sesion_caja_id', sesion.id)
      .order('created_at', { ascending: true }),
    sb
      .from('tpv_pagos')
      .select('importe, venta_id, metodo_pago_id, metodo:tpv_metodos_pago(codigo, nombre)')
      .eq('sesion_caja_id', sesion.id)
      .eq('estado', 'completado')
      .order('pagado_at', { ascending: true }),
  ]);

  if (movRes.error) throw mapearErrorPg(movRes.error);
  if (pagosRes.error) throw mapearErrorPg(pagosRes.error);

  const movimientos = (movRes.data ?? []) as MovimientoCaja[];
  const pagos = (pagosRes.data ?? []) as unknown as PagoDeSesion[];

  // Arqueo: el teórico se deriva de los cobros en efectivo + movimientos; el
  // real (y por tanto el descuadre) sólo existe si la sesión ya está cerrada.
  const cobros = pagos.map((p) => ({
    importe: p.importe,
    es_efectivo: p.metodo?.codigo === CODIGO_EFECTIVO,
  }));
  const arqueo = calcularArqueo({
    saldo_inicial: sesion.saldo_inicial,
    cobros,
    movimientos: movimientos.map((m) => ({ tipo: m.tipo, importe: m.importe })),
    efectivo_real: sesion.saldo_final_real,
  });

  const resumen = construirResumen(pagos, cobros);

  return { sesion, movimientos, arqueo, resumen };
}

/** Agrupa los cobros de la sesión por método y separa efectivo del resto. */
function construirResumen(
  pagos: PagoDeSesion[],
  cobros: { importe: number; es_efectivo: boolean }[],
): ResumenCaja {
  const base = resumirCobros(cobros);

  const porMetodo = new Map<string, CobroPorMetodo>();
  const tickets = new Set<string>();
  for (const p of pagos) {
    tickets.add(p.venta_id);
    const previo = porMetodo.get(p.metodo_pago_id) ?? {
      metodo_pago_id: p.metodo_pago_id,
      codigo: p.metodo?.codigo ?? 'desconocido',
      nombre: p.metodo?.nombre ?? 'Método desconocido',
      numero_pagos: 0,
      total: 0,
    };
    previo.numero_pagos += 1;
    previo.total = redondear2(previo.total + (Number(p.importe) || 0));
    porMetodo.set(p.metodo_pago_id, previo);
  }

  return {
    total: base.total,
    efectivo: base.efectivo,
    otros: base.otros,
    numero_cobros: base.numero_cobros,
    numero_tickets: tickets.size,
    por_metodo: [...porMetodo.values()].sort((a, b) => b.total - a.total),
  };
}
