/**
 * Tests unitarios de los DATOS operativos del salón demo (`scripts/seed-demo-data`).
 *
 * El seed de configuración operativa (sub-4) es declarativo: sedes, profesionales,
 * servicios (modelo de 3 fases), productos y horarios viven como constantes puras.
 * Aquí se verifican, SIN base de datos, exactamente las invariantes que Postgres
 * exigiría al insertarlos (los CHECK de `services`, el patrón de `locations.slug`,
 * el formato de `professionals.color`, el dinero en céntimos enteros…) y una
 * garantía de negocio propia del seed: que TODO servicio sea reservable, es decir,
 * que su categoría la cubra al menos un profesional (`professional_services`).
 *
 * Es una red de seguridad barata: si alguien edita el catálogo y rompe un CHECK,
 * el test falla aquí en vez de a mitad del seed contra la base de datos real.
 */
import { describe, it, expect } from "vitest";

import {
  DEMO_LOCATIONS,
  DEMO_OPEN_WEEKDAYS,
  DEMO_PRODUCTS,
  DEMO_PROFESSIONALS,
  DEMO_SERVICES,
  SERVICE_MAX_TOTAL_MINUTES,
  SERVICE_MIN_TOTAL_MINUTES,
  professionalCoversService,
  serviceCategories,
  serviceTotalMinutes,
} from "../../../scripts/seed-demo-data";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `true` si `value` es un entero JS (sin coma flotante). */
function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

/** Minutos desde medianoche de una hora `HH:MM` (para comparar apertura/cierre). */
function minutesOfDay(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

describe("seed-demo-data — sedes (locations)", () => {
  it("hay 1–2 sedes (el mandato pide 1–2)", () => {
    expect(DEMO_LOCATIONS.length).toBeGreaterThanOrEqual(1);
    expect(DEMO_LOCATIONS.length).toBeLessThanOrEqual(2);
  });

  it("los slugs son únicos y cumplen el patrón del esquema", () => {
    const slugs = DEMO_LOCATIONS.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(SLUG_RE);
    }
  });

  it("cada sede tiene nombre, dirección y teléfono no vacíos", () => {
    for (const location of DEMO_LOCATIONS) {
      expect(location.name.trim().length).toBeGreaterThan(0);
      expect(location.address.trim().length).toBeGreaterThan(0);
      expect(location.phone.trim().length).toBeGreaterThan(0);
      expect(location.phone.length).toBeLessThanOrEqual(30); // varchar(30)
    }
  });

  it("el horario de apertura es HH:MM válido y cierre > apertura", () => {
    for (const location of DEMO_LOCATIONS) {
      expect(location.openStart).toMatch(TIME_RE);
      expect(location.openEnd).toMatch(TIME_RE);
      expect(minutesOfDay(location.openEnd)).toBeGreaterThan(
        minutesOfDay(location.openStart),
      );
    }
  });
});

