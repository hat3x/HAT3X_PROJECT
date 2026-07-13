// ============================================================================
// TPV · Catálogo de errores de dominio
// ----------------------------------------------------------------------------
// Errores tipados con código estable y estado HTTP asociado. Compartidos entre
// las Edge Functions (que los serializan a la respuesta) y la capa web (que los
// puede discriminar por `codigo` para mostrar mensajes al usuario).
// ============================================================================

/** Códigos de error estables del dominio TPV (no traducir: son identificadores). */
export type CodigoErrorTpv =
  | 'VALIDACION'            // el cuerpo no cumple el esquema Zod
  | 'NO_AUTENTICADO'       // falta/!válido el token de usuario
  | 'PROHIBIDO'            // RLS / salón no permitido para el usuario
  | 'NO_ENCONTRADO'        // ticket / recurso inexistente
  | 'TICKET_NO_ABIERTO'    // se intenta modificar un ticket ya pagado/anulado
  | 'SIN_LINEAS'           // no se puede cobrar/facturar un ticket vacío
  | 'METODO_PAGO_INVALIDO' // método de pago inexistente/inactivo/de otro salón
  | 'SOBREPAGO'            // el importe cobrado supera el total del ticket
  | 'PAGO_INSUFICIENTE'    // se pide marcar pagada sin cubrir el total
  | 'CONFLICTO'            // violación de invariante/constraint de BD
  | 'METODO_NO_PERMITIDO'  // verbo HTTP no soportado por la función
  | 'INTERNO';             // fallo inesperado

/** Mapa código → estado HTTP por defecto. */
export const HTTP_POR_CODIGO: Record<CodigoErrorTpv, number> = {
  VALIDACION: 422,
  NO_AUTENTICADO: 401,
  PROHIBIDO: 403,
  NO_ENCONTRADO: 404,
  TICKET_NO_ABIERTO: 409,
  SIN_LINEAS: 422,
  METODO_PAGO_INVALIDO: 422,
  SOBREPAGO: 409,
  PAGO_INSUFICIENTE: 409,
  CONFLICTO: 409,
  METODO_NO_PERMITIDO: 405,
  INTERNO: 500,
};

/** Forma serializada de un error TPV en el cuerpo de la respuesta. */
export interface ErrorTpvSerializado {
  error: {
    codigo: CodigoErrorTpv;
    mensaje: string;
    /** Detalles opcionales (p.ej. errores de campo de Zod). */
    detalles?: unknown;
  };
}

/** Error de dominio TPV con código y estado HTTP. */
export class ErrorTpv extends Error {
  readonly codigo: CodigoErrorTpv;
  readonly status: number;
  readonly detalles?: unknown;

  constructor(codigo: CodigoErrorTpv, mensaje: string, detalles?: unknown) {
    super(mensaje);
    this.name = 'ErrorTpv';
    this.codigo = codigo;
    this.status = HTTP_POR_CODIGO[codigo];
    this.detalles = detalles;
  }

  toJSON(): ErrorTpvSerializado {
    return {
      error: {
        codigo: this.codigo,
        mensaje: this.message,
        ...(this.detalles !== undefined ? { detalles: this.detalles } : {}),
      },
    };
  }
}

/** Type-guard para reconocer un ErrorTpv (incluye instancias cross-realm). */
export function esErrorTpv(e: unknown): e is ErrorTpv {
  return (
    e instanceof ErrorTpv ||
    (typeof e === 'object' &&
      e !== null &&
      'codigo' in e &&
      'status' in e &&
      (e as { name?: unknown }).name === 'ErrorTpv')
  );
}
