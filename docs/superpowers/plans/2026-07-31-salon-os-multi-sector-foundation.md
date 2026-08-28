# Salón OS Multi-Sector — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Salón OS into a multi-sector platform where each tenant has a fixed `sector` (peluqueria | odontologia | restauracion) chosen before login, a credential only accesses its contracted sector, and the app varies nav/terminology/branding by sector from a single codebase — without disrupting existing (hair) tenants.

**Architecture:** Add a per-tenant scalar `salons.sector`. Resolve it server-side in the `(dashboard)` layout and propagate to the client via a `SectorProvider` (clone of the existing `SalonFeaturesProvider`). A pure **sector registry** (`src/lib/sector/registry.ts`, modeled on `salon-feature-flags.ts`) declares per-sector terminology, nav set, and default branding. A pre-login picker chooses the sector (query param `?sector=`), and a guard rejects a credential whose tenant sector ≠ the chosen one. Domain engine (booking, TPV, RLS) is reused unchanged; variation is presentation + which nav modules show.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase (Postgres + RLS + SSR auth), Vitest + Testing Library, Tailwind + shadcn/ui, lucide-react.

## Global Constraints

- TypeScript **strict**; no `any`. `npx tsc --noEmit -p tsconfig.json` must stay green (exit 0).
- The existing test suite (**1235 tests, 81 files**) must stay green: `npx vitest run`.
- Migrations live in `supabase/migrations/`, timestamped `YYYYMMDDHHMMSS_*.sql`, idempotent where reasonable, and are applied to project `jztoyekixcziaicrnlce` via the Supabase Management API (token in `clients/projects/denueveanueve/.env` var `SUPABASE_API_TOKEN`; endpoint `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`, send a browser `User-Agent` to avoid the Cloudflare 1010 block).
- All new tables/columns carry `salon_id NOT NULL` and RLS scoped by `salon_id in (select app.user_salon_ids())`. This plan adds only ONE column (`salons.sector`); no new tables.
- Back-compat: `salons.sector` is `NOT NULL default 'peluqueria'` so existing tenants (denueveanueve, demo) are unaffected.
- Follow existing patterns: mirror `src/lib/salon-feature-flags.ts` + `src/components/providers/salon-features-provider.tsx` for the sector registry/provider. Do not restructure unrelated code.
- Work on branch `feature/salon-os-multi-sector` (already created). Commit frequently.
- All paths below are relative to `clients/projects/salon-os/` unless noted.
- Spec: `docs/superpowers/specs/2026-07-31-salon-os-multi-sector-odontologia-design.md`.

---

## File Structure

**Create:**
- `supabase/migrations/20260731100000_salon_sector.sql` — enum `salon_sector` + `salons.sector` column.
- `src/lib/sector/registry.ts` — `SalonSector`-keyed pure config (terminology, nav set, brand defaults) + helpers.
- `src/components/providers/sector-provider.tsx` — `SectorProvider` + `useSector()` / `useTerms()` (clone of features provider).
- `src/components/coming-soon.tsx` — shared "Próximamente" placeholder for unbuilt sector modules.
- `src/app/(dashboard)/proximamente/page.tsx` — route rendering the placeholder.
- `src/lib/auth/sector-login.ts` — pure guard: parse `?sector=` + chosen-vs-tenant mismatch message.
- `src/app/(auth)/login/sector-picker.tsx` — pre-login sector selection screen.
- `src/app/(auth)/login/actions.ts` — `resolveTenantSector()` server action.
- Tests: `src/tests/unit/sector-registry.test.ts`, `sector-provider.test.tsx`, `sector-login-guard.test.ts`, `dashboard-nav-items-sector.test.ts`.