describe("seed-demo-data — profesionales", () => {
  it("hay 6–10 profesionales con nombres únicos (el mandato pide 6–10)", () => {
    expect(DEMO_PROFESSIONALS.length).toBeGreaterThanOrEqual(6);
    expect(DEMO_PROFESSIONALS.length).toBeLessThanOrEqual(10);
    const names = DEMO_PROFESSIONALS.map((p) => p.fullName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("cada profesional pertenece a una sede existente", () => {
    const slugs = new Set(DEMO_LOCATIONS.map((l) => l.slug));
    for (const professional of DEMO_PROFESSIONALS) {
      expect(slugs.has(professional.locationSlug)).toBe(true);
    }
  });

  it("el color de agenda es un #rrggbb válido", () => {
    for (const professional of DEMO_PROFESSIONALS) {
      expect(professional.color).toMatch(HEX_COLOR_RE);
    }
  });

  it("cada profesional declara al menos una especialidad", () => {
    for (const professional of DEMO_PROFESSIONALS) {
      expect(professional.specialties.length).toBeGreaterThan(0);
    }
  });
});

describe("seed-demo-data — servicios (modelo de 3 fases)", () => {
  it("hay 15–25 servicios con nombres únicos (el mandato pide 15–25)", () => {
    expect(DEMO_SERVICES.length).toBeGreaterThanOrEqual(15);
    expect(DEMO_SERVICES.length).toBeLessThanOrEqual(25);
    const names = DEMO_SERVICES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("application_min ≥ 1 y es entero (fase 1 obligatoria)", () => {
    for (const service of DEMO_SERVICES) {
      expect(isInteger(service.applicationMin)).toBe(true);
      expect(service.applicationMin).toBeGreaterThanOrEqual(1);
    }
  });

  it("exposure_min y post_exposure_min son enteros ≥ 0", () => {
    for (const service of DEMO_SERVICES) {
      expect(isInteger(service.exposureMin)).toBe(true);
      expect(service.exposureMin).toBeGreaterThanOrEqual(0);
      expect(isInteger(service.postExposureMin)).toBe(true);
      expect(service.postExposureMin).toBeGreaterThanOrEqual(0);
    }
  });

  it("la duración total (suma de fases) cae en [5, 600] (CHECK generado)", () => {
    for (const service of DEMO_SERVICES) {
      const total = serviceTotalMinutes(service);
      expect(total).toBeGreaterThanOrEqual(SERVICE_MIN_TOTAL_MINUTES);
      expect(total).toBeLessThanOrEqual(SERVICE_MAX_TOTAL_MINUTES);
    }
  });

  it("el precio es un entero de céntimos > 0 (precios realistas)", () => {
    for (const service of DEMO_SERVICES) {
      expect(isInteger(service.priceCents)).toBe(true);
      expect(service.priceCents).toBeGreaterThan(0);
    }
  });

  it("cada servicio tiene categoría no vacía", () => {
    for (const service of DEMO_SERVICES) {
      expect(service.category.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("seed-demo-data — productos", () => {
  it("hay al menos algunos productos, con nombres únicos", () => {
    expect(DEMO_PRODUCTS.length).toBeGreaterThan(0);
    const names = DEMO_PRODUCTS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("precio en céntimos entero > 0, IVA válido y stock entero ≥ 0", () => {
    for (const product of DEMO_PRODUCTS) {
      expect(isInteger(product.priceCents)).toBe(true);
      expect(product.priceCents).toBeGreaterThan(0);
      expect(product.vatRate).toBeGreaterThanOrEqual(0);
      expect(product.vatRate).toBeLessThanOrEqual(100);
      expect(isInteger(product.stock)).toBe(true);
      expect(product.stock).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("seed-demo-data — cobertura reservable (professional_services)", () => {
  it("todo servicio lo presta al menos un profesional (es reservable)", () => {
    for (const service of DEMO_SERVICES) {
      const covered = DEMO_PROFESSIONALS.some((professional) =>
        professionalCoversService(professional, service),
      );
      expect(covered, `El servicio "${service.name}" no lo cubre ningún profesional`).toBe(
        true,
      );
    }
  });

  it("toda categoría del catálogo la cubre al menos un profesional", () => {
    for (const category of serviceCategories()) {
      const covered = DEMO_PROFESSIONALS.some((professional) =>
        professional.specialties.includes(category),
      );
      expect(covered, `La categoría "${category}" no la cubre ningún profesional`).toBe(true);
    }
  });
});

describe("seed-demo-data — horarios de apertura", () => {
  it("abre de lunes a sábado (weekday 1..6, domingo=0 cerrado)", () => {
    expect([...DEMO_OPEN_WEEKDAYS]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(DEMO_OPEN_WEEKDAYS).not.toContain(0);
  });
});

describe("seed-demo-data — funciones puras", () => {
  it("serviceTotalMinutes suma las tres fases", () => {
    expect(
      serviceTotalMinutes({
        name: "x",
        category: "Color",
        applicationMin: 30,
        exposureMin: 25,
        postExposureMin: 15,
        priceCents: 100,
      }),
    ).toBe(70);
  });

  it("professionalCoversService casa especialidad con categoría", () => {
    const pro = {
      fullName: "Test",
      locationSlug: "centro",
      specialties: ["Color", "Mechas"],
      color: "#000000",
    };
    expect(
      professionalCoversService(pro, {
        name: "s",
        category: "Color",
        applicationMin: 10,
        exposureMin: 0,
        postExposureMin: 0,
        priceCents: 100,
      }),
    ).toBe(true);
    expect(
      professionalCoversService(pro, {
        name: "s",
        category: "Barbería",
        applicationMin: 10,
        exposureMin: 0,
        postExposureMin: 0,
        priceCents: 100,
      }),
    ).toBe(false);
  });
});
