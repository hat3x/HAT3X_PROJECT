/**
 * Contrato de errores de RECEPCIÓN — códigos estables + mensajes legibles.
 *
 * Módulo COMPARTIDO por todos los endpoints de `/api/reception` (front-desk:
 * consultar disponibilidad, crear/mover/cancelar citas del propio cliente…). Su
 * misión es que TODOS esos endpoints hablen el MISMO idioma de errores:
 *
 *   1. Un `code` ESTABLE en MAYÚSCULAS_SNAKE que el cliente puede ramificar sin
 *      leer el texto (p. ej. distinguir `NO_AVAILABILITY` de `SLOT_TAKEN` aunque
 *      ambos sean 409). El código es parte del CONTRATO: no se renombra a la
 *      ligera (rompería a los consumidores). El texto SÍ puede reescribirse.
 *   2. Un `message` LEGIBLE en español, apto para mostrar tal cual al usuario de
 *      mostrador. Nunca filtra detalles internos (SQL, stack, ids de sistema).
 *   3. Un `status` HTTP semántico, resuelto en UN ÚNICO sitio ({@link RECEPTION_ERROR_CATALOG})
 *      para que no diverja entre endpoints.
 *
 * ── ¿Por qué MAYÚSCULAS y no el `snake_case` de `CustomerAccountError`? ────────
 * Los errores de dominio internos (`BookingError`, `CustomerAccountError`,
 * `LoyaltyActionError`) usan `code` en minúsculas y HOY solo emiten `{ error:
 * "texto" }` — el código NO viaja al cliente. El contrato de `/api/reception` es
 * NUEVO y SÍ expone el código en el JSON, así que adopta la convención pública
 * MAYÚSCULAS_SNAKE (la que pide la tarea) para que sea inconfundiblemente una
 * clave de máquina y no una cadena traducible.
 *
 * Este fichero es PURO: no importa `next/server`, así que es 100 % testeable sin
 * el runtime de Next. La capa que envuelve estos errores en `NextResponse` vive
 * en `@/lib/reception/http` (y solo eso importa `next/server`).
 */

// -----------------------------------------------------------------------------
// Códigos estables
// -----------------------------------------------------------------------------

/**
 * Códigos de DOMINIO del contrato de recepción — los seis exigidos por la tarea.
 * Son los que un endpoint lanza a propósito ante una regla de negocio concreta.
 */
export const RECEPTION_DOMAIN_CODES = [
  "NO_AVAILABILITY",
  "SLOT_TAKEN",
  "APPOINTMENT_NOT_FOUND",
  "NOT_YOUR_APPOINTMENT",
  "FEATURE_NOT_ENABLED",
  "UNAUTHORIZED",
] as const;

/**
 * Códigos de TRANSPORTE, comunes a cualquier endpoint JSON. No modelan una regla
 * de negocio de recepción, pero el helper los necesita para cerrar el contrato:
 *   · `VALIDATION_ERROR` — el cuerpo/params no pasan el esquema (Zod, JSON roto).
 *   · `INTERNAL_ERROR`   — cualquier fallo inesperado; NUNCA expone el detalle.
 * Se mantienen aparte de los de dominio para que el conjunto «de negocio» sea
 * inequívoco, pero comparten la misma forma de respuesta.
 */
export const RECEPTION_TRANSPORT_CODES = [
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
] as const;

/** Todos los códigos estables del contrato (dominio + transporte). */
export const RECEPTION_ERROR_CODES = [
  ...RECEPTION_DOMAIN_CODES,
  ...RECEPTION_TRANSPORT_CODES,
] as const;

/** Unión de los códigos estables. Es lo que viaja en `error.code` del JSON. */
export type ReceptionErrorCode = (typeof RECEPTION_ERROR_CODES)[number];

// -----------------------------------------------------------------------------
// Catálogo: código → { status HTTP, mensaje legible }
// -----------------------------------------------------------------------------

/** Metadatos de un código: su estado HTTP y su copy por defecto. */
interface ReceptionErrorSpec {
  /** Estado HTTP semántico con el que se traduce en el borde. */
  readonly status: number;
  /** Mensaje por defecto, legible y apto para mostrar al usuario. */
  readonly message: string;
}

