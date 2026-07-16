/**
 * Tests de los Route Handlers de fidelización (`POST /api/loyalty/*`).
 *
 * Verifican las propiedades de SEGURIDAD del proxy, con `@/lib/salon` y las
 * llamadas de red de `@/lib/loyalty` mockeadas (se conserva el `LoyaltyError`
 * real para que el mapeo de errores funcione):
 *   · Kill-switch: `isLoyaltyEnabled()` false → 503 { enabled: false }.
 *   · AuthN: sin sesión → 401, y NUNCA se toca el upstream.
 *   · Validación del cuerpo → 400.
 *   · Propagación controlada de 401/403/404.
 *   · NO-LEAK: ni la API key ni el cuerpo/mensaje internos del upstream llegan
 *     al navegador ni a los logs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { membershipMock, isEnabledMock, lookupMock, verifyMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  isEnabledMock: vi.fn(),
  lookupMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock("@/lib/salon", () => ({
  getActiveMembership: membershipMock,
}));

vi.mock("@/lib/loyalty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/loyalty")>();
  return {
    ...actual, // conserva LoyaltyError / isLoyaltyError reales
    isLoyaltyEnabled: isEnabledMock,
    loyaltyLookup: lookupMock,
    verifyVisit: verifyMock,
  };
});

import { POST as lookupPOST } from "@/app/api/loyalty/lookup/route";
import { POST as verifyPOST } from "@/app/api/loyalty/verify-visit/route";
import { LoyaltyError } from "@/lib/loyalty";

/** Clave SINTÉTICA para comprobar que nunca se filtra (no es real). */
const FAKE_KEY = "dn9_FAKE_secret_key_do_not_leak_0000";
const MEMBERSHIP = { salonId: "salon-1", role: "staff" as const };

/** Construye un `Request` POST con cuerpo JSON. */
function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Construye un `Request` POST con un cuerpo que NO es JSON válido. */
function badReq(url: string): Request {
  return new Request(url, { method: "POST", body: "{ not json" });
}

const LOOKUP_URL = "http://localhost/api/loyalty/lookup";
const VERIFY_URL = "http://localhost/api/loyalty/verify-visit";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  isEnabledMock.mockReturnValue(true);
  membershipMock.mockResolvedValue(MEMBERSHIP);
  lookupMock.mockReset();
  verifyMock.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  isEnabledMock.mockReset();
  membershipMock.mockReset();
});