**Modify:**
- `src/types/database.ts` — add `sector` to `salons` Row/Insert/Update + `Enums.salon_sector` + export `SalonSector`.
- `src/lib/salon.ts` — add `getActiveSalonSector()`; include `sector` in `getActiveSalon()` select.
- `src/app/(dashboard)/layout.tsx` — resolve sector, wrap tree in `SectorProvider`.
- `src/components/dashboard-nav-items.ts` — `buildDashboardNavItems` takes `sector`; filters/relabels via registry.
- `src/components/dashboard-nav.tsx` — read `useSector()`; pass to nav builder.
- `src/app/(auth)/login/page.tsx` — show picker when no `?sector`; render themed login when present.
- `src/app/(auth)/login/login-form.tsx` — accept `sector` prop; after sign-in, enforce the guard.
- `src/app/(dashboard)/ajustes/ajustes-nav.tsx` — relabel settings nav via registry.

---

## Task 1: `salon_sector` enum + `salons.sector` column

**Files:**
- Create: `supabase/migrations/20260731100000_salon_sector.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: DB enum `public.salon_sector` (`peluqueria|odontologia|restauracion`); column `public.salons.sector` (NOT NULL default `peluqueria`). TS: `SalonSector` union exported from `@/types/database`; `salons` row gains `sector: SalonSector`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260731100000_salon_sector.sql`:
```sql
-- Multi-sector: cada tenant tiene un sector fijo (peluqueria por defecto = back-compat).
begin;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'salon_sector') then
    create type public.salon_sector as enum ('peluqueria', 'odontologia', 'restauracion');
  end if;
end $$;

alter table public.salons
  add column if not exists sector public.salon_sector not null default 'peluqueria';

comment on column public.salons.sector is
  'Sector del tenant (peluqueria|odontologia|restauracion). Lo fija HAT3X al alta; determina nav/terminologia/modulos.';

commit;
```

- [ ] **Step 2: Apply the migration via the Management API**

Run (Git Bash, from repo root):
```bash
export MGMT_TOKEN=$(grep -E '^SUPABASE_API_TOKEN=' clients/projects/denueveanueve/.env | sed -E 's/^SUPABASE_API_TOKEN=//' | tr -d '"' | tr -d "\r" | xargs)
python - <<'PY'
import os,json,urllib.request,urllib.error
TOKEN=os.environ["MGMT_TOKEN"]; REF="jztoyekixcziaicrnlce"
URL=f"https://api.supabase.com/v1/projects/{REF}/database/query"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36"
def run(sql):
    req=urllib.request.Request(URL,data=json.dumps({"query":sql}).encode(),
      headers={"Authorization":f"Bearer {TOKEN}","Content-Type":"application/json","User-Agent":UA},method="POST")
    try:
        with urllib.request.urlopen(req) as r: return r.status,json.load(r)
    except urllib.error.HTTPError as e: return e.code,e.read().decode()
print(run(open("clients/projects/salon-os/supabase/migrations/20260731100000_salon_sector.sql",encoding="utf-8").read()))
print(run("select sector, count(*) from public.salons group by sector;"))
PY
```
Expected: first `(201, [])`; second shows all existing salons `sector='peluqueria'`.

- [ ] **Step 3: Mirror the type in `src/types/database.ts`**

Add `sector: SalonSector;` to `salons` Row, `sector?: SalonSector;` to Insert and Update. In `Enums` add `salon_sector: SalonSector;`. Near the exported unions (e.g. `SalonFeature`) add:
```ts
export type SalonSector = "peluqueria" | "odontologia" | "restauracion";
```

- [ ] **Step 4: Verify typecheck**

Run: `cd clients/projects/salon-os && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260731100000_salon_sector.sql clients/projects/salon-os/src/types/database.ts
git commit -m "feat(salon-os): add salons.sector (multi-sector base, default peluqueria)"
```

---

## Task 2: Sector registry (pure config)

**Files:**
- Create: `src/lib/sector/registry.ts`
- Test: `src/tests/unit/sector-registry.test.ts`

