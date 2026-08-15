# Salón OS Odontología — Odontograma Core Implementation Plan (Fase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dental clinical core of Salón OS on top of the multi-sector foundation (Plan 1): make sectors visibly distinct by wiring the sector default brand color, add the patient clinical file (`clinical_records` + `visit_notes` with signed-immutability), add the event-sourced `odontogram_findings` table, and ship a clickable FDI odontogram chart that colors teeth/surfaces by state (red = pending/pathological, blue = done/existing-good) — all gated to `sector = 'odontologia'` with defense-in-depth on every dental route, and zero change for hair (`peluqueria`) tenants.

**Architecture:** Reuse the existing `customers` table as **patients** (relabel already done in Plan 1). Add three new tenant-isolated tables (`clinical_records` 1:1 with customers, `visit_notes`, `odontogram_findings`) that follow the house pattern verbatim: `salon_id NOT NULL`, composite FK `(patient_id, salon_id) → customers(id, salon_id)`, RLS scoped by `app.user_salon_ids()`, role gate via `app.has_salon_role()` for writes, `app.set_updated_at()` trigger, an in-migration assertion guard, and — for signed notes — an immutability trigger modeled on the old `app.prevent_pos_invoice_mutation()`. The odontogram is **event-sourced**: findings carry `detected_at`/`resolved_at`, `state × condition` drives color (orthogonal to `type`), and color/tooth logic lives in **pure, unit-tested modules** (`src/lib/odontogram/*`). The sector default color plugs into the existing `SalonBrandStyle` / `resolveBrandTheme` white-label layer (tenant `salon_branding` still wins). Dental UI mounts on the patient detail page and at a new `/odontograma` route, both sector-gated in the server and hidden from nav unless `odontologia`.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase (Postgres + RLS + SSR auth), TanStack Query v5, Vitest + Testing Library, Tailwind + shadcn/ui, lucide-react, Zod.

## Global Constraints

- TypeScript **strict**; no `any`. `npx tsc --noEmit -p tsconfig.json` must stay green (exit 0).
- The existing test suite (**1251 tests**) must stay green: `npx vitest run`. Every task here is TDD (failing test → run → implement → pass → commit) with COMPLETE code in every step — no placeholders (`TODO`, "add validation", "similar to Task N").
- Migrations live in `supabase/migrations/`, timestamped `YYYYMMDDHHMMSS_*.sql` **strictly after `20260731100000`** (Plan 1's `salon_sector`). This plan uses `20260731110000`, `20260731120000`, `20260731130000`. They are applied to project `jztoyekixcziaicrnlce` via the Supabase Management API:
  - token in `clients/projects/denueveanueve/.env` var `SUPABASE_API_TOKEN`;
  - endpoint `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`;
  - send a browser `User-Agent` (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36`) to avoid the Cloudflare **1010** block.
- **Every new table** carries: `salon_id uuid NOT NULL references public.salons(id) on delete cascade`; composite FK `(patient_id, salon_id) → public.customers(id, salon_id)` (the `customers_id_salon_key` unique already exists, mig. `20260712120000`); RLS enabled with `SELECT`/`INSERT` policies `salon_id in (select app.user_salon_ids())`; a **role gate** on writes via `app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[])` (staff+); and an in-migration assertion guard (DO block) modeled on `20260716120000_loyalty_base.sql` §6.
- The app is a **nested git repo** at `clients/projects/salon-os/` on branch **`hat3x/HAT3X-035`**. Commit there; **do NOT create branches**.
- Follow existing patterns exactly: migration prose style of `20260718100000_salon_features.sql`; composite FK + RLS of `20260716120000_loyalty_base.sql`; immutability trigger of `20260714100000_verifactu_invoices.sql`; data-access slice of `queries/customers.ts` + `actions.ts` + `hooks/use-customers.ts` + `validations/customer.ts`; theming via `src/lib/salon-branding/{branding,theme}.ts` + `SalonBrandStyle`. Do not restructure unrelated code.
- All paths below are relative to `clients/projects/salon-os/` unless noted.
- Spec: `docs/superpowers/specs/2026-07-31-salon-os-multi-sector-odontologia-design.md` (§5.1, §6.1, §6.2, §9, §11, §14).

---

## File Structure

**Create:**
- `src/lib/salon-branding/sector-brand.ts` — pure: `GLOBAL_DEFAULT_PRIMARY`, `sectorDefaultBranding()`, `resolveEffectiveBranding()`.
- `supabase/migrations/20260731110000_clinical_records.sql` — `clinical_records` table + RLS + guard.
- `supabase/migrations/20260731120000_visit_notes.sql` — `visit_notes` table + signed-immutability trigger + RLS + guard.
- `supabase/migrations/20260731130000_odontogram_findings.sql` — enums + `odontogram_findings` table + RLS + guard.
- `src/lib/odontogram/tooth.ts` — pure FDI tooth model (quadrant/position/dentition/arch/side, surface labels).
- `src/lib/odontogram/color.ts` — pure finding→color (state×condition, red/blue), config-driven.
- `src/lib/odontogram/catalog.ts` — pure finding-type catalog (label + default state/condition + per-surface).
- `src/lib/validations/clinical-record.ts`, `src/lib/validations/visit-note.ts`, `src/lib/validations/odontogram-finding.ts` — Zod schemas.
- `src/lib/queries/clinical-records.ts`, `src/lib/queries/visit-notes.ts`, `src/lib/queries/odontogram-findings.ts` — client fetchers + query keys.
- `src/app/(dashboard)/customers/[id]/dental/actions.ts` — server actions (clinical record upsert, visit notes add/sign, findings add/delete/resolve).
- `src/hooks/use-clinical-record.ts`, `src/hooks/use-visit-notes.ts`, `src/hooks/use-odontogram.ts` — TanStack Query hooks.
- `src/app/(dashboard)/customers/[id]/dental/clinical-record-card.tsx`, `visit-notes-card.tsx`, `dental-section.tsx` — patient-page dental UI.
- `src/components/odontogram/odontogram-chart.tsx` — clickable FDI chart (client, presentational).
- `src/app/(dashboard)/odontograma/page.tsx`, `odontograma-view.tsx`, `patient-picker.tsx` — the `/odontograma` route (sector-gated).
- Tests: `src/tests/unit/sector-brand.test.ts`, `odontogram-tooth.test.ts`, `odontogram-color.test.ts`, `odontogram-catalog.test.ts`, `odontogram-finding-validation.test.ts`, `odontogram-chart.test.tsx`, `dashboard-nav-items-odontograma.test.ts`.

**Modify:**
- `src/types/database.ts` — add `clinical_records`, `visit_notes`, `odontogram_findings` to `Tables`; add the 4 new enums to `Enums`; export unions `ToothSurface`, `OdontogramFindingType`, `OdontogramFindingState`, `OdontogramFindingCondition`; export aliases `ClinicalRecord`, `VisitNote`, `OdontogramFinding`.
- `src/app/(dashboard)/layout.tsx` — pass `resolveEffectiveBranding(branding, sector)` to `SalonBrandStyle`.
- `src/app/(dashboard)/customers/[id]/page.tsx` — resolve sector; pass `dentalEnabled` to the view.
- `src/app/(dashboard)/customers/[id]/customer-detail-view.tsx` — render `<DentalSection>` + Odontograma link when `dentalEnabled`.
- `src/components/dashboard-nav-items.ts` — add an "Odontograma" item for `odontologia`.

---

## Task 1: Sector default brand color

Makes odontología (teal `#0f766e`) visibly differ from peluquería (violet `#7c3aed`) when the tenant has no `salon_branding`. Tenant white-label still wins; peluquería stays byte-identical to today.

**Files:**
- Create: `src/lib/salon-branding/sector-brand.ts`, `src/tests/unit/sector-brand.test.ts`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `SalonBranding`, `SalonSector` from `@/types/database`; `SECTOR_REGISTRY` from `@/lib/sector/registry`.
- Produces: `GLOBAL_DEFAULT_PRIMARY: string`; `sectorDefaultBranding(sector): SalonBranding | null`; `resolveEffectiveBranding(branding, sector): SalonBranding | null`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/sector-brand.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  GLOBAL_DEFAULT_PRIMARY,
  sectorDefaultBranding,
  resolveEffectiveBranding,
} from "@/lib/salon-branding/sector-brand";
import type { SalonBranding } from "@/types/database";