/** Une todos los argumentos logueados en un string para aserciones de no-fuga. */
function loggedText(): string {
  return errorSpy.mock.calls.flat().map((a: unknown) => JSON.stringify(a)).join(" ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asReq = (r: Request) => r as any;

describe("POST /api/loyalty/lookup", () => {
  it("503 { enabled: false } cuando la integración está apagada (sin auth ni upstream)", async () => {
    isEnabledMock.mockReturnValue(false);
    const res = await lookupPOST(asReq(jsonReq(LOOKUP_URL, { qr_token: "QR-1" })));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ enabled: false });
    expect(membershipMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("401 sin sesión, y nunca contacta con el upstream", async () => {
    membershipMock.mockResolvedValue(null);
    const res = await lookupPOST(asReq(jsonReq(LOOKUP_URL, { qr_token: "QR-1" })));
    expect(res.status).toBe(401);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("400 si el cuerpo no es JSON válido", async () => {
    const res = await lookupPOST(asReq(badReq(LOOKUP_URL)));
    expect(res.status).toBe(400);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("400 si falta qr_token", async () => {
    const res = await lookupPOST(asReq(jsonReq(LOOKUP_URL, {})));
    expect(res.status).toBe(400);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("200 con el estado de fidelización; llama al cliente con el qr_token y no cachea", async () => {
    const payload = { member: { id: "m1", name: "Ana", points: 30, tier: null }, coupons: [] };
    lookupMock.mockResolvedValue(payload);

    const res = await lookupPOST(asReq(jsonReq(LOOKUP_URL, { qr_token: "  QR-123  " })));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(lookupMock).toHaveBeenCalledWith("QR-123"); // trim aplicado por el schema
  });

  it("propaga 401/403/404 con mensaje genérico", async () => {
    const cases: Array<[LoyaltyError["code"], number]> = [
      ["unauthorized", 401],
      ["forbidden", 403],
      ["not_found", 404],
    ];
    for (const [code, status] of cases) {
      lookupMock.mockRejectedValueOnce(new LoyaltyError(code, `internal ${code}`, { status }));
      const res = await lookupPOST(asReq(jsonReq(LOOKUP_URL, { qr_token: "QR" })));
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(typeof body.error).toBe("string");
      expect(body).not.toHaveProperty("enabled");
    }
  });

  it("NO-LEAK: ni la API key ni el cuerpo/mensaje del upstream llegan al cliente o al log", async () => {
    lookupMock.mockRejectedValue(
      new LoyaltyError("http", `boom con la clave ${FAKE_KEY}`, {
        status: 500,
        body: `{"trace":"stack interno con ${FAKE_KEY}"}`,
      }),
    );

    const res = await lookupPOST(asReq(jsonReq(LOOKUP_URL, { qr_token: "QR-SECRET-TOKEN" })));

    expect(res.status).toBe(502); // otro no-2xx → 502 gateway
    const text = await res.text();
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain("trace");
    expect(text).not.toContain("boom");

    // El log de servidor tampoco lleva la key, el cuerpo interno ni el qr_token.
    const logs = loggedText();
    expect(logs).not.toContain(FAKE_KEY);
    expect(logs).not.toContain("QR-SECRET-TOKEN");
    expect(logs).not.toContain("trace");
  });

  it("503 { enabled: false } si el cliente lanza LoyaltyError('disabled')", async () => {
    lookupMock.mockRejectedValue(new LoyaltyError("disabled", "apagada"));
    const res = await lookupPOST(asReq(jsonReq(LOOKUP_URL, { qr_token: "QR" })));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ enabled: false });
  });
});

describe("POST /api/loyalty/verify-visit", () => {
  it("503 { enabled: false } cuando la integración está apagada", async () => {
    isEnabledMock.mockReturnValue(false);
    const res = await verifyPOST(asReq(jsonReq(VERIFY_URL, { qr_token: "QR", service_prices: [] })));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ enabled: false });
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("401 sin sesión, y nunca contacta con el upstream", async () => {
    membershipMock.mockResolvedValue(null);
    const res = await verifyPOST(asReq(jsonReq(VERIFY_URL, { qr_token: "QR", service_prices: [] })));
    expect(res.status).toBe(401);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("400 si service_prices tiene valores no enteros", async () => {
    const res = await verifyPOST(
      asReq(jsonReq(VERIFY_URL, { qr_token: "QR", service_prices: [10.5] })),
    );
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("200 y reenvía qr_token, service_prices, location_id undefined y redeem_coupon null", async () => {
    const payload = { points_earned: 6, points_balance: 36, redeemed_coupon: null, discount_cents: 0 };
    verifyMock.mockResolvedValue(payload);

    const res = await verifyPOST(
      asReq(jsonReq(VERIFY_URL, { qr_token: "QR-9", service_prices: [4500, 2000] })),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(verifyMock).toHaveBeenCalledWith({
      qr_token: "QR-9",
      location_id: undefined,
      service_prices: [4500, 2000],
      redeem_coupon: null,
    });
  });

  it("reenvía location_id y redeem_coupon cuando se indican", async () => {
    verifyMock.mockResolvedValue({ points_earned: 0, points_balance: 0, redeemed_coupon: null, discount_cents: 0 });

    await verifyPOST(
      asReq(
        jsonReq(VERIFY_URL, {
          qr_token: "QR-9",
          location_id: "sede-2",
          service_prices: [],
          redeem_coupon: "CUPON10",
        }),
      ),
    );

    expect(verifyMock).toHaveBeenCalledWith({
      qr_token: "QR-9",
      location_id: "sede-2",
      service_prices: [],
      redeem_coupon: "CUPON10",
    });
  });

  it("propaga 404 (QR no encontrado) con mensaje genérico", async () => {
    verifyMock.mockRejectedValue(new LoyaltyError("not_found", "qr inexistente", { status: 404 }));
    const res = await verifyPOST(asReq(jsonReq(VERIFY_URL, { qr_token: "QR", service_prices: [] })));
    expect(res.status).toBe(404);
    expect(typeof (await res.json()).error).toBe("string");
  });
});
