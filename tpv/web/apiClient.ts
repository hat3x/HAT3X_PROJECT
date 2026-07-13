// ============================================================================
// TPV · Cliente de API de cobros (navegador)
// ----------------------------------------------------------------------------
// Envoltura tipada sobre `supabase.functions.invoke` para las Edge Functions
// del TPV. Valida la entrada con los MISMOS esquemas Zod del servidor (fallo
// rápido en cliente) y reconstruye el ErrorTpv tipado a partir del cuerpo de
// error, para que la UI pueda discriminar por `codigo`.
//
// Depende de: @supabase/supabase-js, zod (vía ../shared/schemas).
// ============================================================================

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorTpv, type ErrorTpvSerializado } from '../shared/errors';
import type { FacturaCompleta, TicketCompleto } from '../shared/types';
import {
  actualizarLineasSchema,
  crearTicketSchema,
  emitirFacturaSchema,
  obtenerFacturaSchema,
  obtenerTicketSchema,
  registrarPagoSchema,
  type ActualizarLineasInput,
  type CrearTicketInput,
  type EmitirFacturaInput,
  type ObtenerFacturaInput,
  type ObtenerTicketInput,
  type RegistrarPagoInput,
} from '../shared/schemas';

/** Nombres de las Edge Functions desplegadas. */
export const FUNCIONES = {
  crearTicket: 'tpv-crear-ticket',
  actualizarLineas: 'tpv-actualizar-lineas',
  registrarPago: 'tpv-registrar-pago',
  obtenerTicket: 'tpv-obtener-ticket',
  emitirFactura: 'tpv-emitir-factura',
  obtenerFactura: 'tpv-obtener-factura',
} as const;

/** Valida el input en cliente y lanza ErrorTpv('VALIDACION') si no cumple. */
function validar<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ErrorTpv('VALIDACION', 'Datos de entrada no válidos', r.error.flatten());
  }
  return r.data;
}

/** Invoca una Edge Function y normaliza el error a ErrorTpv. */
async function invocar<T>(
  sb: SupabaseClient,
  nombre: string,
  body: unknown,
): Promise<T> {
  const { data, error } = await sb.functions.invoke<T>(nombre, { body });

  if (error) {
    // supabase-js expone la Response cruda en `context` para errores HTTP.
    const resp = (error as { context?: unknown }).context;
    if (resp instanceof Response) {
      try {
        const cuerpo = (await resp.clone().json()) as Partial<ErrorTpvSerializado>;
        if (cuerpo?.error?.codigo) {
          throw new ErrorTpv(
            cuerpo.error.codigo,
            cuerpo.error.mensaje ?? 'Error de la API',
            cuerpo.error.detalles,
          );
        }
      } catch (e) {
        if (e instanceof ErrorTpv) throw e;
        // cuerpo no-JSON → cae al error genérico de abajo
      }
    }
    throw new ErrorTpv('INTERNO', error.message || 'Error al invocar la función');
  }

  if (data == null) {
    throw new ErrorTpv('INTERNO', 'Respuesta vacía de la función');
  }
  return data;
}

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------

export function crearTicket(
  sb: SupabaseClient,
  input: CrearTicketInput,
): Promise<TicketCompleto> {
  return invocar(sb, FUNCIONES.crearTicket, validar(crearTicketSchema, input));
}

export function actualizarLineas(
  sb: SupabaseClient,
  input: ActualizarLineasInput,
): Promise<TicketCompleto> {
  return invocar(
    sb,
    FUNCIONES.actualizarLineas,
    validar(actualizarLineasSchema, input),
  );
}

export function registrarPago(
  sb: SupabaseClient,
  input: RegistrarPagoInput,
): Promise<TicketCompleto> {
  return invocar(sb, FUNCIONES.registrarPago, validar(registrarPagoSchema, input));
}

export function obtenerTicket(
  sb: SupabaseClient,
  input: ObtenerTicketInput,
): Promise<TicketCompleto> {
  return invocar(sb, FUNCIONES.obtenerTicket, validar(obtenerTicketSchema, input));
}

export function emitirFactura(
  sb: SupabaseClient,
  input: EmitirFacturaInput,
): Promise<FacturaCompleta> {
  return invocar(sb, FUNCIONES.emitirFactura, validar(emitirFacturaSchema, input));
}

export function obtenerFactura(
  sb: SupabaseClient,
  input: ObtenerFacturaInput,
): Promise<FacturaCompleta> {
  return invocar(sb, FUNCIONES.obtenerFactura, validar(obtenerFacturaSchema, input));
}
