/**
 * Backfill de entitlements — CONSERVA EL ACCESO de un salón existente (sub-11, req. 3).
 *
 * Al introducir el gate OPT-IN (deny-by-default: sin fila en `public.salon_features`
 * el módulo NO aparece), un salón que YA usaba un módulo se quedaría a oscuras. La
 * migración de DATOS `20260718120000_backfill_salon_features.sql` lo evita: da de
 * alta los add-ons EN USO para que nada desaparezca. La propiedad central de esta
 * subtarea es "backfill conserva acceso": un salón con actividad previa de
 * fidelización termina con 'loyalty' activo ⇒ el gate lo deja pasar.
 *
 * Dos planos, como el resto de la suite:
 *
 *   A) COMPORTAMIENTO — un PORT en JS de la lógica de alta (la UNION de señales de
 *      uso + `on conflict (salon_id, feature) do nothing`), transliterada del SQL
 *      como referencia neutral. Sobre él se comprueba: (1) un salón con uso previo
 *      de loyalty CONSERVA el acceso (verificado con el helper real `salonHasFeature`),
 *      (2) idempotencia y respeto de una suspensión de HAT3X (enabled=false NO se
 *      resucita), (3) denueveanueve recibe sus 4 add-ons por slug, (4) un salón sin
 *      uso NO recibe nada (opt-in intacto).
 *
 *   B) FUENTE — la migración real sigue codificando esas reglas: alta por slug de
 *      denueveanueve, señales de uso por add-on, `do nothing` idempotente, y que NO
 *      autoconcede 'ai_receptionist' (add-on de pago).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { salonHasFeature } from "@/lib/salon-features";
import type { SalonFeature } from "@/types/database";

// ─────────────────────────────────────────────────────────────────────────────
// BD en memoria mínima (solo las tablas que el backfill consulta).
// ─────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
type DB = Record<string, Row[]>;

const BACKFILL_NOTE =
  "Backfill entitlements (arranque productización 2026-07-18): denueveanueve + salones con uso previo.";

const DNA_FEATURES: SalonFeature[] = ["loyalty", "client_app", "staff_app", "pos"];

function some(db: DB, table: string, pred: (r: Row) => boolean): boolean {
  return (db[table] ?? []).some(pred);
}

// ─────────────────────────────────────────────────────────────────────────────
// PORT de la CTE `grants` — transliteración fiel de la UNION de señales de uso del
// SQL (rama A por slug + rama B por actividad real). Devuelve el conjunto de pares
// (salon_id, feature) a dar de alta, ya deduplicado (UNION ⇒ Set).
// ─────────────────────────────────────────────────────────────────────────────
function computeGrants(db: DB): Set<string> {
  const grants = new Set<string>();
  const add = (salonId: string, feature: SalonFeature) => grants.add(`${salonId}|${feature}`);

  for (const s of db.salons ?? []) {
    const id = s.id as string;

    // (A) denueveanueve → los 4 add-ons, incondicional por slug.
    if (s.slug === "denueveanueve") {
      for (const f of DNA_FEATURES) add(id, f);
    }

    // (B.loyalty) actividad real (no la autoprovisión por cliente).
    if (
      some(db, "points_movements", (r) => r.salon_id === id) ||
      some(db, "rewards", (r) => r.salon_id === id) ||
      some(
        db,
        "loyalty_accounts",
        (r) =>
          r.salon_id === id &&
          ((r.points_balance as number) > 0 ||
            (r.visits_total as number) > 0 ||
            r.last_visit_at != null),
      ) ||
      some(db, "welcome_coupons", (r) => r.salon_id === id && r.status !== "ACTIVE")
    ) {
      add(id, "loyalty");
    }

    // (B.client_app) al menos una ficha enlazada a una cuenta de auth (registro PWA).
    if (some(db, "customers", (r) => r.salon_id === id && r.user_id != null)) {
      add(id, "client_app");
    }

    // (B.staff_app) profesional con cuenta O miembro con rol staff.
    if (
      some(db, "professionals", (r) => r.salon_id === id && r.user_id != null) ||
      some(db, "salon_members", (r) => r.salon_id === id && r.role === "staff")
    ) {
      add(id, "staff_app");
    }

    // (B.pos) actividad real de TPV (no los métodos de pago autoprovisionados).
    if (
      some(db, "pos_sales", (r) => r.salon_id === id) ||
      some(db, "pos_payments", (r) => r.salon_id === id) ||
      some(db, "pos_sessions", (r) => r.salon_id === id)
    ) {
      add(id, "pos");
    }
  }
  return grants;
}

/**
 * Aplica el alta idempotente `INSERT … ON CONFLICT (salon_id, feature) DO NOTHING`:
 * inserta cada grant que no exista ya (respeta filas previas de HAT3X — enabled y
 * notes intactos). Devuelve cuántas filas se insertaron (para la aserción de idempotencia).
 */
