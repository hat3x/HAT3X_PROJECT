/**
 * Traducir los errores de la base al idioma de quien está delante.
 *
 * ── EL CASO ─────────────────────────────────────────────────────────────────
 * Kristel intentó ponerle el teléfono a una ficha y le salió esto, tal cual:
 *
 *   duplicate key value violates unique constraint
 *   "idx_customers_salon_phone_e164"
 *
 * No es un mensaje: es el vómito de Postgres. No dice qué ha pasado, ni de
 * quién es el conflicto, ni qué hacer. Y el caso de fondo —dos personas de una
 * familia que comparten móvil— es de lo más normal en una clínica.
 */
import { describe, it, expect } from "vitest";

import { describeCustomerWriteError } from "@/lib/customers/write-errors";

describe("describeCustomerWriteError", () => {
  it("el telefono duplicado se explica, y dice de quien es", () => {
    const msg = describeCustomerWriteError(
      { code: "23505", message: 'duplicate key value violates unique constraint "idx_customers_salon_phone_e164"' },
      { conflictingName: "Ana Castiella" },
    );
    expect(msg).toContain("Ana Castiella");
    expect(msg).not.toContain("idx_customers");
    expect(msg).not.toContain("duplicate key");
  });

  it("sin saber de quien es, sigue explicandose", () => {
    const msg = describeCustomerWriteError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_customers_salon_phone_e164"',
    });
    expect(msg).toMatch(/tel[eé]fono/i);
    expect(msg).not.toContain("idx_customers");
  });

  it("el email duplicado tiene su propio mensaje, no el del telefono", () => {
    const msg = describeCustomerWriteError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_customers_salon_email"',
    });
    expect(msg).toMatch(/correo|email/i);
    expect(msg).not.toMatch(/tel[eé]fono/i);
  });

  it("un error que no sabemos traducir se deja tal cual, no se disfraza", () => {
    // Inventarse un mensaje bonito para un error desconocido esconde el
    // problema real de quien tenga que arreglarlo.
    const msg = describeCustomerWriteError({ code: "42501", message: "permission denied for table customers" });
    expect(msg).toBe("permission denied for table customers");
  });

  it("un 23505 de otro indice no se confunde con los conocidos", () => {
    const msg = describeCustomerWriteError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "customers_patient_code_unique"',
    });
    expect(msg).not.toMatch(/tel[eé]fono/i);
    expect(msg).not.toMatch(/correo/i);
  });

  it("aguanta un error sin codigo o sin mensaje", () => {
    expect(describeCustomerWriteError({ message: "algo" })).toBe("algo");
    expect(describeCustomerWriteError({ code: "23505" })).toBeTruthy();
    expect(describeCustomerWriteError(null)).toBeTruthy();
  });
});