const tenant: SalonBranding = {
  salon_id: "s1",
  logo_url: null,
  primary_color: "#ff0000",
  secondary_color: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("sector default branding", () => {
  it("peluqueria sin marca => null (conserva el default global, byte-idéntico)", () => {
    expect(sectorDefaultBranding("peluqueria")).toBeNull();
    expect(resolveEffectiveBranding(null, "peluqueria")).toBeNull();
  });
  it("GLOBAL_DEFAULT_PRIMARY es el violeta del tema por defecto", () => {
    expect(GLOBAL_DEFAULT_PRIMARY).toBe("#7c3aed");
  });
  it("odontologia sin marca => branding sintético con el teal del registro", () => {
    const b = resolveEffectiveBranding(null, "odontologia");
    expect(b).not.toBeNull();
    expect(b?.primary_color).toBe("#0f766e");
    expect(b?.logo_url).toBeNull();
    expect(b?.secondary_color).toBeNull();
  });
  it("restauracion sin marca => branding sintético (naranja del registro)", () => {
    expect(resolveEffectiveBranding(null, "restauracion")?.primary_color).toBe("#c2410c");
  });
  it("el salon_branding del tenant SIEMPRE gana (white-label), en cualquier sector", () => {
    expect(resolveEffectiveBranding(tenant, "odontologia")).toBe(tenant);
    expect(resolveEffectiveBranding(tenant, "peluqueria")).toBe(tenant);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/sector-brand.test.ts`
Expected: FAIL (module `@/lib/salon-branding/sector-brand` not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/salon-branding/sector-brand.ts`:
```ts
/**
 * Marca por sector — DEFAULT de color cuando el tenant no ha personalizado su marca.
 *
 * El white-label del tenant (`salon_branding`) SIEMPRE tiene prioridad; esto solo
 * decide el color por DEFECTO cuando aún no hay fila. Peluquería usa el mismo violeta
 * que hoy define `globals.css` (`--primary: 262 83% 58%` = #7c3aed), así que para ese
 * sector devolvemos `null` (no inyectamos nada ⇒ el aspecto de hoy queda intacto,
 * byte-idéntico). Los demás sectores sintetizan una fila de marca con su `defaultPrimary`
 * del registro, que `resolveBrandTheme` traduce a los tokens del panel.
 */
import { SECTOR_REGISTRY } from "@/lib/sector/registry";
import type { SalonBranding, SalonSector } from "@/types/database";

/** Color primario del tema por defecto de `globals.css` (violeta). Espejo de `--primary`. */
export const GLOBAL_DEFAULT_PRIMARY = "#7c3aed";

/**
 * Fila de marca SINTÉTICA con el color por defecto del sector, o `null` cuando ese
 * color coincide con el default global (⇒ no hay nada que inyectar; manda `globals.css`).
 */
export function sectorDefaultBranding(sector: SalonSector): SalonBranding | null {
  const primary = SECTOR_REGISTRY[sector].defaultPrimary;
  if (primary.toLowerCase() === GLOBAL_DEFAULT_PRIMARY) return null;
  return {
    salon_id: "",
    logo_url: null,
    primary_color: primary,
    secondary_color: null,
    created_at: "",
    updated_at: "",
  };
}

/**
 * Marca EFECTIVA a pintar: la del tenant si existe (white-label gana), o el default del
 * sector en su defecto. `null` ⇒ el layout no inyecta nada y manda el tema por defecto.
 */
export function resolveEffectiveBranding(
  branding: SalonBranding | null,
  sector: SalonSector,
): SalonBranding | null {
  return branding ?? sectorDefaultBranding(sector);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/sector-brand.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire it into the dashboard layout**

In `src/app/(dashboard)/layout.tsx`: import `resolveEffectiveBranding` from `@/lib/salon-branding/sector-brand`; after `const sector = salon?.sector ?? "peluqueria";` add `const effectiveBranding = resolveEffectiveBranding(branding, sector);` and change the style tag to `<SalonBrandStyle branding={effectiveBranding} />`. Leave `buildLogoSrc(branding)` on the real `branding` (the synthetic has no logo).

- [ ] **Step 6: Verify typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass (1251 + 5).

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/src/lib/salon-branding/sector-brand.ts \
        clients/projects/salon-os/src/tests/unit/sector-brand.test.ts \
        clients/projects/salon-os/src/app/\(dashboard\)/layout.tsx
git commit -m "feat(salon-os): sector default brand color (teal for odontologia; peluqueria unchanged)"
```

---

## Task 2: `clinical_records` table

**Files:**
- Create: `supabase/migrations/20260731110000_clinical_records.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `public.clinical_records` (1:1 with customers). TS: `ClinicalRecord = Tables<"clinical_records">`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260731110000_clinical_records.sql`:
```sql
-- =============================================================================
-- salon-os — Migración: ficha clínica (clinical_records) — vertical odontología
--
-- Extensión clínica 1:1 del paciente (== customers). Se modela como TABLA aparte
-- (no columnas en customers) porque solo aplica a odontología y agrupa datos
-- clínicos estructurados (antecedentes, alergias, medicación, hábitos) para
-- alertas cross-paciente. Sigue el patrón de la casa: salon_id NOT NULL, FK
-- COMPUESTA (patient_id, salon_id) → customers(id, salon_id), RLS por miembro,
-- escritura con gate de rol (staff+), updated_at automático y guardián de aserción.
-- Aditiva, sin backfill (los tenants de peluquería simplemente no crean filas aquí).
-- =============================================================================

begin;

create table public.clinical_records (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null references public.salons (id) on delete cascade,
  patient_id       uuid not null,
  -- Antecedentes / alergias / medicación / hábitos: JSONB estructurado (v1 libre;
  -- las alertas cross-paciente lo consumen en un plan posterior).
  medical_history  jsonb not null default '{}'::jsonb,
  allergies        jsonb not null default '[]'::jsonb,
  medications      jsonb not null default '[]'::jsonb,
  habits           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- 1:1 con el paciente por salón (ancla del upsert de la ficha).
  constraint clinical_records_patient_key unique (salon_id, patient_id),
  -- FK compuesta anti cross-tenant: el paciente pertenece al mismo salón.
  constraint clinical_records_patient_id_fkey
    foreign key (patient_id, salon_id)
    references public.customers (id, salon_id) on delete cascade
);

comment on table public.clinical_records is
  'Ficha clínica del paciente (odontología): 1:1 con customers. Antecedentes/alergias/medicación/hábitos en JSONB. RLS por salón; escritura staff+.';

create trigger trg_clinical_records_updated_at
  before update on public.clinical_records
  for each row execute function app.set_updated_at();

-- RLS: lectura para miembros; alta/edición para staff+ (owner/manager/staff).
alter table public.clinical_records enable row level security;

create policy "members_select_clinical_records"
  on public.clinical_records for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "staff_insert_clinical_records"
  on public.clinical_records for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]));

create policy "staff_update_clinical_records"
  on public.clinical_records for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]));

create policy "owners_delete_clinical_records"
  on public.clinical_records for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- Guardián de aislamiento (defensa en profundidad — patrón de loyalty_base §6).
do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='clinical_records' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN ODONTO: clinical_records sin RLS habilitada' using errcode='raise_exception';
  end if;

  select count(*) into _cnt from pg_policies
    where schemaname='public' and tablename='clinical_records'
      and cmd in ('SELECT','ALL') and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN ODONTO: clinical_records sin SELECT acotado por app.user_salon_ids()' using errcode='raise_exception';
  end if;

  select count(*) into _cnt from pg_policies
    where schemaname='public' and tablename='clinical_records'
      and (roles && array['anon','public']::name[]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN ODONTO: clinical_records expuesta a anon/public' using errcode='raise_exception';
  end if;

  raise notice 'GUARDIÁN ODONTO: clinical_records verificada (RLS, SELECT acotado, nada a anon/public).';
end;
$guard$;

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
print(run(open("clients/projects/salon-os/supabase/migrations/20260731110000_clinical_records.sql",encoding="utf-8").read()))
print(run("select count(*) from public.clinical_records;"))
print(run("select polname, cmd from pg_policies where tablename='clinical_records' order by polname;"))
PY
```
Expected: first prints `(201, [])` (and the guard `notice`); the count query `(200, [{'count': 0}])`; the policies query lists the 4 policies.

- [ ] **Step 3: Mirror the type in `src/types/database.ts`**

In the `Tables` block (alphabetical-ish, near `customers`) add:
```ts
      clinical_records: {
        Row: {
          id: string;
          salon_id: string;
          patient_id: string;
          medical_history: Json;
          allergies: Json;
          medications: Json;
          habits: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          patient_id: string;
          medical_history?: Json;
          allergies?: Json;
          medications?: Json;
          habits?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          patient_id?: string;
          medical_history?: Json;
          allergies?: Json;
          medications?: Json;
          habits?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinical_records_patient_id_fkey";
            columns: ["patient_id", "salon_id"];
            isOneToOne: true;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
```
Near the domain aliases (after `export type Customer = ...`) add:
```ts
export type ClinicalRecord = Tables<"clinical_records">;
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260731110000_clinical_records.sql \
        clients/projects/salon-os/src/types/database.ts
git commit -m "feat(salon-os): clinical_records table (patient clinical file, RLS staff+)"
```

---

## Task 3: `visit_notes` table + signed-immutability trigger

**Files:**
- Create: `supabase/migrations/20260731120000_visit_notes.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `public.visit_notes`; SOAP note, `signed` bool, `signed_at`; trigger vetoes UPDATE/DELETE once `signed`. TS: `VisitNote = Tables<"visit_notes">`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260731120000_visit_notes.sql`:
```sql
-- =============================================================================
-- salon-os — Migración: notas de visita clínicas (visit_notes) — odontología
--
-- Nota SOAP por visita del paciente (subjetivo/objetivo/valoración/plan), con
-- autoría y FIRMA. Una vez FIRMADA es INMUTABLE a nivel de motor: un trigger
-- BEFORE UPDATE OR DELETE aborta si la fila OLD ya estaba firmada (patrón del
-- antiguo app.prevent_pos_invoice_mutation de Veri*factu). Mismo aislamiento por
-- salón que el resto del esquema; escritura staff+; borrado (solo no firmadas)
-- owner/manager.
-- =============================================================================

begin;

create table public.visit_notes (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons (id) on delete cascade,
  patient_id     uuid not null,
  -- Cita asociada (opcional): FK compuesta anti cross-tenant. NULL = nota suelta.
  appointment_id uuid,
  note_date      date not null default (now() at time zone 'utc')::date,
  author_id      uuid not null default auth.uid(),
  subjective     text not null default '',
  objective      text not null default '',
  assessment     text not null default '',
  plan           text not null default '',
  signed         boolean not null default false,
  signed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint visit_notes_patient_id_fkey
    foreign key (patient_id, salon_id)
    references public.customers (id, salon_id) on delete cascade,
  constraint visit_notes_appointment_id_fkey
    foreign key (appointment_id, salon_id)
    references public.appointments (id, salon_id) on delete set null,
  -- Coherencia firma↔sello: firmada ⇒ tiene fecha de firma; sin firmar ⇒ sin sello.
  constraint visit_notes_signed_at_chk
    check ((signed and signed_at is not null) or (not signed and signed_at is null))
);

create index idx_visit_notes_patient
  on public.visit_notes (salon_id, patient_id, note_date desc);

comment on table public.visit_notes is
  'Notas clínicas SOAP por visita (odontología). Firmada = inmutable (trigger). RLS por salón; escritura staff+.';

create trigger trg_visit_notes_updated_at
  before update on public.visit_notes
  for each row execute function app.set_updated_at();

-- Inmutabilidad de la nota FIRMADA (defensa en profundidad sobre la RLS). Bloquea a
-- TODOS los roles cuando OLD.signed; la firma en sí (UPDATE de una nota NO firmada)
-- sigue permitida. Patrón de app.prevent_pos_invoice_mutation (Veri*factu).
create or replace function app.prevent_signed_visit_note_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.signed then
    raise exception
      'visit_notes: una nota clínica firmada es inmutable; la operación % está prohibida', tg_op
      using errcode = 'restrict_violation',
            hint = 'Cree una nota nueva (addendum) en lugar de modificar o borrar una firmada.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

comment on function app.prevent_signed_visit_note_mutation() is
  'Aborta UPDATE/DELETE sobre una visit_note ya firmada (inmutabilidad clínica). Permite firmar una nota no firmada.';

create trigger trg_visit_notes_immutable_when_signed
  before update or delete on public.visit_notes
  for each row execute function app.prevent_signed_visit_note_mutation();

-- RLS
alter table public.visit_notes enable row level security;

create policy "members_select_visit_notes"
  on public.visit_notes for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "staff_insert_visit_notes"
  on public.visit_notes for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]));

create policy "staff_update_visit_notes"
  on public.visit_notes for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]));

create policy "owners_delete_visit_notes"
  on public.visit_notes for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- Guardián: aislamiento + integridad del trigger de inmutabilidad.
do $guard$
declare _cnt integer; _sd boolean;
begin
  select count(*) into _cnt from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='visit_notes' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN ODONTO: visit_notes sin RLS' using errcode='raise_exception';
  end if;

  select count(*) into _cnt from pg_policies
    where schemaname='public' and tablename='visit_notes'
      and cmd in ('SELECT','ALL') and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN ODONTO: visit_notes sin SELECT acotado' using errcode='raise_exception';
  end if;

  select count(*) into _cnt from pg_policies
    where schemaname='public' and tablename='visit_notes'
      and (roles && array['anon','public']::name[]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN ODONTO: visit_notes expuesta a anon/public' using errcode='raise_exception';
  end if;

  select p.prosecdef into _sd from pg_proc p
    where p.oid = to_regprocedure('app.prevent_signed_visit_note_mutation()');
  if _sd is null or not _sd then
    raise exception 'GUARDIÁN ODONTO: falta/degradado el trigger de inmutabilidad de visit_notes' using errcode='raise_exception';
  end if;

  raise notice 'GUARDIÁN ODONTO: visit_notes verificada (RLS + inmutabilidad de firmadas).';
end;
$guard$;

commit;
```

- [ ] **Step 2: Apply the migration via the Management API**

Run the same Git Bash helper as Task 2 Step 2, but with:
```
print(run(open("clients/projects/salon-os/supabase/migrations/20260731120000_visit_notes.sql",encoding="utf-8").read()))
print(run("select count(*) from public.visit_notes;"))
print(run("select tgname from pg_trigger where tgrelid='public.visit_notes'::regclass and not tgisinternal order by tgname;"))
```
Expected: first `(201, [])` + guard notice; count `(200, [{'count': 0}])`; triggers list includes `trg_visit_notes_immutable_when_signed` and `trg_visit_notes_updated_at`.

- [ ] **Step 3: Mirror the type in `src/types/database.ts`**

Add to `Tables`:
```ts
      visit_notes: {
        Row: {
          id: string;
          salon_id: string;
          patient_id: string;
          appointment_id: string | null;
          note_date: string;
          author_id: string;
          subjective: string;
          objective: string;
          assessment: string;
          plan: string;
          signed: boolean;
          signed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          patient_id: string;
          appointment_id?: string | null;
          note_date?: string;
          author_id?: string;
          subjective?: string;
          objective?: string;
          assessment?: string;
          plan?: string;
          signed?: boolean;
          signed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          patient_id?: string;
          appointment_id?: string | null;
          note_date?: string;
          author_id?: string;
          subjective?: string;
          objective?: string;
          assessment?: string;
          plan?: string;
          signed?: boolean;
          signed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visit_notes_patient_id_fkey";
            columns: ["patient_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
```
Add alias: `export type VisitNote = Tables<"visit_notes">;`

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260731120000_visit_notes.sql \
        clients/projects/salon-os/src/types/database.ts
git commit -m "feat(salon-os): visit_notes table with signed-immutability trigger"
```

---

## Task 4: `odontogram_findings` table (event-sourced core) + enums

**Files:**
- Create: `supabase/migrations/20260731130000_odontogram_findings.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: enums `tooth_surface`, `odontogram_finding_type`, `odontogram_finding_state`, `odontogram_finding_condition`; table `public.odontogram_findings`. TS: unions + `OdontogramFinding = Tables<"odontogram_findings">`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260731130000_odontogram_findings.sql`:
```sql
-- =============================================================================
-- salon-os — Migración: odontograma (odontogram_findings) — núcleo odontología
--
-- Hallazgos del odontograma por paciente, EVENT-SOURCED: cada fila es un evento con
-- detected_at / resolved_at (v1: resolved_at "cierra" un hallazgo; la vista evolutiva
-- "boca en fecha X" es de otro plan). La CLAVE del diente es FDI/ISO-3950 (11–48
-- permanente, 51–85 temporal) en un smallint con CHECK; cuadrante/posición/dentición
-- se derivan en la app (src/lib/odontogram/tooth.ts, espejo del CHECK). El COLOR lo
-- dirige el eje state × condition (rojo=pendiente/patológico, azul=hecho/existente-bueno),
-- ORTOGONAL al type; se persiste lo semántico. Superficies = enum semántico (se localiza
-- oclusal↔incisal / lingual↔palatino en render). Mismo aislamiento por salón + gate de rol.
-- =============================================================================

begin;

-- Superficies del diente (semánticas; el label se localiza en la app).
create type public.tooth_surface as enum (
  'mesial', 'distal', 'occlusal_incisal', 'vestibular', 'lingual_palatal'
);

-- Catálogo de tipos de hallazgo (§6.2).
create type public.odontogram_finding_type as enum (
  'caries', 'obturacion', 'corona', 'puente', 'implante', 'ausente',
  'extraccion_indicada', 'endodoncia', 'sellador', 'fractura', 'movilidad',
  'incluido', 'carilla', 'perno', 'resto_radicular', 'giroversion'
);

-- Eje de estado (ciclo de vida del hallazgo).
create type public.odontogram_finding_state as enum ('existing', 'planned', 'done');

-- Eje de condición (sano vs patológico) — dirige el color junto con state.
create type public.odontogram_finding_condition as enum ('healthy', 'pathological');

create table public.odontogram_findings (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons (id) on delete cascade,
  patient_id   uuid not null,
  -- FDI/ISO-3950. CHECK = mismo rango que isValidFdi() en la app.
  fdi_code     smallint not null,
  type         public.odontogram_finding_type not null,
  -- Subconjunto de las 5 superficies; '{}' = diente completo.
  surfaces     public.tooth_surface[] not null default '{}'::public.tooth_surface[],
  -- Puentes/multi-diente: lista ordenada FDI con rol (pilar|pontico). NULL = no aplica.
  span         jsonb,
  state        public.odontogram_finding_state not null default 'existing',
  condition    public.odontogram_finding_condition not null default 'pathological',
  -- Graduación opcional (movilidad 0–3, profundidad…). NULL = no graduado.
  grade        smallint check (grade is null or grade between 0 and 3),
  detected_at  timestamptz not null default now(),
  resolved_at  timestamptz,
  author_id    uuid not null default auth.uid(),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint odontogram_findings_fdi_chk check (
    (fdi_code between 11 and 18) or (fdi_code between 21 and 28) or
    (fdi_code between 31 and 38) or (fdi_code between 41 and 48) or
    (fdi_code between 51 and 55) or (fdi_code between 61 and 65) or
    (fdi_code between 71 and 75) or (fdi_code between 81 and 85)
  ),
  constraint odontogram_findings_patient_id_fkey
    foreign key (patient_id, salon_id)
    references public.customers (id, salon_id) on delete cascade
);

-- Odontograma de un paciente (los activos = resolved_at is null), diente a diente.
create index idx_odontogram_findings_patient
  on public.odontogram_findings (salon_id, patient_id, fdi_code, detected_at desc);

comment on table public.odontogram_findings is
  'Hallazgos del odontograma (event-sourced) por paciente. FDI + superficies + state×condition (color). RLS por salón; escritura staff+.';

create trigger trg_odontogram_findings_updated_at
  before update on public.odontogram_findings
  for each row execute function app.set_updated_at();

-- RLS
alter table public.odontogram_findings enable row level security;

create policy "members_select_odontogram_findings"
  on public.odontogram_findings for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "staff_insert_odontogram_findings"
  on public.odontogram_findings for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]));

-- UPDATE staff+ (p. ej. cerrar un hallazgo poniendo resolved_at).
create policy "staff_update_odontogram_findings"
  on public.odontogram_findings for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]));

