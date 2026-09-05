// ============================================================================
// TPV · Cliente Supabase con la identidad del usuario (RLS activa)
// ----------------------------------------------------------------------------
// IMPORTANTE (seguridad): estas funciones de cobro operan con el JWT del
// usuario reenviado (rol `authenticated`), NO con service_role. Así el
// aislamiento por salón definido en 20260713000002_tpv_rls.up.sql se aplica de
// extremo a extremo: un usuario sólo puede tocar tickets de sus salones.
// El servidor sigue siendo autoritativo del CÁLCULO (money.ts), pero la
// AUTORIZACIÓN la garantiza la RLS de Postgres.
// ============================================================================

import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { ErrorTpv } from '../../shared/errors.ts';

/** Crea un cliente Supabase que reenvía el JWT del llamante (RLS `authenticated`). */
export function clienteUsuario(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    throw new ErrorTpv(
      'NO_AUTENTICADO',
      'Falta la cabecera Authorization (Bearer <token>)',
    );
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) {
    throw new ErrorTpv(
      'INTERNO',
      'Configuración de Supabase ausente (SUPABASE_URL / SUPABASE_ANON_KEY)',
    );
  }

  return createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Traduce un error de PostgREST/Postgres a un ErrorTpv de dominio.
 *  · 23505 → conflicto de unicidad (p.ej. ticket ya facturado).
 *  · 23503 → FK inválida (método/salón inexistente).
 *  · 42501 → RLS/permiso denegado → salón no permitido para el usuario.
 *  · PGRST116 → fila no encontrada (o invisible por RLS).
 */
export function mapearErrorPg(error: PostgrestError): ErrorTpv {
  switch (error.code) {
    case '23505':
      return new ErrorTpv('CONFLICTO', 'Conflicto de unicidad', error.message);
    case '23503':
      return new ErrorTpv(
        'CONFLICTO',
        'Referencia inválida a otra entidad',
        error.message,
      );
    case '42501':
      return new ErrorTpv(
        'PROHIBIDO',
        'Sin permiso sobre este salón (aislamiento RLS)',
        error.message,
      );
    case 'PGRST116':
      return new ErrorTpv('NO_ENCONTRADO', 'Recurso no encontrado');
    default:
      return new ErrorTpv('INTERNO', 'Error de base de datos', {
        code: error.code,
        message: error.message,
      });
  }
}

export type { PostgrestError, SupabaseClient };