function applyBackfill(db: DB): number {
  const features = (db.salon_features ??= []);
  let inserted = 0;
  for (const key of computeGrants(db)) {
    const [salonId, feature] = key.split("|") as [string, SalonFeature];
    const exists = features.some((r) => r.salon_id === salonId && r.feature === feature);
    if (!exists) {
      features.push({ salon_id: salonId, feature, enabled: true, notes: BACKFILL_NOTE });
      inserted += 1;
    }
  }
  return inserted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Doble mínimo de Supabase sobre el resultado del backfill, para verificar el
// ACCESO con el helper REAL `salonHasFeature` (cierra el lazo req.1 ↔ req.3).
// ─────────────────────────────────────────────────────────────────────────────
type Client = Parameters<typeof salonHasFeature>[0];
function featureClient(db: DB): Client {
  const builder = () => {
    const filters: Array<(r: Row) => boolean> = [];
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return b;
      },
      maybeSingle: () => {
        const match = (db.salon_features ?? []).find((r) => filters.every((f) => f(r))) ?? null;
        return Promise.resolve({ data: match, error: null });
      },
    };
    return b;
  };
  return { from: () => builder() } as unknown as Client;
}

const hasAccess = (db: DB, salonId: string, feature: SalonFeature = "loyalty") =>
  salonHasFeature(featureClient(db), salonId, feature);

