/**
 * Contrato de errores de RECEPCIÓN — parte PURA (`@/lib/reception/errors`).
 *
 * Blinda que los seis códigos ESTABLES exigidos existan con su estado HTTP y su
 * mensaje legible, que el error de dominio derive el `status` de la ÚNICA fuente
 * de verdad (el catálogo, no un parámetro), que el cuerpo JSON tenga SIEMPRE la
 * forma `{ error: { code, message, details? } }`, y —clave de seguridad— que un
 * fallo inesperado se colapse a `INTERNAL_ERROR` (500) SIN filtrar la causa.
 *
 * No toca `next/server`: es lógica pura, así que corre sin el runtime de Next.
 */
import { describe, it, expect } from "vitest";

import {
  isReceptionErrorCode,
  normalizeReceptionError,
  RECEPTION_DOMAIN_CODES,
  RECEPTION_ERROR_CATALOG,
  RECEPTION_ERROR_CODES,
  RECEPTION_TRANSPORT_CODES,
  ReceptionError,
  receptionErrorMessage,
  receptionErrorStatus,
  receptionFieldErrorsFromZod,
  toReceptionErrorBody,
  type ReceptionErrorCode,
} from "@/lib/reception/errors";

describe("catálogo de códigos estables", () => {
  it("incluye EXACTAMENTE los seis códigos de dominio exigidos", () => {
    expect([...RECEPTION_DOMAIN_CODES]).toEqual([
      "NO_AVAILABILITY",
      "SLOT_TAKEN",
      "APPOINTMENT_NOT_FOUND",
      "NOT_YOUR_APPOINTMENT",
      "FEATURE_NOT_ENABLED",
      "UNAUTHORIZED",
    ]);
  });

  it("mapea cada código a su estado HTTP semántico", () => {
    const expected: Record<ReceptionErrorCode, number> = {
      NO_AVAILABILITY: 409,
      SLOT_TAKEN: 409,
      APPOINTMENT_NOT_FOUND: 404,
      NOT_YOUR_APPOINTMENT: 403,
      FEATURE_NOT_ENABLED: 403,
      UNAUTHORIZED: 401,
      VALIDATION_ERROR: 400,
      INTERNAL_ERROR: 500,
    };
    for (const code of RECEPTION_ERROR_CODES) {
      expect(receptionErrorStatus(code)).toBe(expected[code]);
    }
  });

  it("`NO_AVAILABILITY` y `SLOT_TAKEN` comparten 409 pero son códigos distintos", () => {
    expect(receptionErrorStatus("NO_AVAILABILITY")).toBe(409);
    expect(receptionErrorStatus("SLOT_TAKEN")).toBe(409);
    expect(receptionErrorMessage("NO_AVAILABILITY")).not.toBe(
      receptionErrorMessage("SLOT_TAKEN"),
    );
  });

  it("todo código tiene un mensaje legible no vacío", () => {
    for (const code of RECEPTION_ERROR_CODES) {
      const message = receptionErrorMessage(code);
      expect(typeof message).toBe("string");
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });

  it("el catálogo está congelado (contrato inmutable en runtime)", () => {
    expect(Object.isFrozen(RECEPTION_ERROR_CATALOG)).toBe(true);
  });

  it("separa dominio y transporte sin solapes y cubre todo el contrato", () => {
    expect([...RECEPTION_TRANSPORT_CODES]).toEqual(["VALIDATION_ERROR", "INTERNAL_ERROR"]);
    const union = new Set([...RECEPTION_DOMAIN_CODES, ...RECEPTION_TRANSPORT_CODES]);
    expect(union.size).toBe(RECEPTION_ERROR_CODES.length);
    expect(Object.keys(RECEPTION_ERROR_CATALOG).sort()).toEqual(
      [...RECEPTION_ERROR_CODES].sort(),
    );
  });
});

describe("isReceptionErrorCode", () => {
  it("acepta los códigos estables", () => {
    for (const code of RECEPTION_ERROR_CODES) {
      expect(isReceptionErrorCode(code)).toBe(true);
    }
  });

  it("rechaza cadenas ajenas, minúsculas, no-cadenas y prototipos", () => {
    expect(isReceptionErrorCode("slot_taken")).toBe(false); // minúscula ≠ contrato
    expect(isReceptionErrorCode("NOPE")).toBe(false);
    expect(isReceptionErrorCode("")).toBe(false);
    expect(isReceptionErrorCode(409)).toBe(false);
    expect(isReceptionErrorCode(null)).toBe(false);
    expect(isReceptionErrorCode(undefined)).toBe(false);
    expect(isReceptionErrorCode("toString")).toBe(false); // no confundir con props heredadas
  });
});

describe("ReceptionError", () => {
  it("deriva status y mensaje del catálogo por defecto", () => {
    const error = new ReceptionError("SLOT_TAKEN");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ReceptionError");
    expect(error.code).toBe("SLOT_TAKEN");
    expect(error.status).toBe(409);
    expect(error.message).toBe(receptionErrorMessage("SLOT_TAKEN"));
    expect(error.details).toBeUndefined();
  });

  it("permite sobrescribir el mensaje conservando código y status", () => {
    const error = new ReceptionError("APPOINTMENT_NOT_FOUND", {
      message: "La cita #42 no existe.",
    });
    expect(error.message).toBe("La cita #42 no existe.");
    expect(error.code).toBe("APPOINTMENT_NOT_FOUND");
    expect(error.status).toBe(404);
  });

  it("guarda la causa para el log sin exponerla en el mensaje", () => {
    const cause = new Error("postgres: duplicate key 23505");
    const error = new ReceptionError("INTERNAL_ERROR", { cause });
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain("23505");
  });

  it("las fábricas producen el código y status correctos", () => {
    expect(ReceptionError.unauthorized().status).toBe(401);
    expect(ReceptionError.notYourAppointment().code).toBe("NOT_YOUR_APPOINTMENT");
    expect(ReceptionError.featureNotEnabled().status).toBe(403);
    expect(ReceptionError.appointmentNotFound().status).toBe(404);
    expect(ReceptionError.noAvailability().code).toBe("NO_AVAILABILITY");
    expect(ReceptionError.slotTaken().status).toBe(409);
    expect(ReceptionError.internal().status).toBe(500);
  });

  it("la fábrica de validación adjunta los detalles por campo", () => {
    const details = [{ field: "phone", message: "Teléfono no válido", code: "custom" }];
    const error = ReceptionError.validation(details);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.status).toBe(400);
    expect(error.details).toEqual(details);
  });
});

