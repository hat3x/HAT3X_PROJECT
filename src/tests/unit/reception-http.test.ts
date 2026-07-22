/**
 * Helpers de respuesta JSON de RECEPCIÓN (`@/lib/reception/http`).
 *
 * Comprueba que los helpers de `NextResponse` materializan el contrato de forma
 * UNIFORME: éxito con payload directo y `no-store`; error con el cuerpo
 * `{ error: { code, message, details? } }`, el `status` del catálogo y `no-store`;
 * y —red de seguridad— que un `Error` cualquiera sale como 500 `INTERNAL_ERROR`
 * SIN filtrar el detalle interno al cliente.
 */
import { describe, it, expect } from "vitest";

import { ReceptionError, receptionErrorMessage } from "@/lib/reception/errors";
import {
  receptionCreated,
  receptionErrorResponse,
  receptionJson,
  receptionNoContent,
} from "@/lib/reception/http";

describe("receptionJson (éxito)", () => {
  it("responde 200 con el payload directo y `no-store`", async () => {
    const res = receptionJson({ ok: true, count: 3 });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ ok: true, count: 3 });
  });

  it("respeta un status explícito y fusiona cabeceras extra con `no-store`", async () => {
    const res = receptionJson({ ok: true }, { status: 202, headers: { "X-Trace": "abc" } });
    expect(res.status).toBe(202);
    expect(res.headers.get("x-trace")).toBe("abc");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("receptionCreated / receptionNoContent", () => {
  it("crea con 201 y cabecera Location", async () => {
    const res = receptionCreated({ id: "apt_1" }, "/api/reception/appointments/apt_1");
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/api/reception/appointments/apt_1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ id: "apt_1" });
  });

  it("responde 204 sin cuerpo", async () => {
    const res = receptionNoContent();
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.text()).resolves.toBe("");
  });
});

describe("receptionErrorResponse", () => {
  it("acepta un código estable y emite el contrato con su status", async () => {
    const res = receptionErrorResponse("SLOT_TAKEN");
    expect(res.status).toBe(409);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({
      error: { code: "SLOT_TAKEN", message: receptionErrorMessage("SLOT_TAKEN") },
    });
  });

  it("acepta un ReceptionError ya construido", async () => {
    const res = receptionErrorResponse(ReceptionError.appointmentNotFound());
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "APPOINTMENT_NOT_FOUND" },
    });
  });

  it("adjunta los `details` de validación (400)", async () => {
    const res = receptionErrorResponse(
      ReceptionError.validation([{ field: "phone", message: "Teléfono no válido" }]),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; details?: { field: string }[] };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([{ field: "phone", message: "Teléfono no válido" }]);
  });

  it("colapsa un Error inesperado a 500 sin filtrar el detalle interno", async () => {
    const res = receptionErrorResponse(new Error("postgres: relation appointments 42P01"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe(receptionErrorMessage("INTERNAL_ERROR"));
    expect(JSON.stringify(body)).not.toContain("42P01");
  });

  it("permite construir el error desde código + mensaje sobrescrito", async () => {
    const res = receptionErrorResponse("NOT_YOUR_APPOINTMENT", {
      message: "Esta cita es de otra persona.",
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: { code: "NOT_YOUR_APPOINTMENT", message: "Esta cita es de otra persona." },
    });
  });
});
