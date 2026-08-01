/**
 * `sendSms` / `summarizeSmsResult` (`@/lib/sms/client`).
 *
 * Verifica las tres barreras de dry-run (disabled / placeholder creds /
 * teléfono inválido) y, cuando la config está "activada", que la llamada a
 * Twilio se construye con la URL, cabeceras y parámetros correctos.
 * `global.fetch` se stubbea siempre: NUNCA se hace una llamada real a Twilio.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendSms, summarizeSmsResult, type SmsSendResult } from "@/lib/sms/client";
import { SMS_PLACEHOLDERS, type TwilioSmsConfig } from "@/lib/sms/config";

const ENABLED_CONFIG: TwilioSmsConfig = {
  enabled: true,
  accountSid: "AC1234567890abcdef1234567890abcdef",
  authToken: "real-auth-token",
  from: "Biodental",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendSms — barreras de dry-run", () => {
  it("disabled ⇒ dry-run sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms("+34611111111", "Hola", {
      ...ENABLED_CONFIG,
      enabled: false,
    });

    expect(result).toEqual({
      sent: false,
      dryRun: true,
      reason: "disabled",
      to: "+34611111111",
      logText: "Hola",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("credenciales placeholder ⇒ dry-run sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms("+34611111111", "Hola", {
      ...ENABLED_CONFIG,
      accountSid: SMS_PLACEHOLDERS.accountSid,
    });

    expect(result).toEqual({
      sent: false,
      dryRun: true,
      reason: "placeholder_creds",
      to: "+34611111111",
      logText: "Hola",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("authToken placeholder ⇒ dry-run (placeholder_creds)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms("+34611111111", "Hola", {
      ...ENABLED_CONFIG,
      authToken: SMS_PLACEHOLDERS.authToken,
    });

    expect(result.sent).toBe(false);
    if (!result.sent) {
      expect(result.dryRun).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("teléfono no normalizable ⇒ dry-run (invalid_phone), sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms("no-es-un-telefono", "Hola", ENABLED_CONFIG);

    expect(result).toEqual({
      sent: false,
      dryRun: true,
      reason: "invalid_phone",
      to: "no-es-un-telefono",
      logText: "Hola",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendSms — envío real (config habilitada, credenciales válidas)", () => {
  it("normaliza el teléfono español sin prefijo a E.164 y llama a Twilio con los parámetros correctos", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://api.twilio.com/2010-04-01/Accounts/AC1234567890abcdef1234567890abcdef/Messages.json",
      );
      expect(init?.method).toBe("POST");

      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      const expectedAuth = `Basic ${Buffer.from("AC1234567890abcdef1234567890abcdef:real-auth-token").toString("base64")}`;
      expect(headers.Authorization).toBe(expectedAuth);

      const params = new URLSearchParams(init?.body as string);
      expect(params.get("To")).toBe("+34611111111");
      expect(params.get("From")).toBe("Biodental");
      expect(params.get("Body")).toBe("Hola Ana, tu cita es mañana.");

      return jsonResponse(201, { sid: "SM123", status: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms("611111111", "Hola Ana, tu cita es mañana.", ENABLED_CONFIG);

    expect(result).toEqual({
      sent: true,
      dryRun: false,
      messageSid: "SM123",
      to: "+34611111111",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respuesta de Twilio no-ok ⇒ { sent:false, dryRun:false, error }", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { message: "Invalid From" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms("+34611111111", "Hola", ENABLED_CONFIG);

    expect(result.sent).toBe(false);
    if (!result.sent && !result.dryRun) {
      expect(result.error).toContain("Twilio 400");
    }
  });
});

describe("summarizeSmsResult", () => {
  it("enviado ⇒ mensaje con SID", () => {
    const result: SmsSendResult = {
      sent: true,
      dryRun: false,
      messageSid: "SM123",
      to: "+34611111111",
    };
    expect(summarizeSmsResult(result)).toBe("✅ SMS enviado a +34611111111 (SID: SM123)");
  });

  it("dry-run ⇒ mensaje legible 'Modo prueba' (NO jerga tipo '[disabled]')", () => {
    const result: SmsSendResult = {
      sent: false,
      dryRun: true,
      reason: "disabled",
      to: "+34611111111",
      logText: "texto",
    };
    const summary = summarizeSmsResult(result);
    expect(summary).toContain("Modo prueba");
    expect(summary).not.toContain("[disabled]");
  });

  it("error ⇒ mensaje con el detalle del error", () => {
    const result: SmsSendResult = {
      sent: false,
      dryRun: false,
      error: "Twilio 400: boom",
      to: "+34611111111",
    };
    expect(summarizeSmsResult(result)).toBe(
      "❌ Error enviando SMS a +34611111111: Twilio 400: boom",
    );
  });
});