**Interfaces:**
- Consumes: `SalonSector` from `@/types/database`.
- Produces: `SectorTerms`, `SectorConfig`, `SECTOR_REGISTRY: Record<SalonSector, SectorConfig>`, `getSectorConfig(sector)`, `sectorTerms(sector): SectorTerms`, `SECTOR_ORDER: readonly SalonSector[]`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/sector-registry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  SECTOR_REGISTRY,
  SECTOR_ORDER,
  getSectorConfig,
  sectorTerms,
} from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

const ALL: SalonSector[] = ["peluqueria", "odontologia", "restauracion"];

describe("sector registry", () => {
  it("tiene una config por sector, con clave coherente", () => {
    for (const s of ALL) expect(SECTOR_REGISTRY[s].key).toBe(s);
  });
  it("peluqueria conserva la terminologia actual", () => {
    const t = sectorTerms("peluqueria");
    expect(t.customerPlural).toBe("Clientes");
    expect(t.servicePlural).toBe("Servicios");
    expect(t.professionalPlural).toBe("Personal");
  });
  it("odontologia relabela a Paciente/Tratamiento/Equipo", () => {
    const t = sectorTerms("odontologia");
    expect(t.customer).toBe("Paciente");
    expect(t.customerPlural).toBe("Pacientes");
    expect(t.service).toBe("Tratamiento");
    expect(t.professionalPlural).toBe("Equipo");
  });
  it("implemented: peluqueria y odontologia true, restauracion false", () => {
    expect(SECTOR_REGISTRY.peluqueria.implemented).toBe(true);
    expect(SECTOR_REGISTRY.odontologia.implemented).toBe(true);
    expect(SECTOR_REGISTRY.restauracion.implemented).toBe(false);
  });
  it("SECTOR_ORDER lista los 3 sectores", () => {
    expect([...SECTOR_ORDER].sort()).toEqual([...ALL].sort());
  });
  it("getSectorConfig devuelve la config", () => {
    expect(getSectorConfig("odontologia").brandName).toBe("Clínica OS");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/sector-registry.test.ts`
Expected: FAIL (module `@/lib/sector/registry` not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/sector/registry.ts`:
```ts
/**
 * Registro de sector (config PURA, isomórfica) — molde: `@/lib/salon-feature-flags`.
 * Fuente única de labels transversales, marca por defecto y estado de implementación.
 */
import type { SalonSector } from "@/types/database";

export interface SectorTerms {
  customer: string;
  customerPlural: string;
  service: string;
  servicePlural: string;
  professional: string;
  professionalPlural: string;
}

export interface SectorConfig {
  key: SalonSector;
  label: string;      // nombre del sector para el picker
  brandName: string;  // wordmark de la app en ese sector
  defaultPrimary: string; // #rrggbb; el salon_branding del tenant tiene prioridad
  implemented: boolean;   // false = cascarón "Próximamente"
  terms: SectorTerms;
}

export const SECTOR_REGISTRY: Record<SalonSector, SectorConfig> = {
  peluqueria: {
    key: "peluqueria",
    label: "Peluquería",
    brandName: "Salón OS",
    defaultPrimary: "#7c3aed",
    implemented: true,
    terms: {
      customer: "Cliente", customerPlural: "Clientes",
      service: "Servicio", servicePlural: "Servicios",
      professional: "Profesional", professionalPlural: "Personal",
    },
  },
  odontologia: {
    key: "odontologia",
    label: "Odontología",
    brandName: "Clínica OS",
    defaultPrimary: "#0f766e",
    implemented: true,
    terms: {
      customer: "Paciente", customerPlural: "Pacientes",
      service: "Tratamiento", servicePlural: "Tratamientos",
      professional: "Dentista", professionalPlural: "Equipo",
    },
  },
  restauracion: {
    key: "restauracion",
    label: "Restauración",
    brandName: "Restau OS",
    defaultPrimary: "#c2410c",
    implemented: false,
    terms: {
      customer: "Cliente", customerPlural: "Clientes",
      service: "Producto", servicePlural: "Carta",
      professional: "Empleado", professionalPlural: "Equipo",
    },
  },
};

export const SECTOR_ORDER: readonly SalonSector[] = [
  "peluqueria", "odontologia", "restauracion",
];

export function getSectorConfig(sector: SalonSector): SectorConfig {
  return SECTOR_REGISTRY[sector];
}

export function sectorTerms(sector: SalonSector): SectorTerms {
  return SECTOR_REGISTRY[sector].terms;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/sector-registry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/sector/registry.ts clients/projects/salon-os/src/tests/unit/sector-registry.test.ts
git commit -m "feat(salon-os): sector registry (terminology/brand per sector)"
```

---

## Task 3: Resolve sector server-side (`src/lib/salon.ts`)

**Files:**
- Modify: `src/lib/salon.ts`

**Interfaces:**
- Consumes: existing `getActiveSalon()`, `SalonSector`.
- Produces: `getActiveSalonSector(): Promise<SalonSector | null>`; `getActiveSalon()` result includes `sector: SalonSector`.

- [ ] **Step 1: Read `getActiveSalon`**

Read `src/lib/salon.ts` around `getActiveSalon`; confirm the `.select("id, name, slug, timezone, ...")` and the returned shape.

- [ ] **Step 2: Add `sector` to the select and `getActiveSalonSector`**

Extend the `getActiveSalon()` select to include `sector`; add `sector` (typed `SalonSector`) to the returned object. Add:
```ts
/** Sector del salón activo (o null si no hay salón). */
export async function getActiveSalonSector(): Promise<SalonSector | null> {
  const salon = await getActiveSalon();
  return salon?.sector ?? null;
}
```
Import `SalonSector` from `@/types/database`.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add clients/projects/salon-os/src/lib/salon.ts
git commit -m "feat(salon-os): resolve active salon sector server-side"
```

---

## Task 4: SectorProvider + hooks

**Files:**
- Create: `src/components/providers/sector-provider.tsx`
- Test: `src/tests/unit/sector-provider.test.tsx`

**Interfaces:**
- Consumes: `SalonSector`, `sectorTerms`, `SectorTerms`.
- Produces: `<SectorProvider sector={SalonSector}>`; `useSector(): SalonSector`; `useTerms(): SectorTerms`. Default (no provider) = `"peluqueria"`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/sector-provider.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectorProvider, useSector, useTerms } from "@/components/providers/sector-provider";

function Probe(): React.ReactElement {
  return <span>{`${useSector()}:${useTerms().customerPlural}`}</span>;
}

describe("SectorProvider", () => {
  it("propaga el sector y su terminologia", () => {
    render(<SectorProvider sector="odontologia"><Probe /></SectorProvider>);
    expect(screen.getByText("odontologia:Pacientes")).toBeInTheDocument();
  });
  it("sin provider cae a peluqueria (back-compat)", () => {
    render(<Probe />);
    expect(screen.getByText("peluqueria:Clientes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/sector-provider.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/providers/sector-provider.tsx`:
```tsx
"use client";

import { createContext, useContext, useMemo } from "react";

import { sectorTerms, type SectorTerms } from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

interface SectorContextValue {
  sector: SalonSector;
  terms: SectorTerms;
}

const DEFAULT: SectorContextValue = {
  sector: "peluqueria",
  terms: sectorTerms("peluqueria"),
};

const SectorContext = createContext<SectorContextValue>(DEFAULT);

export function SectorProvider({
  sector,
  children,
}: {
  sector: SalonSector;
  children: React.ReactNode;
}): React.ReactElement {
  const value = useMemo<SectorContextValue>(
    () => ({ sector, terms: sectorTerms(sector) }),
    [sector],
  );
  return <SectorContext.Provider value={value}>{children}</SectorContext.Provider>;
}

export function useSector(): SalonSector {
  return useContext(SectorContext).sector;
}

export function useTerms(): SectorTerms {
  return useContext(SectorContext).terms;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/sector-provider.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/providers/sector-provider.tsx clients/projects/salon-os/src/tests/unit/sector-provider.test.tsx
git commit -m "feat(salon-os): SectorProvider + useSector/useTerms"
```

---

## Task 5: Sector-aware nav items

**Files:**
- Modify: `src/components/dashboard-nav-items.ts`
- Test: `src/tests/unit/dashboard-nav-items-sector.test.ts`

**Interfaces:**
- Consumes: existing `buildDashboardNavItems({ showSettings, hasPos })`, `SECTOR_REGISTRY`, `SalonSector`, existing `NavItem`/`SETTINGS_ITEM`.
- Produces: `buildDashboardNavItems({ showSettings, hasPos, sector? })` (default `sector="peluqueria"`). odontologia relabels the `/customers` item to `terms.customerPlural`; a non-implemented sector returns `[Panel, {href:"/proximamente", label:"Próximamente"}, SETTINGS_ITEM?]`. Peluquería output is byte-identical to today.

- [ ] **Step 1: Read the module**

Read `src/components/dashboard-nav-items.ts`: `NavItem` shape, `PRIMARY_NAV_ITEMS`, `SETTINGS_ITEM`, the `/customers` item, current icon imports, and `buildDashboardNavItems` signature.

- [ ] **Step 2: Write the failing test**

Create `src/tests/unit/dashboard-nav-items-sector.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildDashboardNavItems } from "@/components/dashboard-nav-items";

describe("buildDashboardNavItems — por sector", () => {
  it("peluqueria: 'Clientes' sin cambios", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "peluqueria" });
    expect(items.some((i) => i.label === "Clientes")).toBe(true);
    expect(items.some((i) => i.label === "Pacientes")).toBe(false);
  });
  it("odontologia: 'Clientes' → 'Pacientes'", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "odontologia" });
    expect(items.some((i) => i.label === "Pacientes")).toBe(true);
    expect(items.some((i) => i.label === "Clientes")).toBe(false);
  });
  it("restauracion (cascaron): item 'Próximamente'", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
    expect(items.some((i) => i.label === "Próximamente")).toBe(true);
    expect(items.some((i) => i.href === "/proximamente")).toBe(true);
  });
  it("sin sector = peluqueria", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true });
    expect(items.some((i) => i.label === "Clientes")).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-sector.test.ts`
Expected: FAIL.

- [ ] **Step 4: Extend `buildDashboardNavItems`**

Import `Clock` from `lucide-react`, `SECTOR_REGISTRY` from `@/lib/sector/registry`, `SalonSector` from `@/types/database`. Change the param type to `{ showSettings: boolean; hasPos: boolean; sector?: SalonSector }` with `sector = "peluqueria"` default. Keep the existing list building. Then, before returning:
```ts
const config = SECTOR_REGISTRY[sector];
if (!config.implemented) {
  const panel = items[0]; // the "Panel" item (first) — keep it
  return [
    panel,
    { href: "/proximamente", label: "Próximamente", icon: Clock },
    ...(showSettings ? [SETTINGS_ITEM] : []),
  ];
}
if (sector === "peluqueria") return items; // byte-identical
return items.map((item) =>
  item.href === "/customers"
    ? { ...item, label: config.terms.customerPlural }
    : item,
);
```
(Adjust `panel` selection to the actual "Panel" item if it isn't index 0.)

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-sector.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts clients/projects/salon-os/src/tests/unit/dashboard-nav-items-sector.test.ts
git commit -m "feat(salon-os): sector-aware dashboard nav (relabel + shell)"
```

---

## Task 6: Wire sector into the dashboard shell

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`, `src/components/dashboard-nav.tsx`

**Interfaces:**
- Consumes: `getActiveSalonSector()`, `SectorProvider`, `useSector()`, `buildDashboardNavItems({..., sector})`.
- Produces: client tree wrapped in `<SectorProvider sector>`; `DashboardNav` passes `useSector()` into the nav builder.

- [ ] **Step 1: Resolve sector in the layout**

In `src/app/(dashboard)/layout.tsx`: add `getActiveSalonSector()` to the existing `Promise.all([...])`; wrap the current children (inside `SalonFeaturesProvider`) with `<SectorProvider sector={sector ?? "peluqueria"}>`. Import `SectorProvider` and `getActiveSalonSector`.

- [ ] **Step 2: Read sector in the nav**

In `src/components/dashboard-nav.tsx`: import `useSector`; pass `sector` into `buildDashboardNavItems({ showSettings, hasPos, sector })`.

- [ ] **Step 3: Verify typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; ALL tests pass (1235 + new).

- [ ] **Step 4: Manual smoke**

With a dev server running: `curl -s -o /dev/null -w "%{http_code}\n" --max-time 45 http://localhost:3000/dashboard`
Expected: `307`, no compile error in dev output.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/app/\(dashboard\)/layout.tsx clients/projects/salon-os/src/components/dashboard-nav.tsx
git commit -m "feat(salon-os): plumb sector through the dashboard shell"
```

---

## Task 7: Pre-login sector guard (pure)

**Files:**
- Create: `src/lib/auth/sector-login.ts`
- Test: `src/tests/unit/sector-login-guard.test.ts`

**Interfaces:**
- Consumes: `SalonSector`, `SECTOR_REGISTRY`.
- Produces: `parseSectorParam(raw: string | null | undefined): SalonSector | null`; `sectorMismatchMessage(chosen: SalonSector, tenant: SalonSector): string | null`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/sector-login-guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSectorParam, sectorMismatchMessage } from "@/lib/auth/sector-login";

describe("parseSectorParam", () => {
  it("acepta los tres sectores válidos", () => {
    expect(parseSectorParam("odontologia")).toBe("odontologia");
    expect(parseSectorParam("peluqueria")).toBe("peluqueria");
    expect(parseSectorParam("restauracion")).toBe("restauracion");
  });
  it("rechaza basura / vacío / null", () => {
    expect(parseSectorParam("dentista")).toBeNull();
    expect(parseSectorParam("")).toBeNull();
    expect(parseSectorParam(null)).toBeNull();
    expect(parseSectorParam(undefined)).toBeNull();
  });
});

describe("sectorMismatchMessage", () => {
  it("null cuando coincide", () => {
    expect(sectorMismatchMessage("odontologia", "odontologia")).toBeNull();
  });
  it("mensaje legible cuando no coincide (nombra ambos)", () => {
    const msg = sectorMismatchMessage("odontologia", "peluqueria");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Peluquería");
    expect(msg).toContain("Odontología");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/sector-login-guard.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/sector-login.ts`:
```ts
/**
 * Guard de sector para el login (pura). Una credencial pertenece a UN tenant y por
 * tanto a UN sector; si el usuario eligió otro sector en el picker, se rechaza con
 * mensaje legible. El aislamiento real lo da la RLS; esto es coherencia de UX.
 */
import { SECTOR_REGISTRY } from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

const VALID: readonly SalonSector[] = ["peluqueria", "odontologia", "restauracion"];

export function parseSectorParam(raw: string | null | undefined): SalonSector | null {
  return typeof raw === "string" && (VALID as readonly string[]).includes(raw)
    ? (raw as SalonSector)
    : null;
}

export function sectorMismatchMessage(
  chosen: SalonSector,
  tenant: SalonSector,
): string | null {
  if (chosen === tenant) return null;
  return (
    `Estas credenciales son del sector ${SECTOR_REGISTRY[tenant].label}, ` +
    `no de ${SECTOR_REGISTRY[chosen].label}. Elige el sector correcto para entrar.`
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/sector-login-guard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/auth/sector-login.ts clients/projects/salon-os/src/tests/unit/sector-login-guard.test.ts
git commit -m "feat(salon-os): pure pre-login sector guard (parse + mismatch)"
```

---

## Task 8: Pre-login sector picker + login enforcement

**Files:**
- Create: `src/app/(auth)/login/sector-picker.tsx`, `src/app/(auth)/login/actions.ts`
- Modify: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `SECTOR_ORDER`, `SECTOR_REGISTRY`, `parseSectorParam`, `sectorMismatchMessage`, `getActiveSalonSector`.
- Produces: `resolveTenantSector(): Promise<SalonSector | null>` (server action); `/login` → picker; `/login?sector=<x>` → themed form; sign-in rejects on mismatch.

- [ ] **Step 1: Server action**

Create `src/app/(auth)/login/actions.ts`:
```ts
"use server";
import { getActiveSalonSector } from "@/lib/salon";
import type { SalonSector } from "@/types/database";
export async function resolveTenantSector(): Promise<SalonSector | null> {
  return getActiveSalonSector();
}
```

- [ ] **Step 2: Sector picker**

Create `src/app/(auth)/login/sector-picker.tsx` (server component): map `SECTOR_ORDER` → cards using `SECTOR_REGISTRY[s]` (label + brandName), each an `<a href={\`/login?sector=${s}\`}>`. Use a lucide icon per sector (e.g. `Scissors`, `Stethoscope`/`Activity`, `UtensilsCrossed`).

- [ ] **Step 3: Branch the login page**

Modify `src/app/(auth)/login/page.tsx`: read `searchParams?.sector`, `parseSectorParam` it. If null → render `<SectorPicker/>`. If valid → render `<LoginForm sector={sector} />`.

- [ ] **Step 4: Enforce the guard in the form**

Modify `src/app/(auth)/login/login-form.tsx`: add prop `sector: SalonSector`; theme the header brand from `SECTOR_REGISTRY[sector]` (brandName + icon). After a successful `signInWithPassword`:
```ts
const tenantSector = await resolveTenantSector();
const mismatch = tenantSector ? sectorMismatchMessage(sector, tenantSector) : null;
if (mismatch !== null) {
  await supabase.auth.signOut();
  setError(mismatch);
  setIsLoading(false);
  return;
}
const next = searchParams.get("next") ?? "/dashboard";
router.push(next);
router.refresh();
```
Import `resolveTenantSector` from `./actions`, `sectorMismatchMessage` from `@/lib/auth/sector-login`, `SECTOR_REGISTRY` from `@/lib/sector/registry`.

- [ ] **Step 5: Verify typecheck + suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 6: Manual smoke**

```bash
curl -s -o /dev/null -w "picker %{http_code}\n" --max-time 40 "http://localhost:3000/login"
curl -s -o /dev/null -w "themed %{http_code}\n" --max-time 40 "http://localhost:3000/login?sector=odontologia"
```
Expected: both `200`; no compile errors.

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/src/app/\(auth\)/login/
git commit -m "feat(salon-os): pre-login sector picker + tenant-sector guard on login"
```

---

## Task 9: Coming-soon shell + settings-nav terminology

**Files:**
- Create: `src/components/coming-soon.tsx`, `src/app/(dashboard)/proximamente/page.tsx`
- Modify: `src/app/(dashboard)/ajustes/ajustes-nav.tsx`

**Interfaces:**
- Consumes: `useTerms()`.
- Produces: `<ComingSoon/>`; `/proximamente` route; settings nav "Servicios"/"Personal" relabeled via `useTerms()`.

- [ ] **Step 1: Coming-soon component**

Create `src/components/coming-soon.tsx` — centered card: title "Próximamente", subtitle "Este módulo aún no está disponible para tu sector." Pure presentational (no props required).

- [ ] **Step 2: Route**

Create `src/app/(dashboard)/proximamente/page.tsx` rendering `<ComingSoon/>`.

- [ ] **Step 3: Relabel settings nav**

Modify `src/app/(dashboard)/ajustes/ajustes-nav.tsx` (client component): `const terms = useTerms();` and replace the hardcoded "Servicios"/"Personal" labels with `terms.servicePlural`/`terms.professionalPlural`. Leave the rest.

- [ ] **Step 4: Verify typecheck + suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/coming-soon.tsx clients/projects/salon-os/src/app/\(dashboard\)/proximamente/ clients/projects/salon-os/src/app/\(dashboard\)/ajustes/ajustes-nav.tsx
git commit -m "feat(salon-os): coming-soon shell + sector terminology in settings nav"
```

---

## Task 10: Demo odontología tenant + end-to-end verification

**Files:**
- Optional: `clients/projects/salon-os/scripts/` (a one-off to set a demo tenant's sector).

**Interfaces:**
- Consumes: Management API, running dev server.

- [ ] **Step 1: Label a demo odontología tenant**

Via the Management API (same helper as Task 1), create or repurpose a throwaway demo salon and set `sector='odontologia'`. Minimal (if a `demo-dental` salon exists): `update public.salons set sector='odontologia' where slug='demo-dental' returning id, slug, sector;`. NEVER touch `denueveanueve` or the peluquería `demo`.

- [ ] **Step 2: Full typecheck + suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; ALL tests green (1235 + the ~16 new from this plan).

- [ ] **Step 3: End-to-end smoke (manual)**

- `/login` shows the 3 sector cards.
- `/login?sector=odontologia` shows the themed login (brand "Clínica OS").
- Peluquería demo (`demo`/`DemoSalon2026!`) via `?sector=peluqueria` → dashboard unchanged ("Clientes"/"Servicios").
- Peluquería demo via `?sector=odontologia` → rejected with the mismatch message.
- Dental demo via `?sector=odontologia` → nav shows "Pacientes"/"Tratamientos".

- [ ] **Step 4: Commit (if scripts changed)**

```bash
git add -A clients/projects/salon-os/scripts/
git commit -m "chore(salon-os): demo odontologia tenant for multi-sector"
```

---

## Self-Review (author checklist — completed)

- **Spec coverage:** §4.1→T1; §4.2→T3,T7,T8; §4.3→T8; §4.4→T2; §4.5→T4,T5,T6,T9; §4.6→T2 (defaultPrimary; deeper theming reuses existing `SalonBrandStyle`, out of this plan); §10 restauración shell→T5,T9; §12 back-compat→T1 default + T10; §13 tests→every task is TDD. Deep odontología (§5.1, §6–§9) is intentionally OUT (subsequent plans).
- **Placeholders:** none — every step has concrete code/commands. ("Próximamente" is a product placeholder, not a plan gap.)
- **Type consistency:** `SalonSector`, `SectorTerms`, `SectorConfig`, `SECTOR_REGISTRY`, `getSectorConfig`, `sectorTerms`, `SECTOR_ORDER`, `SectorProvider`/`useSector`/`useTerms`, `getActiveSalonSector`, `parseSectorParam`/`sectorMismatchMessage`, `resolveTenantSector`, `buildDashboardNavItems({ showSettings, hasPos, sector })` used consistently across tasks.

## Next plans (separate documents)

- Plan 2 — Dental clinical core: `clinical_records`, `visit_notes`, odontograma (FDI + findings event-sourced + chart UI). (Spec §5.1, §6.1–§6.2)
- Plan 3 — Periodontograma + evolutivo. (Spec §6.3–§6.4)
- Plan 4 — Planes de tratamiento / presupuestos + odontograma↔factura. (Spec §7)
- Plan 5 — Consentimientos + imágenes. (Spec §8)