-- DELETE staff+ (corrección de un hallazgo recién creado por error). El histórico
-- profundo (supersede-on-signed-visit) es de un plan posterior; v1 permite borrar.
create policy "staff_delete_odontogram_findings"
  on public.odontogram_findings for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager','staff']::public.member_role[]));

-- Guardián de aislamiento.
do $guard$
declare _cnt integer;
begin
  select count(*) into _cnt from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='odontogram_findings' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN ODONTO: odontogram_findings sin RLS' using errcode='raise_exception';
  end if;

  select count(*) into _cnt from pg_policies
    where schemaname='public' and tablename='odontogram_findings'
      and cmd in ('SELECT','ALL') and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN ODONTO: odontogram_findings sin SELECT acotado' using errcode='raise_exception';
  end if;

  select count(*) into _cnt from pg_policies
    where schemaname='public' and tablename='odontogram_findings'
      and (roles && array['anon','public']::name[]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN ODONTO: odontogram_findings expuesta a anon/public' using errcode='raise_exception';
  end if;

  raise notice 'GUARDIÁN ODONTO: odontogram_findings verificada (RLS, SELECT acotado, nada a anon/public).';
end;
$guard$;

commit;
```

- [ ] **Step 2: Apply the migration via the Management API**

Run the Task 2 Step 2 helper with:
```
print(run(open("clients/projects/salon-os/supabase/migrations/20260731130000_odontogram_findings.sql",encoding="utf-8").read()))
print(run("select count(*) from public.odontogram_findings;"))
print(run("select enumlabel from pg_enum where enumtypid='public.odontogram_finding_type'::regtype order by enumsortorder;"))
```
Expected: first `(201, [])` + guard notice; count `(200, [{'count': 0}])`; the type-enum query lists the 16 labels.

- [ ] **Step 3: Mirror the types in `src/types/database.ts`**

Near the exported unions (after `export type SalonSector = ...`) add:
```ts
export type ToothSurface =
  | "mesial" | "distal" | "occlusal_incisal" | "vestibular" | "lingual_palatal";

export type OdontogramFindingType =
  | "caries" | "obturacion" | "corona" | "puente" | "implante" | "ausente"
  | "extraccion_indicada" | "endodoncia" | "sellador" | "fractura" | "movilidad"
  | "incluido" | "carilla" | "perno" | "resto_radicular" | "giroversion";

export type OdontogramFindingState = "existing" | "planned" | "done";
export type OdontogramFindingCondition = "healthy" | "pathological";
```
Add to `Tables`:
```ts
      odontogram_findings: {
        Row: {
          id: string;
          salon_id: string;
          patient_id: string;
          fdi_code: number;
          type: OdontogramFindingType;
          surfaces: ToothSurface[];
          span: Json | null;
          state: OdontogramFindingState;
          condition: OdontogramFindingCondition;
          grade: number | null;
          detected_at: string;
          resolved_at: string | null;
          author_id: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          patient_id: string;
          fdi_code: number;
          type: OdontogramFindingType;
          surfaces?: ToothSurface[];
          span?: Json | null;
          state?: OdontogramFindingState;
          condition?: OdontogramFindingCondition;
          grade?: number | null;
          detected_at?: string;
          resolved_at?: string | null;
          author_id?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          patient_id?: string;
          fdi_code?: number;
          type?: OdontogramFindingType;
          surfaces?: ToothSurface[];
          span?: Json | null;
          state?: OdontogramFindingState;
          condition?: OdontogramFindingCondition;
          grade?: number | null;
          detected_at?: string;
          resolved_at?: string | null;
          author_id?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "odontogram_findings_patient_id_fkey";
            columns: ["patient_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
```
In the `Enums` block add:
```ts
      tooth_surface: ToothSurface;
      odontogram_finding_type: OdontogramFindingType;
      odontogram_finding_state: OdontogramFindingState;
      odontogram_finding_condition: OdontogramFindingCondition;
```
Add alias: `export type OdontogramFinding = Tables<"odontogram_findings">;`

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260731130000_odontogram_findings.sql \
        clients/projects/salon-os/src/types/database.ts
git commit -m "feat(salon-os): odontogram_findings table + enums (event-sourced FDI findings)"
```

---

## Task 5: Pure tooth model (`src/lib/odontogram/tooth.ts`)

**Files:**
- Create: `src/lib/odontogram/tooth.ts`, `src/tests/unit/odontogram-tooth.test.ts`

**Interfaces:**
- Consumes: `ToothSurface` from `@/types/database`.
- Produces: `Dentition`, `Arch`, `Side`, `Tooth`; `isValidFdi()`, `toothFromFdi()`, `isAnterior()`, `surfaceLabel()`, `PERMANENT_FDI`, `PRIMARY_FDI`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/odontogram-tooth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  isValidFdi,
  toothFromFdi,
  isAnterior,
  surfaceLabel,
  PERMANENT_FDI,
  PRIMARY_FDI,
} from "@/lib/odontogram/tooth";

describe("FDI tooth model", () => {
  it("valida el rango FDI permanente y temporal, rechaza el resto", () => {
    expect(isValidFdi(11)).toBe(true);
    expect(isValidFdi(48)).toBe(true);
    expect(isValidFdi(85)).toBe(true);
    expect(isValidFdi(19)).toBe(false); // no hay posición 9
    expect(isValidFdi(10)).toBe(false);
    expect(isValidFdi(86)).toBe(false);
    expect(isValidFdi(0)).toBe(false);
  });
  it("deriva cuadrante/posición/dentición/arco/lado de #18 (molar superior derecho)", () => {
    const t = toothFromFdi(18);
    expect(t.quadrant).toBe(1);
    expect(t.position).toBe(8);
    expect(t.dentition).toBe("permanent");
    expect(t.arch).toBe("upper");
    expect(t.side).toBe("right");
  });
  it("deriva #71 (temporal, incisivo inferior izquierdo)", () => {
    const t = toothFromFdi(71);
    expect(t.dentition).toBe("primary");
    expect(t.arch).toBe("lower");
    expect(t.side).toBe("left");
    expect(t.position).toBe(1);
  });
  it("toothFromFdi lanza ante un código inválido", () => {
    expect(() => toothFromFdi(99)).toThrow();
  });
  it("anterior = posiciones 1–3; posterior = 4+", () => {
    expect(isAnterior(1)).toBe(true);
    expect(isAnterior(3)).toBe(true);
    expect(isAnterior(4)).toBe(false);
  });
  it("localiza oclusal/incisal por anterior/posterior y palatino/lingual por arco", () => {
    expect(surfaceLabel("occlusal_incisal", toothFromFdi(16))).toBe("Oclusal"); // posterior
    expect(surfaceLabel("occlusal_incisal", toothFromFdi(11))).toBe("Incisal"); // anterior
    expect(surfaceLabel("lingual_palatal", toothFromFdi(11))).toBe("Palatino"); // superior
    expect(surfaceLabel("lingual_palatal", toothFromFdi(31))).toBe("Lingual"); // inferior
    expect(surfaceLabel("mesial", toothFromFdi(11))).toBe("Mesial");
  });
  it("PERMANENT_FDI tiene 32 dientes y PRIMARY_FDI 20", () => {
    expect(PERMANENT_FDI).toHaveLength(32);
    expect(PRIMARY_FDI).toHaveLength(20);
    expect(PERMANENT_FDI.every(isValidFdi)).toBe(true);
    expect(PRIMARY_FDI.every(isValidFdi)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/odontogram-tooth.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/odontogram/tooth.ts`:
```ts
/**
 * Modelo de diente FDI/ISO-3950 — PURO, isomórfico y testeable. Deriva
 * cuadrante/posición/dentición/arco/lado del código FDI y localiza los labels de
 * superficie (oclusal↔incisal por anterior/posterior; palatino↔lingual por arco).
 * `isValidFdi` es ESPEJO del CHECK de `odontogram_findings.fdi_code`.
 */
import type { ToothSurface } from "@/types/database";

export type Dentition = "permanent" | "primary";
export type Arch = "upper" | "lower";
export type Side = "right" | "left";

export interface Tooth {
  fdi: number;
  quadrant: number; // 1–8
  position: number; // 1–8 (permanente) / 1–5 (temporal)
  dentition: Dentition;
  arch: Arch;
  side: Side;
}

/** Posiciones válidas por cuadrante: permanentes 1–8; temporales 1–5. */
function maxPositionFor(quadrant: number): number {
  return quadrant >= 5 ? 5 : 8;
}

/** `true` si `code` es un FDI válido (11–18/21–28/31–38/41–48/51–55/61–65/71–75/81–85). */
export function isValidFdi(code: number): boolean {
  if (!Number.isInteger(code)) return false;
  const quadrant = Math.floor(code / 10);
  const position = code % 10;
  if (quadrant < 1 || quadrant > 8) return false;
  if (position < 1) return false;
  return position <= maxPositionFor(quadrant);
}

/** Deriva el {@link Tooth} de un código FDI; lanza si el código no es válido. */
export function toothFromFdi(code: number): Tooth {
  if (!isValidFdi(code)) {
    throw new Error(`Código FDI no válido: ${code}`);
  }
  const quadrant = Math.floor(code / 10);
  const position = code % 10;
  const dentition: Dentition = quadrant >= 5 ? "primary" : "permanent";
  const upperQuadrants = new Set([1, 2, 5, 6]);
  const rightQuadrants = new Set([1, 4, 5, 8]);
  return {
    fdi: code,
    quadrant,
    position,
    dentition,
    arch: upperQuadrants.has(quadrant) ? "upper" : "lower",
    side: rightQuadrants.has(quadrant) ? "right" : "left",
  };
}

/** Diente anterior (incisivo/canino): posiciones 1–3. Posterior: 4+. */
export function isAnterior(position: number): boolean {
  return position >= 1 && position <= 3;
}

const SURFACE_FIXED: Partial<Record<ToothSurface, string>> = {
  mesial: "Mesial",
  distal: "Distal",
  vestibular: "Vestibular",
};

/**
 * Label localizado de una superficie sobre un diente concreto:
 *   · `occlusal_incisal` → "Oclusal" (posterior) / "Incisal" (anterior).
 *   · `lingual_palatal`  → "Palatino" (arco superior) / "Lingual" (arco inferior).
 */
export function surfaceLabel(surface: ToothSurface, tooth: Tooth): string {
  if (surface === "occlusal_incisal") {
    return isAnterior(tooth.position) ? "Incisal" : "Oclusal";
  }
  if (surface === "lingual_palatal") {
    return tooth.arch === "upper" ? "Palatino" : "Lingual";
  }
  return SURFACE_FIXED[surface] ?? surface;
}

function buildRange(quadrant: number): number[] {
  const max = maxPositionFor(quadrant);
  return Array.from({ length: max }, (_, i) => quadrant * 10 + (i + 1));
}

/** Dentición permanente ordenada por cuadrante (11–18, 21–28, 31–38, 41–48). */
export const PERMANENT_FDI: readonly number[] = [1, 2, 3, 4].flatMap(buildRange);

/** Dentición temporal ordenada por cuadrante (51–55, 61–65, 71–75, 81–85). */
export const PRIMARY_FDI: readonly number[] = [5, 6, 7, 8].flatMap(buildRange);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/odontogram-tooth.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/odontogram/tooth.ts \
        clients/projects/salon-os/src/tests/unit/odontogram-tooth.test.ts
git commit -m "feat(salon-os): pure FDI tooth model (derivations + surface labels)"
```

---

## Task 6: Pure finding presentation core (color + catalog)

**Files:**
- Create: `src/lib/odontogram/color.ts`, `src/lib/odontogram/catalog.ts`, `src/tests/unit/odontogram-color.test.ts`, `src/tests/unit/odontogram-catalog.test.ts`

**Interfaces:**
- Consumes: `OdontogramFindingState`, `OdontogramFindingCondition`, `OdontogramFindingType` from `@/types/database`.
- Produces: `FindingColor`, `findingColor()`, `FINDING_COLORS`, `worstColor()`; `FindingCatalogEntry`, `FINDING_CATALOG`, `catalogEntry()`.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/unit/odontogram-color.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { findingColor, worstColor, FINDING_COLORS } from "@/lib/odontogram/color";

describe("finding color (eje state × condition)", () => {
  it("patológico no-hecho = pendiente (rojo)", () => {
    expect(findingColor({ state: "existing", condition: "pathological" })).toBe("pending");
    expect(findingColor({ state: "planned", condition: "pathological" })).toBe("pending");
  });
  it("hecho = azul, sea cual sea la condición", () => {
    expect(findingColor({ state: "done", condition: "pathological" })).toBe("done");
    expect(findingColor({ state: "done", condition: "healthy" })).toBe("done");
  });
  it("existente-bueno (healthy) = azul", () => {
    expect(findingColor({ state: "existing", condition: "healthy" })).toBe("done");
  });
  it("cada color tiene un relleno hex y un label", () => {
    expect(FINDING_COLORS.pending.fill).toMatch(/^#[0-9a-f]{6}$/i);
    expect(FINDING_COLORS.done.fill).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("worstColor: un solo pendiente domina a los hechos", () => {
    expect(
      worstColor([
        { state: "done", condition: "healthy" },
        { state: "existing", condition: "pathological" },
      ]),
    ).toBe("pending");
    expect(worstColor([{ state: "done", condition: "healthy" }])).toBe("done");
    expect(worstColor([])).toBeNull();
  });
});
```

Create `src/tests/unit/odontogram-catalog.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FINDING_CATALOG, catalogEntry } from "@/lib/odontogram/catalog";
import { findingColor } from "@/lib/odontogram/color";

describe("finding catalog", () => {
  it("caries entra como patológico/existente (rojo)", () => {
    const e = catalogEntry("caries");
    expect(e).toBeDefined();
    expect(findingColor(e!)).toBe("pending");
    expect(e!.perSurface).toBe(true);
  });
  it("obturación entra como hecho/sano (azul), diente completo o superficie", () => {
    const e = catalogEntry("obturacion");
    expect(findingColor(e!)).toBe("done");
  });
  it("ausente es de diente completo (no por superficie)", () => {
    expect(catalogEntry("ausente")!.perSurface).toBe(false);
  });
  it("todas las entradas tienen label y un default de state/condition", () => {
    for (const e of FINDING_CATALOG) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(["existing", "planned", "done"]).toContain(e.defaultState);
      expect(["healthy", "pathological"]).toContain(e.defaultCondition);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/tests/unit/odontogram-color.test.ts src/tests/unit/odontogram-catalog.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the implementations**

Create `src/lib/odontogram/color.ts`:
```ts
/**
 * Color del hallazgo — PURO y config-driven. El COLOR lo dirige el eje `state × condition`
 * (ortogonal al `type`, que solo dice QUÉ es): **rojo = pendiente/patológico**,
 * **azul = hecho/existente-bueno**. Un hallazgo es "hecho" (azul) si `state === "done"`
 * o su condición es `healthy`; en otro caso es "pendiente" (rojo). Se persiste lo
 * semántico; aquí solo se decide la presentación (convención configurable en un sitio).
 */
import type {
  OdontogramFindingCondition,
  OdontogramFindingState,
} from "@/types/database";

export type FindingColor = "pending" | "done";

export interface FindingColorInput {
  state: OdontogramFindingState;
  condition: OdontogramFindingCondition;
}

/** Convención de color (única fuente): relleno hex + label legible. */
export const FINDING_COLORS: Record<FindingColor, { fill: string; label: string }> = {
  pending: { fill: "#dc2626", label: "Pendiente / patológico" },
  done: { fill: "#2563eb", label: "Hecho / existente" },
};

/** `"done"` (azul) si está hecho o es sano; `"pending"` (rojo) en otro caso. */
export function findingColor({ state, condition }: FindingColorInput): FindingColor {
  return state === "done" || condition === "healthy" ? "done" : "pending";
}

/**
 * Color dominante de un conjunto de hallazgos de un diente/superficie: un solo
 * pendiente (rojo) manda sobre cualquier número de hechos (azul). `null` si no hay.
 */
export function worstColor(findings: readonly FindingColorInput[]): FindingColor | null {
  if (findings.length === 0) return null;
  return findings.some((f) => findingColor(f) === "pending") ? "pending" : "done";
}
```

Create `src/lib/odontogram/catalog.ts`:
```ts
/**
 * Catálogo de tipos de hallazgo — PURO, config-driven. Cada tipo del enum aporta su
 * label y su default de `state`/`condition` (que el color deriva) y si aplica por
 * SUPERFICIE (caries, obturación…) o a DIENTE completo (ausente, corona, implante…).
 * Es la lista que la UI ofrece al añadir un hallazgo con un clic.
 */
import type {
  OdontogramFindingCondition,
  OdontogramFindingState,
  OdontogramFindingType,
} from "@/types/database";

export interface FindingCatalogEntry {
  type: OdontogramFindingType;
  label: string;
  defaultState: OdontogramFindingState;
  defaultCondition: OdontogramFindingCondition;
  perSurface: boolean;
}

export const FINDING_CATALOG: readonly FindingCatalogEntry[] = [
  { type: "caries", label: "Caries", defaultState: "existing", defaultCondition: "pathological", perSurface: true },
  { type: "obturacion", label: "Obturación", defaultState: "done", defaultCondition: "healthy", perSurface: true },
  { type: "sellador", label: "Sellador", defaultState: "done", defaultCondition: "healthy", perSurface: true },
  { type: "carilla", label: "Carilla", defaultState: "done", defaultCondition: "healthy", perSurface: true },
  { type: "corona", label: "Corona", defaultState: "done", defaultCondition: "healthy", perSurface: false },
  { type: "endodoncia", label: "Endodoncia", defaultState: "done", defaultCondition: "healthy", perSurface: false },
  { type: "implante", label: "Implante", defaultState: "done", defaultCondition: "healthy", perSurface: false },
  { type: "perno", label: "Perno", defaultState: "done", defaultCondition: "healthy", perSurface: false },
  { type: "ausente", label: "Ausente", defaultState: "existing", defaultCondition: "pathological", perSurface: false },
  { type: "extraccion_indicada", label: "Extracción indicada", defaultState: "planned", defaultCondition: "pathological", perSurface: false },
  { type: "fractura", label: "Fractura", defaultState: "existing", defaultCondition: "pathological", perSurface: false },
  { type: "movilidad", label: "Movilidad", defaultState: "existing", defaultCondition: "pathological", perSurface: false },
  { type: "incluido", label: "Incluido", defaultState: "existing", defaultCondition: "pathological", perSurface: false },
  { type: "resto_radicular", label: "Resto radicular", defaultState: "existing", defaultCondition: "pathological", perSurface: false },
  { type: "giroversion", label: "Giroversión", defaultState: "existing", defaultCondition: "pathological", perSurface: false },
  { type: "puente", label: "Puente", defaultState: "done", defaultCondition: "healthy", perSurface: false },
];

/** Entrada del catálogo para un tipo, o `undefined` si no existe. */
export function catalogEntry(type: OdontogramFindingType): FindingCatalogEntry | undefined {
  return FINDING_CATALOG.find((e) => e.type === type);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/tests/unit/odontogram-color.test.ts src/tests/unit/odontogram-catalog.test.ts`
Expected: PASS (5 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/odontogram/color.ts \
        clients/projects/salon-os/src/lib/odontogram/catalog.ts \
        clients/projects/salon-os/src/tests/unit/odontogram-color.test.ts \
        clients/projects/salon-os/src/tests/unit/odontogram-catalog.test.ts
git commit -m "feat(salon-os): pure odontogram color + finding catalog (config-driven)"
```

---

## Task 7: Clinical record slice (validation + query + action + hook + patient-page card)

**Files:**
- Create: `src/lib/validations/clinical-record.ts`, `src/lib/queries/clinical-records.ts`, `src/hooks/use-clinical-record.ts`, `src/app/(dashboard)/customers/[id]/dental/actions.ts`, `src/app/(dashboard)/customers/[id]/dental/clinical-record-card.tsx`, `src/app/(dashboard)/customers/[id]/dental/dental-section.tsx`
- Modify: `src/app/(dashboard)/customers/[id]/page.tsx`, `src/app/(dashboard)/customers/[id]/customer-detail-view.tsx`

**Interfaces:**
- Produces: `clinicalRecordSchema`/`ClinicalRecordInput`; `fetchClinicalRecord()` + `clinicalRecordKeys`; `upsertClinicalRecord()` server action; `useClinicalRecord`/`useUpsertClinicalRecord`; `<ClinicalRecordCard>`; `<DentalSection>`; patient page passes `dentalEnabled`.

- [ ] **Step 1: Validation schema**

Create `src/lib/validations/clinical-record.ts`:
```ts
import { z } from "zod";

/**
 * Ficha clínica del paciente. v1: los cuatro bloques son TEXTO libre en el formulario
 * (antecedentes, alergias, medicación, hábitos); se persisten como JSONB `{ text }`
 * para poder estructurarlos en un plan posterior sin migrar datos.
 */
const block = z.string().trim().max(4000).optional().transform((v) => v ?? "");

export const clinicalRecordSchema = z.object({
  medical_history: block,
  allergies: block,
  medications: block,
  habits: block,
});

export type ClinicalRecordInput = z.input<typeof clinicalRecordSchema>;
export type ClinicalRecordValues = z.output<typeof clinicalRecordSchema>;
```

- [ ] **Step 2: Query**

Create `src/lib/queries/clinical-records.ts`:
```ts
import { createClient } from "@/lib/supabase/client";
import type { ClinicalRecord } from "@/types/database";

export const clinicalRecordKeys = {
  detail: (salonId: string, patientId: string) =>
    ["clinical-record", salonId, patientId] as const,
};

/** Ficha clínica del paciente, o `null` si aún no existe. */
export async function fetchClinicalRecord(
  salonId: string,
  patientId: string,
): Promise<ClinicalRecord | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clinical_records")
    .select("*")
    .eq("salon_id", salonId)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error !== null) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 3: Server action (shared dental actions file)**

Create `src/app/(dashboard)/customers/[id]/dental/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  clinicalRecordSchema,
  type ClinicalRecordInput,
} from "@/lib/validations/clinical-record";
import type { ClinicalRecord } from "@/types/database";

/** Resultado tipado de un Server Action dental (mismo patrón que customers/actions). */
export type DentalActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function toJsonBlock(text: string): { text: string } {
  return { text };
}

/** Crea o actualiza (upsert 1:1) la ficha clínica del paciente en el salón activo. */
export async function upsertClinicalRecord(
  patientId: string,
  input: ClinicalRecordInput,
): Promise<DentalActionResult<ClinicalRecord>> {
  const parsed = clinicalRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("clinical_records")
    .upsert(
      {
        salon_id: salonId,
        patient_id: patientId,
        medical_history: toJsonBlock(parsed.data.medical_history),
        allergies: toJsonBlock(parsed.data.allergies),
        medications: toJsonBlock(parsed.data.medications),
        habits: toJsonBlock(parsed.data.habits),
      },
      { onConflict: "salon_id,patient_id" },
    )
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath(`/customers/${patientId}`);
  return { ok: true, data };
}
```

- [ ] **Step 4: Hook**

Create `src/hooks/use-clinical-record.ts`:
```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { upsertClinicalRecord } from "@/app/(dashboard)/customers/[id]/dental/actions";
import {
  clinicalRecordKeys,
  fetchClinicalRecord,
} from "@/lib/queries/clinical-records";
import type { ClinicalRecordInput } from "@/lib/validations/clinical-record";
import type { ClinicalRecord } from "@/types/database";

export function useClinicalRecord(salonId: string, patientId: string) {
  return useQuery({
    queryKey: clinicalRecordKeys.detail(salonId, patientId),
    queryFn: () => fetchClinicalRecord(salonId, patientId),
  });
}

export function useUpsertClinicalRecord(salonId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClinicalRecordInput): Promise<ClinicalRecord> => {
      const result = await upsertClinicalRecord(patientId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(clinicalRecordKeys.detail(salonId, patientId), data);
    },
  });
}
```

- [ ] **Step 5: Clinical record card + dental section wrapper**

Create `src/app/(dashboard)/customers/[id]/dental/clinical-record-card.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { HeartPulse } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useClinicalRecord,
  useUpsertClinicalRecord,
} from "@/hooks/use-clinical-record";
import type { Json } from "@/types/database";

function blockText(value: Json | null | undefined): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const text = (value as Record<string, unknown>).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

interface ClinicalRecordCardProps {
  salonId: string;
  patientId: string;
}

export function ClinicalRecordCard({
  salonId,
  patientId,
}: ClinicalRecordCardProps): React.ReactElement {
  const query = useClinicalRecord(salonId, patientId);
  const upsert = useUpsertClinicalRecord(salonId, patientId);
  const [editing, setEditing] = useState(false);
  const record = query.data ?? null;

  const initial = useMemo(
    () => ({
      medical_history: blockText(record?.medical_history),
      allergies: blockText(record?.allergies),
      medications: blockText(record?.medications),
      habits: blockText(record?.habits),
    }),
    [record],
  );
  const [form, setForm] = useState(initial);

  function startEdit(): void {
    setForm(initial);
    setEditing(true);
  }

  const fields: { key: keyof typeof form; label: string }[] = [
    { key: "medical_history", label: "Antecedentes médicos" },
    { key: "allergies", label: "Alergias" },
    { key: "medications", label: "Medicación" },
    { key: "habits", label: "Hábitos" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-primary" />
            Ficha clínica
          </CardTitle>
          <CardDescription>Antecedentes, alergias, medicación y hábitos.</CardDescription>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEdit} disabled={query.isPending}>
            Editar
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : editing ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              upsert.mutate(form, { onSuccess: () => setEditing(false) });
            }}
          >
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`cr-${f.key}`}>{f.label}</Label>
                <Textarea
                  id={`cr-${f.key}`}
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  rows={3}
                />
              </div>
            ))}
            {upsert.error instanceof Error ? (
              <p role="alert" className="text-sm text-destructive">
                {upsert.error.message}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? "Guardando…" : "Guardar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <dl className="space-y-3 text-sm">
            {fields.map((f) => (
              <div key={f.key}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="whitespace-pre-wrap text-foreground/90">
                  {initial[f.key] !== "" ? initial[f.key] : "—"}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
```

Create `src/app/(dashboard)/customers/[id]/dental/dental-section.tsx`:
```tsx
"use client";

import { ClinicalRecordCard } from "@/app/(dashboard)/customers/[id]/dental/clinical-record-card";

interface DentalSectionProps {
  salonId: string;
  patientId: string;
}

/**
 * Bloque odontológico de la ficha del paciente. Se monta SOLO cuando el sector activo
 * es odontología (el server lo decide y pasa `dentalEnabled`). v1: ficha clínica.
 * Las notas de visita se añaden en la Tarea 8.
 */
export function DentalSection({
  salonId,
  patientId,
}: DentalSectionProps): React.ReactElement {
  return (
    <div className="mt-6 grid gap-6 animate-fade-up">
      <ClinicalRecordCard salonId={salonId} patientId={patientId} />
    </div>
  );
}
```

- [ ] **Step 6: Wire sector into the patient page + view**

In `src/app/(dashboard)/customers/[id]/page.tsx`: import `getActiveSalonSector` from `@/lib/salon`; after resolving `loyaltyEnabled` add `const sector = await getActiveSalonSector();` and pass `dentalEnabled={sector === "odontologia"}` to `<CustomerDetailView>`.

In `src/app/(dashboard)/customers/[id]/customer-detail-view.tsx`: import `DentalSection`; add `dentalEnabled: boolean` to `CustomerDetailViewProps` and destructure it; render `{dentalEnabled ? <DentalSection salonId={salonId} patientId={customerId} /> : null}` immediately after the closing `</div>` of the `grid gap-6 lg:grid-cols-3` block (before the edit dialog).

- [ ] **Step 7: Verify typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass (no new tests this task; slice is glue mirroring customers — verified by tsc + suite).

- [ ] **Step 8: Commit**

```bash
git add clients/projects/salon-os/src/lib/validations/clinical-record.ts \
        clients/projects/salon-os/src/lib/queries/clinical-records.ts \
        clients/projects/salon-os/src/hooks/use-clinical-record.ts \
        clients/projects/salon-os/src/app/\(dashboard\)/customers/\[id\]/dental/ \
        clients/projects/salon-os/src/app/\(dashboard\)/customers/\[id\]/page.tsx \
        clients/projects/salon-os/src/app/\(dashboard\)/customers/\[id\]/customer-detail-view.tsx
git commit -m "feat(salon-os): clinical record card on patient page (odontologia only)"
```

---

## Task 8: Visit notes slice (validation + query + action + hook + patient-page card)

**Files:**
- Create: `src/lib/validations/visit-note.ts`, `src/lib/queries/visit-notes.ts`, `src/hooks/use-visit-notes.ts`, `src/app/(dashboard)/customers/[id]/dental/visit-notes-card.tsx`
- Modify: `src/app/(dashboard)/customers/[id]/dental/actions.ts`, `src/app/(dashboard)/customers/[id]/dental/dental-section.tsx`

**Interfaces:**
- Produces: `visitNoteSchema`/`VisitNoteInput`; `fetchVisitNotes()` + `visitNoteKeys`; `addVisitNote()` + `signVisitNote()` actions; `useVisitNotes`/`useAddVisitNote`/`useSignVisitNote`; `<VisitNotesCard>`.

- [ ] **Step 1: Validation schema**

Create `src/lib/validations/visit-note.ts`:
```ts
import { z } from "zod";

const soapField = z.string().trim().max(4000).optional().transform((v) => v ?? "");

export const visitNoteSchema = z
  .object({
    note_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida (AAAA-MM-DD)"),
    subjective: soapField,
    objective: soapField,
    assessment: soapField,
    plan: soapField,
  })
  .refine(
    (v) =>
      v.subjective !== "" || v.objective !== "" || v.assessment !== "" || v.plan !== "",
    { message: "La nota no puede estar vacía", path: ["subjective"] },
  );

export type VisitNoteInput = z.input<typeof visitNoteSchema>;
export type VisitNoteValues = z.output<typeof visitNoteSchema>;
```

- [ ] **Step 2: Query**

Create `src/lib/queries/visit-notes.ts`:
```ts
import { createClient } from "@/lib/supabase/client";
import type { VisitNote } from "@/types/database";

export const visitNoteKeys = {
  list: (salonId: string, patientId: string) =>
    ["visit-notes", salonId, patientId] as const,
};

/** Notas de visita del paciente, de la más reciente a la más antigua. */
export async function fetchVisitNotes(
  salonId: string,
  patientId: string,
): Promise<VisitNote[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("visit_notes")
    .select("*")
    .eq("salon_id", salonId)
    .eq("patient_id", patientId)
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 3: Extend the dental actions file**

Append to `src/app/(dashboard)/customers/[id]/dental/actions.ts` (add imports for `visitNoteSchema`/`VisitNoteInput` and `VisitNote`):
```ts
import { visitNoteSchema, type VisitNoteInput } from "@/lib/validations/visit-note";
import type { VisitNote } from "@/types/database";

/** Añade una nota de visita (SOAP) al paciente en el salón activo. author_id = auth.uid() (DEFAULT). */
export async function addVisitNote(
  patientId: string,
  input: VisitNoteInput,
): Promise<DentalActionResult<VisitNote>> {
  const parsed = visitNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("visit_notes")
    .insert({
      salon_id: salonId,
      patient_id: patientId,
      note_date: parsed.data.note_date,
      subjective: parsed.data.subjective,
      objective: parsed.data.objective,
      assessment: parsed.data.assessment,
      plan: parsed.data.plan,
    })
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath(`/customers/${patientId}`);
  return { ok: true, data };
}

/** Firma una nota (la vuelve inmutable). Falla si ya estaba firmada (trigger). */
export async function signVisitNote(
  patientId: string,
  noteId: string,
): Promise<DentalActionResult<VisitNote>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("visit_notes")
    .update({ signed: true, signed_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("salon_id", salonId)
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath(`/customers/${patientId}`);
  return { ok: true, data };
}
```

- [ ] **Step 4: Hook**

Create `src/hooks/use-visit-notes.ts`:
```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addVisitNote,
  signVisitNote,
} from "@/app/(dashboard)/customers/[id]/dental/actions";
import { fetchVisitNotes, visitNoteKeys } from "@/lib/queries/visit-notes";
import type { VisitNoteInput } from "@/lib/validations/visit-note";
import type { VisitNote } from "@/types/database";

export function useVisitNotes(salonId: string, patientId: string) {
  return useQuery({
    queryKey: visitNoteKeys.list(salonId, patientId),
    queryFn: () => fetchVisitNotes(salonId, patientId),
  });
}

export function useAddVisitNote(salonId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: VisitNoteInput): Promise<VisitNote> => {
      const result = await addVisitNote(patientId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: visitNoteKeys.list(salonId, patientId),
      });
    },
  });
}

export function useSignVisitNote(salonId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string): Promise<VisitNote> => {
      const result = await signVisitNote(patientId, noteId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: visitNoteKeys.list(salonId, patientId),
      });
    },
  });
}
```

- [ ] **Step 5: Visit notes card**

Create `src/app/(dashboard)/customers/[id]/dental/visit-notes-card.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Lock, NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddVisitNote,
  useSignVisitNote,
  useVisitNotes,
} from "@/hooks/use-visit-notes";
import { formatDate } from "@/lib/format";
import type { VisitNoteInput } from "@/lib/validations/visit-note";

const EMPTY: VisitNoteInput = {
  note_date: new Date().toISOString().slice(0, 10),
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

interface VisitNotesCardProps {
  salonId: string;
  patientId: string;
}

export function VisitNotesCard({
  salonId,
  patientId,
}: VisitNotesCardProps): React.ReactElement {
  const query = useVisitNotes(salonId, patientId);
  const add = useAddVisitNote(salonId, patientId);
  const sign = useSignVisitNote(salonId, patientId);
  const [form, setForm] = useState<VisitNoteInput>(EMPTY);
  const [open, setOpen] = useState(false);

  const soap: { key: keyof VisitNoteInput; label: string }[] = [
    { key: "subjective", label: "Subjetivo" },
    { key: "objective", label: "Objetivo" },
    { key: "assessment", label: "Valoración" },
    { key: "plan", label: "Plan" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-primary" />
            Notas de visita
          </CardTitle>
          <CardDescription>Notas SOAP. Una vez firmada, la nota es inmutable.</CardDescription>
        </div>
        {!open ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Añadir nota
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        {open ? (
          <form
            className="space-y-3 rounded-lg border bg-muted/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(form, {
                onSuccess: () => {
                  setForm(EMPTY);
                  setOpen(false);
                },
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="vn-date">Fecha</Label>
              <Input
                id="vn-date"
                type="date"
                value={form.note_date}
                onChange={(e) => setForm((p) => ({ ...p, note_date: e.target.value }))}
              />
            </div>
            {soap.map((s) => (
              <div key={s.key} className="space-y-1.5">
                <Label htmlFor={`vn-${s.key}`}>{s.label}</Label>
                <Textarea
                  id={`vn-${s.key}`}
                  rows={2}
                  value={String(form[s.key] ?? "")}
                  onChange={(e) => setForm((p) => ({ ...p, [s.key]: e.target.value }))}
                />
              </div>
            ))}
            {add.error instanceof Error ? (
              <p role="alert" className="text-sm text-destructive">
                {add.error.message}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={add.isPending}>
                {add.isPending ? "Guardando…" : "Guardar nota"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        {query.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : query.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin notas de visita todavía.
          </p>
        ) : (
          <ul className="space-y-4">
            {query.data.map((note) => (
              <li key={note.id} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatDate(note.note_date)}
                  </p>
                  {note.signed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                      <Lock className="h-3 w-3" />
                      Firmada
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sign.isPending}
                      onClick={() => sign.mutate(note.id)}
                    >
                      Firmar
                    </Button>
                  )}
                </div>
                <div className="grid gap-1 text-sm">
                  {note.subjective !== "" ? <p><span className="text-muted-foreground">S:</span> {note.subjective}</p> : null}
                  {note.objective !== "" ? <p><span className="text-muted-foreground">O:</span> {note.objective}</p> : null}
                  {note.assessment !== "" ? <p><span className="text-muted-foreground">A:</span> {note.assessment}</p> : null}
                  {note.plan !== "" ? <p><span className="text-muted-foreground">P:</span> {note.plan}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Mount into the dental section**

In `src/app/(dashboard)/customers/[id]/dental/dental-section.tsx`: import `VisitNotesCard` and render it inside the grid after `<ClinicalRecordCard .../>`.

- [ ] **Step 7: Verify typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add clients/projects/salon-os/src/lib/validations/visit-note.ts \
        clients/projects/salon-os/src/lib/queries/visit-notes.ts \
        clients/projects/salon-os/src/hooks/use-visit-notes.ts \
        clients/projects/salon-os/src/app/\(dashboard\)/customers/\[id\]/dental/
git commit -m "feat(salon-os): visit notes card with signing (odontologia only)"
```

---

## Task 9: Findings data slice (validation + query + actions + hook)

**Files:**
- Create: `src/lib/validations/odontogram-finding.ts`, `src/lib/queries/odontogram-findings.ts`, `src/hooks/use-odontogram.ts`, `src/tests/unit/odontogram-finding-validation.test.ts`
- Modify: `src/app/(dashboard)/customers/[id]/dental/actions.ts`

**Interfaces:**
- Produces: `odontogramFindingSchema`/`OdontogramFindingInput`; `fetchOdontogramFindings()` + `odontogramKeys`; `addFinding()`/`deleteFinding()`/`resolveFinding()` actions; `useOdontogramFindings`/`useAddFinding`/`useDeleteFinding`/`useResolveFinding`.

- [ ] **Step 1: Write the failing validation test**

Create `src/tests/unit/odontogram-finding-validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { odontogramFindingSchema } from "@/lib/validations/odontogram-finding";

describe("odontogram finding validation", () => {
  it("acepta un hallazgo por superficie con FDI válido", () => {
    const r = odontogramFindingSchema.safeParse({
      fdi_code: 16,
      type: "caries",
      surfaces: ["occlusal_incisal"],
      state: "existing",
      condition: "pathological",
    });
    expect(r.success).toBe(true);
  });
  it("rechaza un FDI fuera de rango (mismo criterio que el CHECK)", () => {
    expect(odontogramFindingSchema.safeParse({ fdi_code: 19, type: "caries" }).success).toBe(false);
    expect(odontogramFindingSchema.safeParse({ fdi_code: 99, type: "caries" }).success).toBe(false);
  });
  it("rechaza una superficie no válida", () => {
    expect(
      odontogramFindingSchema.safeParse({ fdi_code: 16, type: "caries", surfaces: ["top"] }).success,
    ).toBe(false);
  });
  it("rechaza un type fuera del catálogo", () => {
    expect(odontogramFindingSchema.safeParse({ fdi_code: 16, type: "banana" }).success).toBe(false);
  });
  it("surfaces por defecto = [] cuando se omite", () => {
    const r = odontogramFindingSchema.parse({ fdi_code: 21, type: "corona" });
    expect(r.surfaces).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/odontogram-finding-validation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the validation schema**

Create `src/lib/validations/odontogram-finding.ts`:
```ts
import { z } from "zod";

import { isValidFdi } from "@/lib/odontogram/tooth";

const surface = z.enum([
  "mesial",
  "distal",
  "occlusal_incisal",
  "vestibular",
  "lingual_palatal",
]);

const findingType = z.enum([
  "caries", "obturacion", "corona", "puente", "implante", "ausente",
  "extraccion_indicada", "endodoncia", "sellador", "fractura", "movilidad",
  "incluido", "carilla", "perno", "resto_radicular", "giroversion",
]);

export const odontogramFindingSchema = z.object({
  fdi_code: z
    .number()
    .int()
    .refine(isValidFdi, "Código FDI no válido"),
  type: findingType,
  surfaces: z.array(surface).default([]),
  state: z.enum(["existing", "planned", "done"]).default("existing"),
  condition: z.enum(["healthy", "pathological"]).default("pathological"),
  grade: z.number().int().min(0).max(3).nullable().optional(),
  note: z.string().trim().max(2000).optional().transform((v) => (v === "" ? undefined : v)),
});

export type OdontogramFindingInput = z.input<typeof odontogramFindingSchema>;
export type OdontogramFindingValues = z.output<typeof odontogramFindingSchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/odontogram-finding-validation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Query**

Create `src/lib/queries/odontogram-findings.ts`:
```ts
import { createClient } from "@/lib/supabase/client";
import type { OdontogramFinding } from "@/types/database";

export const odontogramKeys = {
  findings: (salonId: string, patientId: string) =>
    ["odontogram", salonId, patientId] as const,
};

/** Hallazgos ACTIVOS (resolved_at is null) del odontograma de un paciente. */
export async function fetchOdontogramFindings(
  salonId: string,
  patientId: string,
): Promise<OdontogramFinding[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("odontogram_findings")
    .select("*")
    .eq("salon_id", salonId)
    .eq("patient_id", patientId)
    .is("resolved_at", null)
    .order("fdi_code", { ascending: true })
    .order("detected_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 6: Extend the dental actions file**

Append to `src/app/(dashboard)/customers/[id]/dental/actions.ts` (add imports):
```ts
import {
  odontogramFindingSchema,
  type OdontogramFindingInput,
} from "@/lib/validations/odontogram-finding";
import type { OdontogramFinding } from "@/types/database";

/** Añade un hallazgo al odontograma del paciente. author_id = auth.uid() (DEFAULT). */
export async function addFinding(
  patientId: string,
  input: OdontogramFindingInput,
): Promise<DentalActionResult<OdontogramFinding>> {
  const parsed = odontogramFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("odontogram_findings")
    .insert({
      salon_id: salonId,
      patient_id: patientId,
      fdi_code: parsed.data.fdi_code,
      type: parsed.data.type,
      surfaces: parsed.data.surfaces,
      state: parsed.data.state,
      condition: parsed.data.condition,
      grade: parsed.data.grade ?? null,
      note: parsed.data.note ?? null,
    })
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath(`/odontograma`);
  revalidatePath(`/customers/${patientId}`);
  return { ok: true, data };
}

/** Borra un hallazgo recién creado (corrección). Aislado por salón. */
export async function deleteFinding(
  patientId: string,
  findingId: string,
): Promise<DentalActionResult<null>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const { error } = await supabase
    .from("odontogram_findings")
    .delete()
    .eq("id", findingId)
    .eq("salon_id", salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath(`/odontograma`);
  revalidatePath(`/customers/${patientId}`);
  return { ok: true, data: null };
}

/** Cierra un hallazgo (resolved_at = ahora); soft-close event-sourced. */
export async function resolveFinding(
  patientId: string,
  findingId: string,
): Promise<DentalActionResult<OdontogramFinding>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: "No tienes un salón asignado" };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("odontogram_findings")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", findingId)
    .eq("salon_id", salonId)
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath(`/odontograma`);
  revalidatePath(`/customers/${patientId}`);
  return { ok: true, data };
}
```

- [ ] **Step 7: Hook**

Create `src/hooks/use-odontogram.ts`:
```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addFinding,
  deleteFinding,
  resolveFinding,
} from "@/app/(dashboard)/customers/[id]/dental/actions";
import {
  fetchOdontogramFindings,
  odontogramKeys,
} from "@/lib/queries/odontogram-findings";
import type { OdontogramFindingInput } from "@/lib/validations/odontogram-finding";
import type { OdontogramFinding } from "@/types/database";

export function useOdontogramFindings(salonId: string, patientId: string) {
  return useQuery({
    queryKey: odontogramKeys.findings(salonId, patientId),
    queryFn: () => fetchOdontogramFindings(salonId, patientId),
  });
}

export function useAddFinding(salonId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OdontogramFindingInput): Promise<OdontogramFinding> => {
      const result = await addFinding(patientId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: odontogramKeys.findings(salonId, patientId),
      });
    },
  });
}

