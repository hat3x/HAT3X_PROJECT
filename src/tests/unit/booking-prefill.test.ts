/**
 * `resolveBookingPrefill` (sub-6) — el mapeo ficha → formulario y el contrato
 * «best-effort» de la precarga de la reserva pública.
 *
 * La lectura self en sí (RLS, acotado por salón, sin sesión → null) se cubre en
 * `customers-account.test.ts` (getMyCustomerForSalon). Aquí se aísla lo propio de este
 * módulo, mockeando esa lectura: (1) que traduce la ficha a la forma EXACTA del
 * formulario —solo perfil, sin `notes`, con `null` → `""`—, y (2) que NUNCA rompe la
 * reserva: sin ficha o ante un fallo de la lectura, degrada a `null`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMyCustomerForSalon = vi.fn();
vi.mock("@/lib/customers/account", () => ({
  getMyCustomerForSalon: (...args: unknown[]) => getMyCustomerForSalon(...args),
}));

import { resolveBookingPrefill } from "@/lib/booking/prefill";

/** Ficha sintética mínima (solo los campos que consume el mapeo). */
function customer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cust-1",
    salon_id: "salon-1",
    full_name: "Ana García",
    phone: "612 34 56 78",
    email: "ana@correo.com",
    marketing_consent: true,
    user_id: "user-1",
    notes: "Alérgica al amoníaco", // NO debe colarse en la precarga (es de la ficha, no del perfil de reserva)
    ...overrides,
  };
}

beforeEach(() => {
  getMyCustomerForSalon.mockReset();
});

describe("resolveBookingPrefill", () => {
  it("mapea la ficha a la forma del formulario: SOLO perfil, sin `notes`", async () => {
    getMyCustomerForSalon.mockResolvedValue(customer());

    const prefill = await resolveBookingPrefill("salon-1");

    expect(prefill).toEqual({
      fullName: "Ana García",
      phone: "612 34 56 78",
      email: "ana@correo.com",
      marketingConsent: true,
    });
    // Ni un campo de más: exactamente el contrato de perfil (nada de `notes`/`id`/`user_id`…).
    expect(Object.keys(prefill ?? {}).sort()).toEqual([
      "email",
      "fullName",
      "marketingConsent",
      "phone",
    ]);
  });

  it("normaliza phone/email nulos de la ficha a cadena vacía (inputs controlados sin `null`)", async () => {
    getMyCustomerForSalon.mockResolvedValue(
      customer({ full_name: "Bea", phone: null, email: null, marketing_consent: false }),
    );

    const prefill = await resolveBookingPrefill("salon-1");

    expect(prefill).toEqual({
      fullName: "Bea",
      phone: "",
      email: "",
      marketingConsent: false,
    });
  });

  it("devuelve null si no hay ficha (anónimo o no cliente del salón)", async () => {
    getMyCustomerForSalon.mockResolvedValue(null);
    await expect(resolveBookingPrefill("salon-1")).resolves.toBeNull();
  });

  it("BEST-EFFORT: si la lectura self falla, degrada a null (nunca rompe la reserva)", async () => {
    getMyCustomerForSalon.mockRejectedValue(new Error("fallo de consulta"));
    await expect(resolveBookingPrefill("salon-1")).resolves.toBeNull();
  });

  it("propaga el salonId a la lectura self (precarga acotada a ESTE salón)", async () => {
    getMyCustomerForSalon.mockResolvedValue(null);
    await resolveBookingPrefill("salon-42");
    expect(getMyCustomerForSalon).toHaveBeenCalledWith("salon-42");
  });
});
