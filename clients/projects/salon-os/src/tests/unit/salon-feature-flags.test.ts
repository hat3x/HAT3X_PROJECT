/**
 * Snapshot ISOMÓRFICO de entitlements — capa pura (`@/lib/salon-feature-flags`).
 *
 * `salon-features.test.ts` ya blinda la LECTURA de datos (`salonHasFeature` /
 * `listSalonFeatures`) y su coherencia con la SQL. Aquí se fija la capa pura que sirve
 * el snapshot al cliente:
 *
 *   A) CATÁLOGO — `SALON_FEATURES` (lista en runtime) coincide EXACTAMENTE con el enum
 *      `public.salon_feature` de la migración real (mismo conjunto y mismo orden). Es el
 *      mismo espíritu de `normalize-phone-sql-coherence`: que TS y SQL no diverjan.
 *
 *   B) REDUCTOR — `toSalonFeatureFlags` colapsa el mapa de tres estados de
 *      `listSalonFeatures` en el snapshot booleano del GATE con la regla OPT-IN, y en
 *      particular COLAPSA "en pausa" (enabled=false) a `false` — la diferencia clave con
 *      la vista de Complementos, porque para ocultar Facturación / gráficas de ingresos
 *      un add-on suspendido cuenta como OFF.
 *
 *   C) DENY-BY-DEFAULT — `EMPTY_SALON_FEATURE_FLAGS` es todo `false`, con todas las
 *      claves presentes, y es de solo lectura (congelado).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  EMPTY_SALON_FEATURE_FLAGS,
  SALON_FEATURES,
  toSalonFeatureFlags,
} from "@/lib/salon-feature-flags";
import type { SalonFeature } from "@/types/database";

/** Construye el mapa `feature → enabled` tal como lo devuelve `listSalonFeatures`. */
function stateMap(
  entries: ReadonlyArray<[SalonFeature, boolean]>,
): ReadonlyMap<SalonFeature, boolean> {
  return new Map<SalonFeature, boolean>(entries);
}

// ─────────────────────────────────────────────────────────────────────────────
// A) CATÁLOGO — TS ↔ enum SQL.
// ─────────────────────────────────────────────────────────────────────────────
describe("SALON_FEATURES — coherencia con el enum public.salon_feature", () => {
  const migrationSql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260718100000_salon_features.sql"),
    "utf8",
  );

  /** Valores del enum, EN ORDEN, extraídos del cuerpo `create type … as enum ( … );`. */
  const enumValues = (() => {
    const start = migrationSql.indexOf("create type public.salon_feature as enum");
    const end = migrationSql.indexOf(");", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = migrationSql.slice(start, end);
    return Array.from(body.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
  })();

  it("contiene exactamente los cinco add-ons del catálogo v1", () => {
    expect(SALON_FEATURES).toEqual([
      "loyalty",
      "client_app",
      "staff_app",
      "ai_receptionist",
      "pos",
    ]);
  });

  it("coincide con el enum SQL en conjunto Y orden (TS y SQL no divergen)", () => {
    expect(enumValues).toEqual([...SALON_FEATURES]);
  });

  it("incluye 'pos' (el add-on que gobierna el gating de TPV/facturación)", () => {
    expect(SALON_FEATURES).toContain("pos");
    expect(enumValues).toContain("pos");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C) DENY-BY-DEFAULT — el snapshot vacío.
// ─────────────────────────────────────────────────────────────────────────────
describe("EMPTY_SALON_FEATURE_FLAGS — deny-by-default", () => {
  it("tiene TODAS las claves del catálogo y todas en false", () => {
    for (const feature of SALON_FEATURES) {
      expect(EMPTY_SALON_FEATURE_FLAGS[feature]).toBe(false);
    }
    expect(Object.keys(EMPTY_SALON_FEATURE_FLAGS).sort()).toEqual(
      [...SALON_FEATURES].sort(),
    );
  });

  it("es de solo lectura (congelado): un gate compartido no debe mutarse", () => {
    expect(Object.isFrozen(EMPTY_SALON_FEATURE_FLAGS)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) REDUCTOR — la tabla de verdad OPT-IN del snapshot booleano.
// ─────────────────────────────────────────────────────────────────────────────
describe("toSalonFeatureFlags — colapsa el mapa de 3 estados al gate booleano", () => {
  it("clave presente y true ⇒ true (contratado y activo)", () => {
    const flags = toSalonFeatureFlags(stateMap([["pos", true]]));
    expect(flags.pos).toBe(true);
  });

  it("clave presente y false (EN PAUSA) ⇒ false: el gate CIERRA", () => {
    // Diferencia clave con Complementos: 'en pausa' NO habilita la superficie de pago.
    const flags = toSalonFeatureFlags(stateMap([["pos", false]]));
    expect(flags.pos).toBe(false);
  });

  it("clave ausente ⇒ false (no contratado — la ausencia ES el gate)", () => {
    const flags = toSalonFeatureFlags(stateMap([["loyalty", true]]));
    expect(flags.pos).toBe(false);
  });

  it("devuelve SIEMPRE las cinco claves presentes (no solo las del mapa)", () => {
    const flags = toSalonFeatureFlags(stateMap([["loyalty", true]]));
    expect(Object.keys(flags).sort()).toEqual([...SALON_FEATURES].sort());
  });

  it("mapa vacío ⇒ snapshot equivalente a EMPTY (todo false)", () => {
    expect(toSalonFeatureFlags(stateMap([]))).toEqual(EMPTY_SALON_FEATURE_FLAGS);
  });

  it("todos activos ⇒ todas las flags en true", () => {
    const flags = toSalonFeatureFlags(
      stateMap(SALON_FEATURES.map((feature) => [feature, true])),
    );
    for (const feature of SALON_FEATURES) {
      expect(flags[feature]).toBe(true);
    }
  });

  it("mezcla realista: pos activo, loyalty en pausa, resto ausente", () => {
    const flags = toSalonFeatureFlags(
      stateMap([
        ["pos", true],
        ["loyalty", false],
      ]),
    );
    expect(flags).toEqual({
      loyalty: false, // en pausa ⇒ off
      client_app: false, // ausente ⇒ off
      staff_app: false,
      ai_receptionist: false,
      pos: true, // activo ⇒ on (Facturación / ingresos visibles)
    });
  });

  it("no muta el snapshot vacío compartido (parte de una copia)", () => {
    toSalonFeatureFlags(stateMap([["pos", true]]));
    expect(EMPTY_SALON_FEATURE_FLAGS.pos).toBe(false);
  });
});