export function useDeleteFinding(salonId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (findingId: string): Promise<string> => {
      const result = await deleteFinding(patientId, findingId);
      if (!result.ok) throw new Error(result.error);
      return findingId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: odontogramKeys.findings(salonId, patientId),
      });
    },
  });
}

export function useResolveFinding(salonId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (findingId: string): Promise<OdontogramFinding> => {
      const result = await resolveFinding(patientId, findingId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: odontogramKeys.findings(salonId, patientId),
      });
    },
  });
}
```

- [ ] **Step 8: Verify typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass (+5 validation tests).

- [ ] **Step 9: Commit**

```bash
git add clients/projects/salon-os/src/lib/validations/odontogram-finding.ts \
        clients/projects/salon-os/src/lib/queries/odontogram-findings.ts \
        clients/projects/salon-os/src/hooks/use-odontogram.ts \
        clients/projects/salon-os/src/tests/unit/odontogram-finding-validation.test.ts \
        clients/projects/salon-os/src/app/\(dashboard\)/customers/\[id\]/dental/actions.ts
git commit -m "feat(salon-os): odontogram findings data slice (validation + actions + hooks)"
```

---

## Task 10: Odontograma chart component (clickable FDI dentition, colored by state)

**Files:**
- Create: `src/components/odontogram/odontogram-chart.tsx`, `src/tests/unit/odontogram-chart.test.tsx`

**Interfaces:**
- Consumes: `PERMANENT_FDI`/`PRIMARY_FDI`/`toothFromFdi`/`surfaceLabel` (tooth), `worstColor`/`FINDING_COLORS` (color), `FINDING_CATALOG`/`catalogEntry` (catalog), `OdontogramFinding`, `ToothSurface`, `OdontogramFindingType`, `OdontogramFindingInput`.
- Produces: `<OdontogramChart findings onAddFinding onDeleteFinding pending? />` — presentational (no data fetching), fully testable.

- [ ] **Step 1: Write the failing component test**

Create `src/tests/unit/odontogram-chart.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { OdontogramChart } from "@/components/odontogram/odontogram-chart";
import { FINDING_COLORS } from "@/lib/odontogram/color";
import type { OdontogramFinding } from "@/types/database";

