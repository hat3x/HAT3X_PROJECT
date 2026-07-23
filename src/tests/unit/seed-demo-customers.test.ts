/**
 * Tests unitarios del generador PURO de clientes demo (`scripts/seed-demo-customers`).
 *
 * El generador alimenta el paso `seedCustomers` de `scripts/seed-demo-salon.ts`
 * (sub-5). Su contrato con el ESQUEMA es estricto y aquí se blinda:
 *   · Teléfonos SIEMPRE normalizables y ÚNICOS por salón — si dos fichas colisionaran
 *     tras `app.normalize_phone`, el índice único parcial `(salon_id, phone_e164)`
 *     abortaría el INSERT del lote. Se verifica con el MISMO `normalizePhone` que
 *     espeja la función SQL.
 *   · Emails ÚNICOS (case-insensitive) cuando están presentes — respeta el único
 *     `(salon_id, lower(email))` — y MEZCLA deliberada de fichas con y sin email.
 *   · DETERMINISMO e INDEPENDENCIA del recuento — requisito de la idempotencia
 *     additiva del seed (reejecutar no debe generar clientes distintos).
 *   · Nombres españoles realistas (nombre de pila + dos apellidos).
 *
 * No toca la base de datos: el trigger `trg_customers_bootstrap_loyalty` (cuenta de
 * puntos + cupón) y el DEFAULT de `qr_token` se ejercitan en los tests de integración
 * del seed, no aquí (este módulo solo produce las fichas a insertar).
 */
import { describe, it, expect } from "vitest";

import { normalizePhone } from "@/lib/customers/normalize-phone";
import {
  DEFAULT_DEMO_CUSTOMER_COUNT,
  MAX_DEMO_CUSTOMER_COUNT,
  MIN_DEMO_CUSTOMER_COUNT,
  generateDemoCustomers,
  resolveCustomerCount,
} from "../../../scripts/seed-demo-customers";

describe("resolveCustomerCount — parseo + saturación al rango pedido [80, 150]", () => {
  it("sin valor (undefined) ⇒ el por defecto", () => {
    expect(resolveCustomerCount(undefined)).toBe(DEFAULT_DEMO_CUSTOMER_COUNT);
  });

  it.each([
    ["cadena vacía", ""],
    ["solo espacios", "   "],
    ["no numérico", "abc"],
  ])("%s ⇒ el por defecto", (_label, input) => {
    expect(resolveCustomerCount(input)).toBe(DEFAULT_DEMO_CUSTOMER_COUNT);
  });

  it("un valor dentro del rango se respeta", () => {
    expect(resolveCustomerCount("100")).toBe(100);
    expect(resolveCustomerCount(" 137 ")).toBe(137);
  });

  it("por debajo del mínimo ⇒ satura a 80; por encima del máximo ⇒ satura a 150", () => {
    expect(resolveCustomerCount("10")).toBe(MIN_DEMO_CUSTOMER_COUNT);
    expect(resolveCustomerCount("0")).toBe(MIN_DEMO_CUSTOMER_COUNT);
    expect(resolveCustomerCount("999")).toBe(MAX_DEMO_CUSTOMER_COUNT);
  });

  it("los límites son inclusivos (80 y 150 pasan tal cual)", () => {
    expect(resolveCustomerCount("80")).toBe(80);
    expect(resolveCustomerCount("150")).toBe(150);
  });

  it("el rango pedido por el cliente es 80–150", () => {
    expect(MIN_DEMO_CUSTOMER_COUNT).toBe(80);
    expect(MAX_DEMO_CUSTOMER_COUNT).toBe(150);
    expect(DEFAULT_DEMO_CUSTOMER_COUNT).toBeGreaterThanOrEqual(MIN_DEMO_CUSTOMER_COUNT);
    expect(DEFAULT_DEMO_CUSTOMER_COUNT).toBeLessThanOrEqual(MAX_DEMO_CUSTOMER_COUNT);
  });
});

describe("generateDemoCustomers — cardinalidad, determinismo e independencia del recuento", () => {
  it("devuelve exactamente `count` fichas", () => {
    expect(generateDemoCustomers(80)).toHaveLength(80);
    expect(generateDemoCustomers(120)).toHaveLength(120);
    expect(generateDemoCustomers(150)).toHaveLength(150);
  });

  it("es DETERMINISTA: dos llamadas con el mismo recuento son idénticas", () => {
    expect(generateDemoCustomers(120)).toEqual(generateDemoCustomers(120));
  });

  it("es INDEPENDIENTE del recuento: las 120 primeras de 150 == las de 120", () => {
    // Clave de la idempotencia: subir 120 → 150 conserva las 120 ya sembradas.
    expect(generateDemoCustomers(150).slice(0, 120)).toEqual(generateDemoCustomers(120));
  });
});

