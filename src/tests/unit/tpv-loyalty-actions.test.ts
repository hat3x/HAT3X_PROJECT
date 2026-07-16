/**
 * Tests del wrapper Server Action `lookupLoyaltyByQr` (`app/(dashboard)/tpv/actions`).
 *
 * La lógica de fidelización de servidor (RLS, aislamiento multi-tenant, lectura de
 * cuenta/cupones/recompensas) ya se cubre en `integration/loyalty-server.test.ts`
 * contra una BD en memoria. Aquí se aísla la ÚNICA responsabilidad del wrapper del
 * TPV: traducir el desenlace de `lookupByQr` a un resultado CONTROLADO, sin lanzar
 * nunca, para "no romper el TPV" (sub-1).
 *
 * Se mockea por completo `@/lib/loyalty/server` (stub de `lookupByQr` + clase de
 * error propia) para no arrastrar Supabase ni `node:crypto`: el wrapper importa
 * `LoyaltyActionError` y `lookupByQr` del mismo módulo mockeado, así que el
 * `instanceof` del wrapper y el de estos tests son la MISMA clase.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// `revalidatePath` no se usa en el lookup (solo lectura), pero el módulo de
// acciones lo importa: se neutraliza para no depender del runtime de Next.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/loyalty/server", () => {
  class LoyaltyActionError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "LoyaltyActionError";
    }
  }
  return { LoyaltyActionError, lookupByQr: vi.fn() };
});

import { lookupLoyaltyByQr } from "@/app/(dashboard)/tpv/actions";
import { lookupByQr, LoyaltyActionError } from "@/lib/loyalty/server";
import type { LoyaltyLookupResult } from "@/lib/loyalty/types";

const mockedLookup = vi.mocked(lookupByQr);

const SAMPLE_STATE: LoyaltyLookupResult = {
  customer: { id: "cust-1", full_name: "Ana", qr_token: "QR-ANA" },
  points_balance: 42,
  visits_total: 3,
  last_visit_at: null,
  welcome_coupons: [],
  rewards: [],
};

beforeEach(() => {
  mockedLookup.mockReset();
});

describe("lookupLoyaltyByQr — traducción a resultado controlado", () => {
  it("devuelve { ok: true, data } cuando el QR resuelve un cliente", async () => {
    mockedLookup.mockResolvedValue(SAMPLE_STATE);

    const result = await lookupLoyaltyByQr("QR-ANA");

    expect(result).toEqual({ ok: true, data: SAMPLE_STATE });
    expect(mockedLookup).toHaveBeenCalledWith("QR-ANA");
  });

  it("traduce not_found(404) a un resultado controlado 'Cliente no encontrado' (no lanza)", async () => {
    mockedLookup.mockRejectedValue(
      new LoyaltyActionError("not_found", 404, "QR de fidelización no encontrado."),
    );

    const result = await lookupLoyaltyByQr("QR-DESCONOCIDO");

    expect(result).toEqual({
      ok: false,
      code: "not_found",
      error: "Cliente no encontrado",
    });
  });

  it("propaga el resto de LoyaltyActionError con su código y su mensaje de dominio", async () => {
    mockedLookup.mockRejectedValue(
      new LoyaltyActionError("unauthorized", 401, "No autorizado."),
    );

    const result = await lookupLoyaltyByQr("QR-ANA");

    expect(result).toEqual({
      ok: false,
      code: "unauthorized",
      error: "No autorizado.",
    });
  });

  it("degrada un error inesperado (no de dominio) a un 'internal' controlado", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedLookup.mockRejectedValue(new Error("boom de red"));

    const result = await lookupLoyaltyByQr("QR-ANA");

    expect(result).toEqual({
      ok: false,
      code: "internal",
      error: "No se pudo consultar la fidelización.",
    });
    spy.mockRestore();
  });

  it("no vuelca el qrToken (dato sensible) en el log del error inesperado", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedLookup.mockRejectedValue(new Error("boom"));

    await lookupLoyaltyByQr("QR-SECRETO-123");

    // El token escaneado no debe aparecer en NINGÚN argumento del log.
    for (const call of spy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain("QR-SECRETO-123");
      }
    }
    spy.mockRestore();
  });
});