function finding(part: Partial<OdontogramFinding>): OdontogramFinding {
  return {
    id: "f1",
    salon_id: "s1",
    patient_id: "p1",
    fdi_code: 16,
    type: "caries",
    surfaces: [],
    span: null,
    state: "existing",
    condition: "pathological",
    grade: null,
    detected_at: "2026-07-31T00:00:00Z",
    resolved_at: null,
    author_id: "u1",
    note: null,
    created_at: "2026-07-31T00:00:00Z",
    updated_at: "2026-07-31T00:00:00Z",
    ...part,
  };
}

describe("OdontogramChart", () => {
  it("renderiza los 32 dientes permanentes como botones", () => {
    render(<OdontogramChart findings={[]} onAddFinding={vi.fn()} onDeleteFinding={vi.fn()} />);
    expect(screen.getByRole("button", { name: /diente 18/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /diente 48/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("tooth").length).toBe(32);
  });
  it("pinta un diente con caries (patológico) en rojo (pendiente)", () => {
    render(
      <OdontogramChart
        findings={[finding({ fdi_code: 16, condition: "pathological", state: "existing" })]}
        onAddFinding={vi.fn()}
        onDeleteFinding={vi.fn()}
      />,
    );
    const tooth = screen.getByRole("button", { name: /diente 16/i });
    expect(tooth).toHaveStyle({ borderColor: FINDING_COLORS.pending.fill });
  });
  it("pinta una obturación (hecho) en azul", () => {
    render(
      <OdontogramChart
        findings={[finding({ fdi_code: 16, type: "obturacion", condition: "healthy", state: "done" })]}
        onAddFinding={vi.fn()}
        onDeleteFinding={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /diente 16/i })).toHaveStyle({
      borderColor: FINDING_COLORS.done.fill,
    });
  });
  it("al elegir un diente y un tipo, llama onAddFinding con el FDI y el default del catálogo", () => {
    const onAdd = vi.fn();
    render(<OdontogramChart findings={[]} onAddFinding={onAdd} onDeleteFinding={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /diente 16/i }));
    const panel = screen.getByTestId("tooth-editor");
    fireEvent.click(within(panel).getByRole("button", { name: "Caries" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ fdi_code: 16, type: "caries", state: "existing", condition: "pathological" }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/odontogram-chart.test.tsx`
Expected: FAIL (component not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/odontogram/odontogram-chart.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FINDING_CATALOG, catalogEntry } from "@/lib/odontogram/catalog";
import { FINDING_COLORS, worstColor } from "@/lib/odontogram/color";
import {
  PERMANENT_FDI,
  PRIMARY_FDI,
  surfaceLabel,
  toothFromFdi,
} from "@/lib/odontogram/tooth";
import { cn } from "@/lib/utils";
import type {
  OdontogramFinding,
  OdontogramFindingType,
  ToothSurface,
} from "@/types/database";
import type { OdontogramFindingInput } from "@/lib/validations/odontogram-finding";

const ALL_SURFACES: ToothSurface[] = [
  "mesial",
  "distal",
  "occlusal_incisal",
  "vestibular",
  "lingual_palatal",
];

interface OdontogramChartProps {
  findings: OdontogramFinding[];
  onAddFinding: (input: OdontogramFindingInput) => void;
  onDeleteFinding: (findingId: string) => void;
  pending?: boolean;
}

/** Dientes de un cuadrante, ordenados para la vista (de fuera a dentro si `reverse`). */
function quadrantRow(codes: readonly number[], quadrant: number, reverse: boolean): number[] {
  const row = codes.filter((c) => Math.floor(c / 10) === quadrant);
  return reverse ? [...row].reverse() : row;
}

export function OdontogramChart({
  findings,
  onAddFinding,
  onDeleteFinding,
  pending = false,
}: OdontogramChartProps): React.ReactElement {
  const [selected, setSelected] = useState<number | null>(null);
  const [surfaces, setSurfaces] = useState<ToothSurface[]>([]);

  /** Hallazgos activos agrupados por diente (para color y edición). */
  const byTooth = useMemo(() => {
    const map = new Map<number, OdontogramFinding[]>();
    for (const f of findings) {
      const list = map.get(f.fdi_code) ?? [];
      list.push(f);
      map.set(f.fdi_code, list);
    }
    return map;
  }, [findings]);

  function toothColor(fdi: number): string | null {
    const list = byTooth.get(fdi) ?? [];
    const color = worstColor(list);
    return color === null ? null : FINDING_COLORS[color].fill;
  }

  function toggleSurface(s: ToothSurface): void {
    setSurfaces((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function pick(fdi: number): void {
    setSelected((prev) => (prev === fdi ? null : fdi));
    setSurfaces([]);
  }

  function addOfType(type: OdontogramFindingType): void {
    if (selected === null) return;
    const entry = catalogEntry(type);
    if (entry === undefined) return;
    onAddFinding({
      fdi_code: selected,
      type,
      surfaces: entry.perSurface ? surfaces : [],
      state: entry.defaultState,
      condition: entry.defaultCondition,
    });
    setSelected(null);
    setSurfaces([]);
  }

  function ToothButton({ fdi }: { fdi: number }): React.ReactElement {
    const border = toothColor(fdi);
    const isSelected = selected === fdi;
    return (
      <button
        type="button"
        data-testid="tooth"
        aria-label={`Diente ${fdi}`}
        aria-pressed={isSelected}
        onClick={() => pick(fdi)}
        className={cn(
          "flex h-11 w-9 flex-col items-center justify-center rounded-md border-2 bg-card text-xs font-medium tabular-nums transition-colors hover:bg-accent",
          isSelected && "ring-2 ring-primary ring-offset-1",
        )}
        style={border !== null ? { borderColor: border } : undefined}
      >
        {fdi}
      </button>
    );
  }

  function ToothRow({ codes }: { codes: number[] }): React.ReactElement {
    return (
      <div className="flex gap-1">
        {codes.map((fdi) => (
          <ToothButton key={fdi} fdi={fdi} />
        ))}
      </div>
    );
  }

  const permUpper = [
    ...quadrantRow(PERMANENT_FDI, 1, true),
    ...quadrantRow(PERMANENT_FDI, 2, false),
  ];
  const permLower = [
    ...quadrantRow(PERMANENT_FDI, 4, true),
    ...quadrantRow(PERMANENT_FDI, 3, false),
  ];
  const primUpper = [
    ...quadrantRow(PRIMARY_FDI, 5, true),
    ...quadrantRow(PRIMARY_FDI, 6, false),
  ];
  const primLower = [
    ...quadrantRow(PRIMARY_FDI, 8, true),
    ...quadrantRow(PRIMARY_FDI, 7, false),
  ];

  const selectedTooth = selected !== null ? toothFromFdi(selected) : null;
  const selectedFindings = selected !== null ? byTooth.get(selected) ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-2" style={{ borderColor: FINDING_COLORS.pending.fill }} />
          {FINDING_COLORS.pending.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-2" style={{ borderColor: FINDING_COLORS.done.fill }} />
          {FINDING_COLORS.done.label}
        </span>
      </div>

      <div className="space-y-2 overflow-x-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permanente</p>
        <ToothRow codes={permUpper} />
        <ToothRow codes={permLower} />
      </div>

      <div className="space-y-2 overflow-x-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Temporal</p>
        <ToothRow codes={primUpper} />
        <ToothRow codes={primLower} />
      </div>

      {selectedTooth !== null ? (
        <div data-testid="tooth-editor" className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">Diente {selectedTooth.fdi}</p>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {selectedFindings.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {selectedFindings.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-md border bg-card px-2 py-1 text-sm">
                  <span>
                    {catalogEntry(f.type)?.label ?? f.type}
                    {f.surfaces.length > 0
                      ? ` · ${f.surfaces.map((s) => surfaceLabel(s, selectedTooth)).join(", ")}`
                      : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => onDeleteFinding(f.id)}
                    aria-label={`Quitar ${catalogEntry(f.type)?.label ?? f.type}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mb-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Superficies (opcional)</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SURFACES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={surfaces.includes(s)}
                  onClick={() => toggleSurface(s)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    surfaces.includes(s) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                  )}
                >
                  {surfaceLabel(s, selectedTooth)}
                </button>
              ))}
            </div>
          </div>

          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Añadir hallazgo</p>
          <div className="flex flex-wrap gap-1.5">
            {FINDING_CATALOG.map((entry) => (
              <Button
                key={entry.type}
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => addOfType(entry.type)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Selecciona un diente para ver o añadir hallazgos.</p>
      )}
    </div>
  );
}
```

Note: confirm `cn` is exported from `@/lib/utils` (shadcn convention in this repo); if the helper lives elsewhere, import it from the same path the existing UI components use.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/odontogram-chart.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/components/odontogram/odontogram-chart.tsx \
        clients/projects/salon-os/src/tests/unit/odontogram-chart.test.tsx
git commit -m "feat(salon-os): clickable FDI odontogram chart (red/blue by state)"
```

---

## Task 11: `/odontograma` route (sector-gated) + patient link on the patient page

**Files:**
- Create: `src/app/(dashboard)/odontograma/page.tsx`, `src/app/(dashboard)/odontograma/odontograma-view.tsx`, `src/app/(dashboard)/odontograma/patient-picker.tsx`
- Modify: `src/app/(dashboard)/customers/[id]/customer-detail-view.tsx`

**Interfaces:**
- Consumes: `getActiveSalonSector`/`getActiveSalonId`, `useCustomers` (patient picker reuse), `useOdontogramFindings`/`useAddFinding`/`useDeleteFinding`, `OdontogramChart`.
- Produces: `/odontograma` (picker) and `/odontograma?patient=<id>` (chart); a dental "Odontograma" button on the patient detail.

- [ ] **Step 1: Server page with sector guard (defense in depth)**

Create `src/app/(dashboard)/odontograma/page.tsx`:
```tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OdontogramaView } from "@/app/(dashboard)/odontograma/odontograma-view";
import { PatientPicker } from "@/app/(dashboard)/odontograma/patient-picker";
import { getActiveSalonId, getActiveSalonSector } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Odontograma" };

interface OdontogramaPageProps {
  searchParams: { patient?: string };
}

export default async function OdontogramaPage({
  searchParams,
}: OdontogramaPageProps): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) redirect("/login?next=/odontograma");

  // Guard de sector (defensa en profundidad, como facturacion re-chequea `pos`).
  const sector = await getActiveSalonSector();
  if (sector !== "odontologia") redirect("/dashboard");

  const salonId = await getActiveSalonId();
  if (salonId === null) notFound();

  const patientId = searchParams.patient ?? null;

  if (patientId === null) {
    return (
      <main className="container py-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Odontograma</h1>
          <p className="mt-1.5 text-muted-foreground">Elige un paciente para ver su carta dental.</p>
        </div>
        <PatientPicker salonId={salonId} />
      </main>
    );
  }

  const { data: patient, error } = await supabase
    .from("customers")
    .select("id, full_name")
    .eq("salon_id", salonId)
    .eq("id", patientId)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  if (patient === null) notFound();

  return (
    <main className="container py-8 md:py-10">
      <OdontogramaView salonId={salonId} patientId={patient.id} patientName={patient.full_name} />
    </main>
  );
}
```

- [ ] **Step 2: Patient picker (client, reuses the patients query)**

Create `src/app/(dashboard)/odontograma/patient-picker.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomers } from "@/hooks/use-customers";

export function PatientPicker({ salonId }: { salonId: string }): React.ReactElement {
  const [search, setSearch] = useState("");
  const query = useCustomers(salonId, search);

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar paciente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {query.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : query.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pacientes que coincidan.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {query.data.map((p) => (
            <li key={p.id}>
              <Link
                href={`/odontograma?patient=${p.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-accent"
              >
                <span className="font-medium">{p.full_name}</span>
                <span className="text-muted-foreground">Ver odontograma →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Odontograma view (client, wires chart to data)**

Create `src/app/(dashboard)/odontograma/odontograma-view.tsx`:
```tsx
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { OdontogramChart } from "@/components/odontogram/odontogram-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAddFinding,
  useDeleteFinding,
  useOdontogramFindings,
} from "@/hooks/use-odontogram";

interface OdontogramaViewProps {
  salonId: string;
  patientId: string;
  patientName: string;
}

export function OdontogramaView({
  salonId,
  patientId,
  patientName,
}: OdontogramaViewProps): React.ReactElement {
  const query = useOdontogramFindings(salonId, patientId);
  const add = useAddFinding(salonId, patientId);
  const remove = useDeleteFinding(salonId, patientId);

  return (
    <div className="space-y-6">
      <Link
        href="/odontograma"
        className="group inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Volver a pacientes
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Odontograma · {patientName}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isError ? (
            <p className="text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : "Error al cargar el odontograma"}
            </p>
          ) : (
            <OdontogramChart
              findings={query.data ?? []}
              pending={add.isPending || remove.isPending}
              onAddFinding={(input) => add.mutate(input)}
              onDeleteFinding={(id) => remove.mutate(id)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Odontograma link on the patient detail (dental only)**

In `src/app/(dashboard)/customers/[id]/customer-detail-view.tsx`: in the header actions `<div className="flex gap-2">`, add (guarded by `dentalEnabled`), before the Editar button:
```tsx
{dentalEnabled ? (
  <Button variant="outline" asChild>
    <Link href={`/odontograma?patient=${customerId}`}>
      <LayoutGrid className="mr-2 h-4 w-4" aria-hidden="true" />
      Odontograma
    </Link>
  </Button>
) : null}
```
Add `LayoutGrid` to the existing `lucide-react` import.

- [ ] **Step 5: Verify typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 6: Manual smoke (dev server running)**

```bash
curl -s -o /dev/null -w "odonto %{http_code}\n" --max-time 45 "http://localhost:3000/odontograma"
```
Expected: `307` (redirect to /login when unauthenticated, or /dashboard for a non-dental sector) — no compile error in dev output.

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/src/app/\(dashboard\)/odontograma/ \
        clients/projects/salon-os/src/app/\(dashboard\)/customers/\[id\]/customer-detail-view.tsx
git commit -m "feat(salon-os): /odontograma route (sector-gated) + patient odontograma link"
```

---

## Task 12: "Odontograma" nav entry (odontología only) + end-to-end verification

**Files:**
- Modify: `src/components/dashboard-nav-items.ts`
- Test: `src/tests/unit/dashboard-nav-items-odontograma.test.ts`

**Interfaces:**
- Consumes: existing `buildDashboardNavItems({ showSettings, hasPos, sector })`, `SECTOR_REGISTRY`.
- Produces: for `sector="odontologia"`, the nav includes `{ href: "/odontograma", label: "Odontograma" }`; other sectors unchanged.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/dashboard-nav-items-odontograma.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildDashboardNavItems } from "@/components/dashboard-nav-items";

describe("buildDashboardNavItems — Odontograma (odontología)", () => {
  it("odontología incluye Odontograma y Pacientes", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "odontologia" });
    expect(items.some((i) => i.href === "/odontograma")).toBe(true);
    expect(items.some((i) => i.label === "Odontograma")).toBe(true);
    expect(items.some((i) => i.label === "Pacientes")).toBe(true);
  });
  it("peluquería NO muestra Odontograma", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "peluqueria" });
    expect(items.some((i) => i.href === "/odontograma")).toBe(false);
  });
  it("restauración (cascarón) NO muestra Odontograma", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
    expect(items.some((i) => i.href === "/odontograma")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-odontograma.test.ts`
Expected: FAIL (odontología branch does not add Odontograma yet).

- [ ] **Step 3: Extend `buildDashboardNavItems`**

In `src/components/dashboard-nav-items.ts`: add `Grid3x3` to the `lucide-react` import. Replace the final odontología return (the `return items.map(...)` relabel block) with a version that relabels AND inserts Odontograma after the (relabeled) patients item:
```ts
  const relabeled = items.map((item) =>
    item.href === "/customers"
      ? { ...item, label: config.terms.customerPlural }
      : item,
  );

  if (sector === "odontologia") {
    const odontograma: NavItem = { href: "/odontograma", label: "Odontograma", icon: Grid3x3 };
    const patientsIndex = relabeled.findIndex((item) => item.href === "/customers");
    if (patientsIndex === -1) return [...relabeled, odontograma];
    return [
      ...relabeled.slice(0, patientsIndex + 1),
      odontograma,
      ...relabeled.slice(patientsIndex + 1),
    ];
  }

  return relabeled;
```
(Keep the `if (sector === "peluqueria") return items;` fast path and the non-implemented shell branch exactly as they are.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-odontograma.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full typecheck + suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; ALL tests green (1251 baseline + all new: sector-brand 5, tooth 7, color 5, catalog 4, finding-validation 5, chart 4, nav-odontograma 3 ≈ +33).

- [ ] **Step 6: End-to-end DB smoke (Management API)**

Verify the three tables exist with RLS + tenant isolation intact, using the Task 2 helper:
```
for t in ('clinical_records','visit_notes','odontogram_findings'):
    print(t, run(f"select relrowsecurity from pg_class where oid='public.{t}'::regclass;"))
print(run("select tablename, count(*) from pg_policies where tablename in ('clinical_records','visit_notes','odontogram_findings') group by tablename order by tablename;"))
```
Expected: each table `relrowsecurity = true`; the policy counts are `clinical_records: 4`, `visit_notes: 4`, `odontogram_findings: 4`.

- [ ] **Step 7: End-to-end manual smoke (dental demo tenant)**

Reusing the dental demo tenant from Plan 1 Task 10 (`sector='odontologia'`, e.g. `demo-dental`; NEVER touch `denueveanueve` or the peluquería `demo`):
- Log in via `?sector=odontologia` → the panel brand is teal (Task 1) and the nav shows **Pacientes** + **Odontograma**.
- A patient detail page shows the **Ficha clínica** + **Notas de visita** cards and an **Odontograma** button.
- `/odontograma` lists patients; picking one shows the chart. Click a tooth → add "Caries" → the tooth turns red; add "Obturación" on another → blue. Delete a finding → it disappears. Sign a visit note → it shows "Firmada" and re-editing/deleting it is rejected by the trigger.
- Log in as the peluquería `demo` via `?sector=peluqueria` → nav is unchanged (**Clientes**, no Odontograma), the look is the original violet, and hitting `/odontograma` directly redirects to `/dashboard`.

- [ ] **Step 8: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items-odontograma.test.ts
git commit -m "feat(salon-os): Odontograma nav entry (odontologia only) + e2e verification"
```

---

## Self-Review (author checklist — completed)

- **Spec coverage:**
  - §4.6 marca por defecto del sector → **T1** (`resolveEffectiveBranding`, teal vs violet; peluquería byte-identical).
  - §5.1 ficha clínica `clinical_records` → **T2** (table) + **T7** (UI). `visit_notes` + inmutabilidad de firmadas → **T3** (table + trigger) + **T8** (UI + sign).
  - §6.1 clave FDI + superficies (derivaciones, oclusal↔incisal, palatino↔lingual) → **T5** (pure tooth model, unit-tested).
  - §6.2 `odontogram_findings` event-sourced (type/surfaces/span/state/condition/grade/detected_at/resolved_at/author_id), red=pending/blue=done → **T4** (table + enums) + **T6** (pure color + catalog, unit-tested) + **T9** (data slice) + **T10** (chart UI, component-tested).
  - §9 gating por sector + defensa en profundidad → **T11** (`/odontograma` server guard) + **T12** (nav gate). Cada página dental re-chequea el sector en servidor.
  - §11 RLS/aislamiento (salon_id NOT NULL, FK compuesta (id, salon_id), RLS `app.user_salon_ids()`, gate de rol, inmutabilidad por trigger, guardián) → **T2, T3, T4** (every migration) + **T12 Step 6** (DB smoke).
  - §14 fase 2 (dental clinical core: clinical_records, visit_notes, odontograma FDI + findings + chart) → this whole plan.
- **Migrations after `20260731100000`:** `20260731110000`, `20260731120000`, `20260731130000` — all applied via the Management API exactly like Plan 1 (token/ref/User-Agent verbatim). Every new table: `salon_id NOT NULL`, composite FK `(patient_id, salon_id) → customers(id, salon_id)`, RLS SELECT/INSERT by `app.user_salon_ids()`, role gate (staff+) on writes, in-migration guard.
- **TDD + no placeholders:** every module with logic ships a failing test first (T1, T5, T6, T9, T10, T12); DB + glue tasks (T2, T3, T4, T7, T8, T11) are verified by migration-apply + `tsc` + full suite + manual/DB smoke, mirroring Plan 1's glue tasks. No `TODO`/"similar to Task N" — all code is complete.
- **Type consistency:** `ClinicalRecord`, `VisitNote`, `OdontogramFinding`, `ToothSurface`, `OdontogramFindingType/State/Condition` exported from `@/types/database`; `Tooth`/`isValidFdi`/`surfaceLabel` (tooth), `FindingColor`/`worstColor`/`FINDING_COLORS` (color), `FINDING_CATALOG`/`catalogEntry` (catalog), `odontogramFindingSchema`, the dental Server Actions (`upsertClinicalRecord`, `addVisitNote`, `signVisitNote`, `addFinding`, `deleteFinding`, `resolveFinding`), and the hooks are used consistently across tasks.
- **Branch:** all commits land on `hat3x/HAT3X-035` in the nested repo — no new branches.

## Next plans (separate documents)

- Plan 3 — Periodontograma + evolutivo ("boca en fecha X" time-travel / snapshots). (Spec §6.3–§6.4)
- Plan 4 — Planes de tratamiento / presupuestos + enlace odontograma↔factura (materializa findings `planned`→rojo / `done`→azul; `resolved_at` conducido por el plan). (Spec §7)
- Plan 5 — Consentimientos + imágenes/radiografías (Storage con RLS por paciente/salón). (Spec §8)
- Plan 6 — Cascarón restauración (nav "Próximamente" ya sentado en Plan 1; features de mesas/comandas/cocina). (Spec §10)
