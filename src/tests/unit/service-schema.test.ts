/**
 * Tests unitarios del esquema de validación del servicio (`serviceSchema`).
 *
 * Cubre la lógica crítica del modelo de duración por 3 fases:
 *   · `application_min` es obligatorio y debe ser un entero ≥ 1 minuto.
 *   · `exposure_min` y `post_exposure_min` son opcionales (vacío → 0).
 *   · `duration_minutes_total` (columna generada en BD) equivale a la suma de
 *     las tres fases; aquí verificamos que las fases validadas producen ese
 *     total de forma coherente con lo que persistirá Postgres.
 *   · el precio en euros se transforma a céntimos (entero) sin errores de coma
 *     flotante.
 *
 * El esquema es el límite de confianza real (se usa en el Server Action con
 * `safeParse`), así que se prueba directamente sin base de datos ni UI.
 */
import { describe, it, expect } from "vitest";

import { serviceSchema, type ServiceInput } from "@/lib/validations/service";

/** Entrada válida mínima; cada test sobrescribe solo lo que le interesa. */
function baseInput(overrides: Partial<ServiceInput> = {}): ServiceInput {
  return {
    name: "Corte de pelo",
    application_min: "30",
    price: "20",
    active: true,
    ...overrides,
  };
}

/** Suma de las tres fases = `duration_minutes_total` que generará la BD. */
function totalMinutes(values: {
  application_min: number;
  exposure_min: number;
  post_exposure_min: number;
}): number {
  return values.application_min + values.exposure_min + values.post_exposure_min;
}

describe("serviceSchema — fase de aplicación (application_min ≥ 1)", () => {
  it("acepta la fase de aplicación mínima (1 minuto)", () => {
    const result = serviceSchema.safeParse(baseInput({ application_min: "1" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.application_min).toBe(1);
    }
  });

  it("rechaza application_min = 0 (por debajo del mínimo de 1)", () => {
    const result = serviceSchema.safeParse(baseInput({ application_min: "0" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("al menos 1 minuto");
    }
  });

  it("rechaza application_min vacío (obligatorio)", () => {
    const result = serviceSchema.safeParse(baseInput({ application_min: "" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("obligatorio");
    }
  });

  it("rechaza application_min no entero (decimales)", () => {
    const result = serviceSchema.safeParse(baseInput({ application_min: "30.5" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("número entero");
    }
  });

  it("rechaza application_min con texto no numérico", () => {
    const result = serviceSchema.safeParse(baseInput({ application_min: "treinta" }));
    expect(result.success).toBe(false);
  });

  it("rechaza application_min negativo (el signo no es dígito)", () => {
    const result = serviceSchema.safeParse(baseInput({ application_min: "-5" }));
    expect(result.success).toBe(false);
  });

  it("convierte la cadena del formulario a entero", () => {
    const result = serviceSchema.safeParse(baseInput({ application_min: "45" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.application_min).toBe(45);
      expect(typeof result.data.application_min).toBe("number");
    }
  });
});

describe("serviceSchema — fases opcionales y duración total", () => {
  it("aplica 0 por defecto a las fases opcionales cuando llegan vacías", () => {
    const result = serviceSchema.safeParse(
      baseInput({ exposure_min: "", post_exposure_min: undefined }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exposure_min).toBe(0);
      expect(result.data.post_exposure_min).toBe(0);
    }
  });

  it("calcula duration_minutes_total como la suma de las tres fases", () => {
    const result = serviceSchema.safeParse(
      baseInput({
        application_min: "30",
        exposure_min: "20",
        post_exposure_min: "10",
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      // 30 (aplicación) + 20 (exposición) + 10 (post) = 60 min.
      expect(totalMinutes(result.data)).toBe(60);
    }
  });

  it("con solo aplicación, la duración total equivale a application_min", () => {
    const result = serviceSchema.safeParse(baseInput({ application_min: "25" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exposure_min).toBe(0);
      expect(result.data.post_exposure_min).toBe(0);
      expect(totalMinutes(result.data)).toBe(25);
    }
  });

  it("rechaza una fase opcional con valor no entero", () => {
    const result = serviceSchema.safeParse(baseInput({ exposure_min: "5,5" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("número entero");
    }
  });

  it("admite 0 explícito en las fases opcionales", () => {
    const result = serviceSchema.safeParse(
      baseInput({ exposure_min: "0", post_exposure_min: "0" }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(totalMinutes(result.data)).toBe(30);
    }
  });
});

describe("serviceSchema — precio en euros → céntimos", () => {
  it("transforma euros con coma decimal a céntimos enteros", () => {
    const result = serviceSchema.safeParse(baseInput({ price: "19,99" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(1999);
    }
  });

  it("transforma euros con punto decimal a céntimos enteros", () => {
    const result = serviceSchema.safeParse(baseInput({ price: "20.5" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(2050);
    }
  });

  it("rechaza un precio con más de 2 decimales", () => {
    const result = serviceSchema.safeParse(baseInput({ price: "10.999" }));
    expect(result.success).toBe(false);
  });

  it("rechaza un precio vacío (obligatorio)", () => {
    const result = serviceSchema.safeParse(baseInput({ price: "" }));
    expect(result.success).toBe(false);
  });
});