/**
 * ÚNICA fuente de verdad `código → {status, message}`. Cualquier endpoint que
 * quiera cambiar el estado o el copy de un error lo toca AQUÍ y se propaga a
 * todos. `NO_AVAILABILITY` y `SLOT_TAKEN` comparten 409 a propósito: son dos
 * conflictos de agenda DISTINTOS y el código estable es lo que los separa.
 */
export const RECEPTION_ERROR_CATALOG: Readonly<
  Record<ReceptionErrorCode, ReceptionErrorSpec>
> = Object.freeze({
  // ── Dominio ────────────────────────────────────────────────────────────────
  NO_AVAILABILITY: {
    status: 409,
    message:
      "No hay horarios disponibles para lo que pides. Prueba con otra fecha, profesional o servicio.",
  },
  SLOT_TAKEN: {
    status: 409,
    message: "Ese horario acaba de ocuparse. Elige otro.",
  },
  APPOINTMENT_NOT_FOUND: {
    status: 404,
    message: "No encontramos esa cita. Puede que se haya cancelado o ya no exista.",
  },
  NOT_YOUR_APPOINTMENT: {
    status: 403,
    message: "Esta cita no pertenece a tu cuenta.",
  },
  FEATURE_NOT_ENABLED: {
    status: 403,
    message: "Esta función no está disponible en este salón.",
  },
  UNAUTHORIZED: {
    status: 401,
    message: "No autorizado. Inicia sesión para continuar.",
  },
  // ── Transporte ───────────────────────────────────────────────────────────────
  VALIDATION_ERROR: {
    status: 400,
    message: "Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.",
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.",
  },
});

/** El estado HTTP canónico de un código estable. */
export function receptionErrorStatus(code: ReceptionErrorCode): number {
  return RECEPTION_ERROR_CATALOG[code].status;
}

/** El mensaje por defecto de un código estable. */
export function receptionErrorMessage(code: ReceptionErrorCode): string {
  return RECEPTION_ERROR_CATALOG[code].message;
}

/** ¿Es `value` uno de los códigos estables del contrato? (type guard) */
export function isReceptionErrorCode(value: unknown): value is ReceptionErrorCode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RECEPTION_ERROR_CATALOG, value)
  );
}

// -----------------------------------------------------------------------------
// Forma del cuerpo JSON
// -----------------------------------------------------------------------------

/**
 * Detalle a nivel de campo, para acompañar a `VALIDATION_ERROR`. Espeja la forma
 * recomendada por la skill de diseño de API (`field` + `message` + `code`), lista
 * para alimentarse de `zodError.issues`.
 */
export interface ReceptionFieldError {
  /** Ruta del campo con notación de punto, p. ej. `"customer.phone"`. */
  field: string;
  /** Explicación legible del problema de ese campo. */
  message: string;
  /** Código del validador (p. ej. el `code` de Zod), opcional. */
  code?: string;
}

/** Objeto de error del contrato. Es lo que anida bajo la clave `error`. */
export interface ReceptionErrorObject {
  code: ReceptionErrorCode;
  message: string;
  details?: ReceptionFieldError[];
}

/**
 * Envoltorio JSON completo de un error de recepción. TODO endpoint que falle
 * responde EXACTAMENTE con esta forma:
 * `{ "error": { "code": "SLOT_TAKEN", "message": "…", "details"?: [...] } }`.
 */
export interface ReceptionErrorBody {
  error: ReceptionErrorObject;
}

// -----------------------------------------------------------------------------
// Error de dominio
// -----------------------------------------------------------------------------

/** Opciones de {@link ReceptionError}: sobrescribir copy, adjuntar detalles/causa. */
export interface ReceptionErrorOptions {
  /** Sustituye al mensaje por defecto del catálogo (mismo idioma y tono). */
  message?: string;
  /** Detalles de validación por campo (solo tiene sentido en `VALIDATION_ERROR`). */
  details?: ReceptionFieldError[];
  /** Error subyacente, para trazas de servidor. NUNCA se serializa al cliente. */
  cause?: unknown;
}

/**
 * Error de dominio de recepción con `code` estable y `status` HTTP DERIVADO del
 * catálogo (a diferencia de `BookingError`/`CustomerAccountError`, que reciben el
 * status por parámetro: aquí no puede divergir porque hay una sola fuente de
 * verdad). Un Route Handler lo captura y lo traduce con `@/lib/reception/http`.
 *
 * Uso típico en un endpoint:
 * ```ts
 * if (!slot) throw ReceptionError.slotTaken();
 * throw new ReceptionError("FEATURE_NOT_ENABLED");
 * ```
 */