describe("toReceptionErrorBody", () => {
  it("produce la forma del contrato `{ error: { code, message } }`", () => {
    const body = toReceptionErrorBody(new ReceptionError("UNAUTHORIZED"));
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: receptionErrorMessage("UNAUTHORIZED"),
      },
    });
  });

  it("omite `details` cuando no hay o está vacío", () => {
    expect(toReceptionErrorBody(new ReceptionError("SLOT_TAKEN")).error.details).toBeUndefined();
    expect(
      toReceptionErrorBody(ReceptionError.validation([])).error.details,
    ).toBeUndefined();
  });

  it("incluye `details` cuando hay errores de campo", () => {
    const details = [{ field: "date", message: "Fecha requerida" }];
    const body = ReceptionError.validation(details).toBody();
    expect(body.error.details).toEqual(details);
  });
});

describe("normalizeReceptionError", () => {
  it("devuelve el mismo ReceptionError sin envolverlo", () => {
    const original = ReceptionError.slotTaken();
    expect(normalizeReceptionError(original)).toBe(original);
  });

  it("colapsa cualquier valor ajeno a INTERNAL_ERROR conservando la causa", () => {
    const raw = new Error("stack interno con detalles sensibles");
    const normalized = normalizeReceptionError(raw);
    expect(normalized.code).toBe("INTERNAL_ERROR");
    expect(normalized.status).toBe(500);
    expect(normalized.cause).toBe(raw);
    // El mensaje al cliente es el genérico del catálogo, NO el del error interno.
    expect(normalized.message).toBe(receptionErrorMessage("INTERNAL_ERROR"));
    expect(normalized.message).not.toContain("sensibles");
  });

  it("normaliza también valores no-Error (string, undefined)", () => {
    expect(normalizeReceptionError("boom").code).toBe("INTERNAL_ERROR");
    expect(normalizeReceptionError(undefined).code).toBe("INTERNAL_ERROR");
  });
});

describe("receptionFieldErrorsFromZod", () => {
  it("aplana la ruta a notación de punto y arrastra message y code", () => {
    const issues = [
      { path: ["customer", "phone"], message: "Teléfono no válido", code: "custom" },
      { path: ["date"], message: "Requerido" },
    ];
    expect(receptionFieldErrorsFromZod(issues)).toEqual([
      { field: "customer.phone", message: "Teléfono no válido", code: "custom" },
      { field: "date", message: "Requerido" },
    ]);
  });

  it("usa cadena vacía para issues sin ruta (error de raíz)", () => {
    const details = receptionFieldErrorsFromZod([{ path: [], message: "JSON no válido" }]);
    expect(details).toHaveLength(1);
    expect(details[0]?.field).toBe("");
  });
});
