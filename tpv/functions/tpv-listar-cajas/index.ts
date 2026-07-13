// ============================================================================
// Edge Function · tpv-listar-cajas
// ----------------------------------------------------------------------------
// Histórico de sesiones de caja de un salón (para la vista de cierres). Devuelve
// cada sesión con su total cobrado y nº de tickets, calculados en una única
// consulta agregada (sin N+1). Filtrable por estado y ventana temporal, ordenado
// por apertura descendente. RLS por salón vía JWT.
//
// POST body → listarSesionesCajaSchema. Respuesta 200 → ResumenSesion[].
// ============================================================================

import { listarSesionesCajaSchema } from '../../shared/schemas.ts';
import { redondear2 } from '../../shared/money.ts';
import {
  exigirMetodo,
  json,
  parsearBody,
  preflight,
  respuestaError,
} from '../_shared/http.ts';
import { clienteUsuario, mapearErrorPg } from '../_shared/supabase.ts';
import type { ResumenSesion, SesionCaja } from '../../shared/types.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    exigirMetodo(req, 'POST');
    const input = await parsearBody(req, listarSesionesCajaSchema);
    const sb = clienteUsuario(req);

    // 1. Sesiones del salón (filtros opcionales), más recientes primero.
    let q = sb
      .from('tpv_sesiones_caja')
      .select('*')
      .eq('salon_id', input.salon_id)
      .order('abierta_at', { ascending: false })
      .limit(input.limite);
    if (input.estado) q = q.eq('estado', input.estado);
    if (input.desde) q = q.gte('abierta_at', input.desde);
    if (input.hasta) q = q.lte('abierta_at', input.hasta);

    const { data: sesionesData, error } = await q;
    if (error) throw mapearErrorPg(error);
    const sesiones = (sesionesData ?? []) as SesionCaja[];
    if (sesiones.length === 0) return json([], 200);

    // 2. Agregar los cobros completados de todas esas sesiones de una vez.
    const ids = sesiones.map((s) => s.id);
    const pagosRes = await sb
      .from('tpv_pagos')
      .select('sesion_caja_id, importe, venta_id')
      .in('sesion_caja_id', ids)
      .eq('estado', 'completado');
    if (pagosRes.error) throw mapearErrorPg(pagosRes.error);

    const totales = new Map<string, number>();
    const tickets = new Map<string, Set<string>>();
    for (const p of pagosRes.data ?? []) {
      const sid = p.sesion_caja_id as string;
      totales.set(sid, redondear2((totales.get(sid) ?? 0) + (Number(p.importe) || 0)));
      let set = tickets.get(sid);
      if (!set) {
        set = new Set<string>();
        tickets.set(sid, set);
      }
      set.add(p.venta_id as string);
    }

    const filas: ResumenSesion[] = sesiones.map((sesion) => ({
      sesion,
      total_cobrado: totales.get(sesion.id) ?? 0,
      numero_tickets: tickets.get(sesion.id)?.size ?? 0,
    }));

    return json(filas, 200);
  } catch (e) {
    return respuestaError(e);
  }
});