export class ReceptionError extends Error {
  /** Código estable del contrato (viaja al cliente). */
  public readonly code: ReceptionErrorCode;
  /** Estado HTTP asociado, tomado del catálogo. */
  public readonly status: number;
  /** Detalles por campo (solo se rellena en errores de validación). */
  public readonly details?: ReceptionFieldError[];

  constructor(code: ReceptionErrorCode, options: ReceptionErrorOptions = {}) {
    const message = options.message ?? RECEPTION_ERROR_CATALOG[code].message;
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ReceptionError";
    this.code = code;
    this.status = RECEPTION_ERROR_CATALOG[code].status;
    if (options.details !== undefined) this.details = options.details;
  }

  /** Serializa a la forma del contrato (sin `NextResponse`, útil en tests/actions). */
  toBody(): ReceptionErrorBody {
    return toReceptionErrorBody(this);
  }

  // ── Fábricas ergonómicas (una por código; el endpoint se lee como prosa) ──────

  /** 401 — sin sesión o credenciales no válidas. */
  static unauthorized(message?: string): ReceptionError {
    return new ReceptionError("UNAUTHORIZED", { message });
  }

  /** 403 — la cita existe pero no es de la cuenta autenticada. */
  static notYourAppointment(message?: string): ReceptionError {
    return new ReceptionError("NOT_YOUR_APPOINTMENT", { message });
  }

  /** 403 — el salón no tiene contratado/activo el add-on que pide el endpoint. */
  static featureNotEnabled(message?: string): ReceptionError {
    return new ReceptionError("FEATURE_NOT_ENABLED", { message });
  }

  /** 404 — no hay cita con ese id (o ya no es accesible). */
  static appointmentNotFound(message?: string): ReceptionError {
    return new ReceptionError("APPOINTMENT_NOT_FOUND", { message });
  }

  /** 409 — no quedan huecos para la fecha/profesional/servicio pedidos. */
  static noAvailability(message?: string): ReceptionError {
    return new ReceptionError("NO_AVAILABILITY", { message });
  }

  /** 409 — el hueco concreto acaba de ocuparlo otra reserva (carrera). */
  static slotTaken(message?: string): ReceptionError {
    return new ReceptionError("SLOT_TAKEN", { message });
  }

  /** 400 — el cuerpo/params no superan la validación; adjunta `details` por campo. */
  static validation(details?: ReceptionFieldError[], message?: string): ReceptionError {
    return new ReceptionError("VALIDATION_ERROR", { details, message });
  }

  /** 500 — fallo inesperado; `cause` se guarda para el log, jamás para el cliente. */
  static internal(cause?: unknown, message?: string): ReceptionError {
    return new ReceptionError("INTERNAL_ERROR", { cause, message });
  }
}

// -----------------------------------------------------------------------------
// Constructores del cuerpo (puros)
// -----------------------------------------------------------------------------

/** Construye el `{ error: {...} }` de un {@link ReceptionError}. */
export function toReceptionErrorBody(error: ReceptionError): ReceptionErrorBody {
  const object: ReceptionErrorObject = { code: error.code, message: error.message };
  if (error.details !== undefined && error.details.length > 0) {
    object.details = error.details;
  }
  return { error: object };
}

/**
 * Normaliza CUALQUIER valor lanzado a un {@link ReceptionError}:
 *   · si ya es un `ReceptionError`, se devuelve tal cual;
 *   · si es cualquier otra cosa (Error de Postgrest, string, undefined…), se
 *     colapsa a `INTERNAL_ERROR` conservando la causa para el log, PERO sin
 *     exponerla nunca en la respuesta.
 * Es el punto único donde «lo inesperado» se convierte en «500 legible».
 */
export function normalizeReceptionError(thrown: unknown): ReceptionError {
  if (thrown instanceof ReceptionError) return thrown;
  return ReceptionError.internal(thrown);
}

/** Traduce las `issues` de un ZodError a los `details` del contrato. */
export function receptionFieldErrorsFromZod(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string; code?: string }>,
): ReceptionFieldError[] {
  return issues.map((issue) => {
    const detail: ReceptionFieldError = {
      field: issue.path.map(String).join("."),
      message: issue.message,
    };
    if (issue.code !== undefined) detail.code = issue.code;
    return detail;
  });
}