// ─────────────────────────────────────────────────────────────────────────────
// A) COMPORTAMIENTO
// ─────────────────────────────────────────────────────────────────────────────
describe("backfill — conserva el acceso de un salón con uso previo", () => {
  it("un salón que YA usaba loyalty (tiene points_movements) recibe 'loyalty' ⇒ acceso conservado", async () => {
    const db: DB = {
      salons: [{ id: "salon-viejo", slug: "mi-salon" }],
      salon_features: [], // el gate opt-in acaba de entrar: aún sin filas
      points_movements: [{ salon_id: "salon-viejo", type: "EARN", points: 10 }],
    };

    // ANTES del backfill: sin fila ⇒ el gate cerraría el módulo que ya usaba.
    await expect(hasAccess(db, "salon-viejo")).resolves.toBe(false);

    applyBackfill(db);

    // DESPUÉS: el backfill garantizó la fila (enabled=true) ⇒ acceso conservado.
    await expect(hasAccess(db, "salon-viejo")).resolves.toBe(true);
    expect(db.salon_features).toContainEqual({
      salon_id: "salon-viejo",
      feature: "loyalty",
      enabled: true,
      notes: BACKFILL_NOTE,
    });
  });

  it("detecta el uso por saldo/visitas de la cuenta y por cupón ya no ACTIVE", async () => {
    const db: DB = {
      salons: [{ id: "s-saldo", slug: "a" }, { id: "s-cupon", slug: "b" }],
      salon_features: [],
      loyalty_accounts: [
        { salon_id: "s-saldo", points_balance: 30, visits_total: 0, last_visit_at: null },
      ],
      welcome_coupons: [{ salon_id: "s-cupon", status: "USED" }],
    };
    applyBackfill(db);
    await expect(hasAccess(db, "s-saldo")).resolves.toBe(true);
    await expect(hasAccess(db, "s-cupon")).resolves.toBe(true);
  });

  it("NO confunde autoprovisión con uso: cuenta a cero + cupón ACTIVE ⇒ sin loyalty", async () => {
    // El bootstrap por cliente crea una cuenta a cero y un cupón ACTIVE; su mera
    // existencia NO es uso. El salón queda SIN fila ⇒ opt-in intacto, sin acceso.
    const db: DB = {
      salons: [{ id: "s-limpio", slug: "c" }],
      salon_features: [],
      loyalty_accounts: [
        { salon_id: "s-limpio", points_balance: 0, visits_total: 0, last_visit_at: null },
      ],
      welcome_coupons: [{ salon_id: "s-limpio", status: "ACTIVE" }],
    };
    applyBackfill(db);
    await expect(hasAccess(db, "s-limpio")).resolves.toBe(false);
    expect(db.salon_features).toHaveLength(0);
  });

  it("es IDEMPOTENTE y RESPETA una suspensión de HAT3X (enabled=false no se resucita)", async () => {
    const db: DB = {
      salons: [{ id: "s-suspendido", slug: "d" }],
      // HAT3X ya provisionó 'loyalty' pero lo SUSPENDIÓ (impago): enabled=false.
      salon_features: [
        { salon_id: "s-suspendido", feature: "loyalty", enabled: false, notes: "impago" },
      ],
      points_movements: [{ salon_id: "s-suspendido", type: "EARN", points: 5 }],
    };

    const firstRun = applyBackfill(db);
    const secondRun = applyBackfill(db);

    expect(firstRun).toBe(0); // la fila ya existía ⇒ DO NOTHING no inserta
    expect(secondRun).toBe(0); // re-ejecutar no duplica
    const feats = db.salon_features ?? [];
    expect(feats).toHaveLength(1);
    // La suspensión se respeta: el gate sigue CERRADO (no lo reabrió el backfill).
    expect(feats[0]).toMatchObject({ enabled: false, notes: "impago" });
    await expect(hasAccess(db, "s-suspendido")).resolves.toBe(false);
  });

  it("denueveanueve recibe sus 4 add-ons por slug (incondicional, sin actividad)", () => {
    const db: DB = {
      salons: [{ id: "dna", slug: "denueveanueve" }],
      salon_features: [],
    };
    applyBackfill(db);
    const dnaFeatures = (db.salon_features ?? [])
      .filter((r) => r.salon_id === "dna")
      .map((r) => r.feature)
      .sort();
    expect(dnaFeatures).toEqual([...DNA_FEATURES].sort());
    // NO se autoconcede el add-on de pago 'ai_receptionist'.
    expect(dnaFeatures).not.toContain("ai_receptionist");
  });

  it("señales client_app / staff_app / pos por actividad real", () => {
    const db: DB = {
      salons: [{ id: "s1", slug: "e" }, { id: "s2", slug: "f" }, { id: "s3", slug: "g" }],
      salon_features: [],
      customers: [{ salon_id: "s1", user_id: "u1" }], // client_app
      salon_members: [{ salon_id: "s2", role: "staff", user_id: "u2" }], // staff_app
      pos_sales: [{ salon_id: "s3" }], // pos
    };
    const grants = computeGrants(db);
    expect(grants.has("s1|client_app")).toBe(true);
    expect(grants.has("s2|staff_app")).toBe(true);
    expect(grants.has("s3|pos")).toBe(true);
    // Cada señal es específica: s1 no obtiene staff_app ni pos, etc.
    expect(grants.has("s1|staff_app")).toBe(false);
    expect(grants.has("s3|loyalty")).toBe(false);
  });

  it("un salón sin uso alguno NO recibe filas (opt-in preservado)", () => {
    const db: DB = { salons: [{ id: "s-nuevo", slug: "h" }], salon_features: [] };
    const inserted = applyBackfill(db);
    expect(inserted).toBe(0);
    expect(db.salon_features).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) FUENTE — la migración real sigue codificando las mismas reglas que el port.
// ─────────────────────────────────────────────────────────────────────────────
describe("backfill — anclajes en la migración real", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260718120000_backfill_salon_features.sql"),
    "utf8",
  );

  it("es idempotente: INSERT … ON CONFLICT (salon_id, feature) DO NOTHING", () => {
    expect(sql).toMatch(/on conflict \(salon_id, feature\)\s*do nothing/i);
  });

  it("da de alta denueveanueve por slug con los 4 add-ons (no 'ai_receptionist')", () => {
    expect(sql).toMatch(/where d\.slug = 'denueveanueve'/);
    for (const f of DNA_FEATURES) {
      expect(sql).toContain(`'${f}'::public.salon_feature`);
    }
    // El add-on de pago NO se autoconcede en el alta.
    expect(sql).not.toContain("'ai_receptionist'::public.salon_feature");
  });

  it("las señales de uso son las esperadas por add-on (rama B)", () => {
    // loyalty
    expect(sql).toMatch(/points_movements/);
    expect(sql).toMatch(/from public\.rewards/);
    expect(sql).toMatch(/points_balance > 0/);
    expect(sql).toMatch(/wc\.status <> 'ACTIVE'/);
    // client_app / staff_app / pos
    expect(sql).toMatch(/c\.user_id is not null/);
    expect(sql).toMatch(/p\.user_id is not null/);
    expect(sql).toMatch(/m\.role = 'staff'/);
    expect(sql).toMatch(/pos_sales|pos_payments|pos_sessions/);
  });

  it("el guardián exige que denueveanueve tenga sus add-ons obligatorios", () => {
    expect(sql).toMatch(/GUARDIÁN BACKFILL ENTITLEMENTS/);
    expect(sql).toMatch(/sin los add-ons obligatorios/);
  });

  it("la nota de origen coincide con el port (rastro del alta por backfill)", () => {
    expect(sql).toContain("Backfill entitlements (arranque productización 2026-07-18)");
  });
});