describe("generateDemoCustomers — nombres españoles realistas (pila + dos apellidos)", () => {
  const customers = generateDemoCustomers(150);

  it("cada nombre está recortado, sin espacios dobles y con ≥ 3 componentes", () => {
    for (const { fullName } of customers) {
      expect(fullName).toBe(fullName.trim());
      expect(fullName).not.toMatch(/\s{2,}/); // sin dobles espacios
      // Nombre de pila (posible compuesto) + apellido1 + apellido2 ⇒ ≥ 3 tokens.
      expect(fullName.split(" ").length).toBeGreaterThanOrEqual(3);
    }
  });

  it("hay variedad de nombres (no todos iguales)", () => {
    const distinct = new Set(customers.map((customer) => customer.fullName));
    expect(distinct.size).toBeGreaterThan(50);
  });
});

describe("generateDemoCustomers — teléfonos NORMALIZABLES y ÚNICOS (el corazón del contrato)", () => {
  const customers = generateDemoCustomers(MAX_DEMO_CUSTOMER_COUNT); // estrés al máximo

  it("TODOS los teléfonos normalizan a un E.164 no nulo", () => {
    for (const { phone } of customers) {
      expect(normalizePhone(phone)).not.toBeNull();
    }
  });

  it("los E.164 normalizados son ÚNICOS (no colisionan en el índice único)", () => {
    const e164s = customers.map((customer) => normalizePhone(customer.phone));
    expect(new Set(e164s).size).toBe(customers.length);
  });

  it("cada E.164 es un móvil/fijo español válido en forma (+34 + 9 dígitos)", () => {
    for (const { phone } of customers) {
      expect(normalizePhone(phone)).toMatch(/^\+34[679]\d{8}$/);
    }
  });

  it("los teléfonos crudos vienen en FORMATOS VARIADOS (ejercitan la normalización)", () => {
    const shapes = new Set<string>();
    for (const { phone } of customers) {
      if (phone.startsWith("+34")) shapes.add("plus");
      else if (phone.startsWith("0034")) shapes.add("zerozero");
      else if (phone.includes("(")) shapes.add("paren");
      else if (phone.includes(".")) shapes.add("dot");
      else if (phone.includes(" ")) shapes.add("space");
      else shapes.add("raw");
    }
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });
});

describe("generateDemoCustomers — emails: MEZCLA con/sin y unicidad", () => {
  const customers = generateDemoCustomers(150);

  it("hay fichas CON email y fichas SIN email (mezcla deliberada)", () => {
    const withEmail = customers.filter((customer) => customer.email !== null);
    const withoutEmail = customers.filter((customer) => customer.email === null);
    expect(withEmail.length).toBeGreaterThan(0);
    expect(withoutEmail.length).toBeGreaterThan(0);
  });

  it("los emails presentes son ÚNICOS (case-insensitive) y bien formados en minúscula", () => {
    const emails = customers
      .map((customer) => customer.email)
      .filter((email): email is string => email !== null);
    const lowered = emails.map((email) => email.toLowerCase());
    expect(new Set(lowered).size).toBe(emails.length); // sin colisión en lower(email)
    for (const email of emails) {
      expect(email).toBe(email.toLowerCase());
      expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    }
  });
});

describe("generateDemoCustomers — otros campos escribibles de `customers`", () => {
  const customers = generateDemoCustomers(150);

  it("birth_date, si está, es una fecha YYYY-MM-DD plausible; y hay mezcla con/sin", () => {
    let withDate = 0;
    let withoutDate = 0;
    for (const { birthDate } of customers) {
      if (birthDate === null) {
        withoutDate += 1;
        continue;
      }
      withDate += 1;
      expect(birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [year, month, day] = birthDate.split("-").map((part) => Number.parseInt(part, 10));
      expect(year).toBeGreaterThanOrEqual(1950);
      expect(year).toBeLessThanOrEqual(2006);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(28);
    }
    expect(withDate).toBeGreaterThan(0);
    expect(withoutDate).toBeGreaterThan(0);
  });

  it("marketing_consent es booleano y aparecen ambos valores", () => {
    const consents = customers.map((customer) => customer.marketingConsent);
    for (const consent of consents) {
      expect(typeof consent).toBe("boolean");
    }
    expect(consents.some((value) => value === true)).toBe(true);
    expect(consents.some((value) => value === false)).toBe(true);
  });

  it("notes es null o un texto no vacío", () => {
    for (const { notes } of customers) {
      if (notes !== null) {
        expect(notes.length).toBeGreaterThan(0);
      }
    }
  });
});
