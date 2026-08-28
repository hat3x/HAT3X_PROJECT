# Periodontograma + Evolutivo (Fase 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir al vertical odontología de Salón OS el **periodontograma** (snapshots de sondaje por exploración: 6 sitios/diente, PD, margen gingival, CAL derivado, sangrado, supuración, placa, movilidad, furca; con roll-ups %BoP / peor PD / CAL medio) y el **evolutivo** (reconstrucción "boca en fecha X" del odontograma event-sourced + historial/comparación de exploraciones perio).

**Architecture:** Sigue el patrón dental ya existente. Los sondajes perio son **snapshots inmutables por exploración** (`perio_exam` → `perio_tooth` → `perio_site`); el CAL es columna generada `pd_mm - gingival_margin_mm`. El evolutivo del odontograma es un **fold puro** del log event-sourced `odontogram_findings` (que ya tiene `detected_at`/`resolved_at`) hasta una fecha. Módulos puros unit-testeados (`perio.ts`, `fold.ts`), queries con el idiom fetch-DESC + derive, hooks TanStack, UI con los componentes `src/components/dental/*` como referencia de estilo. Gating por `salons.sector = 'odontologia'` con defensa en profundidad.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase (Postgres + RLS), TanStack Query v5, Tailwind + shadcn/ui, Vitest + Testing Library.

## Global Constraints

- **Repo git ANIDADO** en `clients/projects/salon-os`, rama actual **`hat3x/HAT3X-037`**: commitea ahí, **NO crees ramas**. Ejecuta `npx`/`npm` desde `clients/projects/salon-os`.
- **TypeScript strict, sin `any`.** `npx tsc --noEmit -p tsconfig.json` debe salir **0**.
- **La suite existente (1436 tests ahora) debe seguir verde:** `npx vitest run`. **TDD por tarea** (test que falla → implementar → verde → commit). Commits pequeños y descriptivos.
- **Migraciones con timestamp > `20260731130000`** (usa `20260731140000`, `150000`, `160000`, …), **aplicadas por la Management API de Supabase**: token `SUPABASE_API_TOKEN` en `clients/projects/denueveanueve/.env`, proyecto `jztoyekixcziaicrnlce`, endpoint `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query` con cuerpo `{"query": "<sql>"}`, header `Authorization: Bearer <token>` y **User-Agent de navegador** (Cloudflare devuelve 403/1010 al UA por defecto de Python). Guarda cada SQL como archivo de migración Y aplícalo.
- **Cada tabla nueva:** `salon_id uuid NOT NULL`, **FK compuesta anti cross-tenant** `(fk_id, salon_id)` donde referencie otra tabla del tenant (mira cómo lo resolvió `20260731120000_odontogram_findings.sql` contra `clinical_records`/`customers` y reusa el mismo destino de FK y `unique` que ya exista), **RLS** `salon_id in (select app.user_salon_ids())` para SELECT/INSERT, y **gate de rol** donde escriba personal. **Trigger de inmutabilidad** para exploraciones perio firmadas (`signed_at` no nulo ⇒ no UPDATE/DELETE de sus filas), con el mismo patrón que tenía Verifactu / las visitas firmadas.
- **No romper peluquería** (byte-idéntica) **ni tocar denueveanueve.** Todo lo perio/evolutivo se muestra y ejecuta **solo en sector odontología** (defensa en profundidad en cada página, como `facturacion/layout.tsx`).
- **Reutiliza los idioms existentes:** helpers FDI `src/lib/dental/tooth.ts` (`PERMANENT_FDI_NUMBERS`, `getTooth`, `isValidFDI`), patrón query fetch-DESC + derive de `src/lib/queries/odontogram.ts`, hooks de `src/hooks/use-odontogram.ts`, selector `src/components/dental/patient-selector.tsx`, y estilo de `src/components/dental/odontogram-chart.tsx`.

---

## File Structure

- `supabase/migrations/20260731140000_perio_exam.sql` — cabecera de exploración + RLS + trigger inmutabilidad.
- `supabase/migrations/20260731150000_perio_tooth_site.sql` — por-diente y 6-sitios + CAL generado + RLS.
- `src/lib/dental/perio.ts` — módulo puro: sitios, tipos, `deriveCal`, validaciones, roll-ups, estadificación.
- `src/lib/dental/fold.ts` — módulo puro: `foldFindingsAsOf(findings, isoDate)` → estado por diente a una fecha.
- `src/types/database.ts` — filas/inserts `PerioExam`, `PerioTooth`, `PerioSite` (+ enum `PerioSite`).
- `src/lib/queries/perio.ts` — fetch exploraciones/dientes/sitios + derive; cache keys.
- `src/hooks/use-perio.ts` — hooks TanStack (listar, cargar exploración, guardar, firmar).
- `src/app/(dashboard)/periodontograma/{layout,page,actions}.tsx` — página gated + server actions.
- `src/components/dental/perio-chart.tsx` — carta de sondaje editable (6 sitios/diente).
- `src/components/dental/perio-summary.tsx` — panel de roll-ups.
- `src/components/dental/evolution-date-picker.tsx` — selector "boca en fecha X" para el odontograma.
- `src/components/dental/perio-history.tsx` — historial/comparación de exploraciones.
- `src/components/dashboard-nav-items.ts` — entrada de nav "Periodontograma" (solo odontología).
- Seed: script `scripts/seed-demo-perio.mjs` (o SQL aplicado por Management API) para `demo-dental`.

---

## Task 1: Migración `perio_exam` (cabecera + RLS + inmutabilidad)

**Files:**
- Create: `supabase/migrations/20260731140000_perio_exam.sql`
- Test: `src/tests/unit/perio-exam-migration.test.ts` (valida forma esperada del SQL: columnas, RLS, trigger — igual que los tests de migración existentes de la Fase 1/2)

**Interfaces:**
- Produces: tabla `perio_exam(id, salon_id, patient_id, exam_date, examiner_id, notes, signed_at, created_at, created_by)`. `signed_at` no nulo ⇒ snapshot inmutable (bloquea UPDATE/DELETE de exam y de sus tooth/site — el trigger de tooth/site va en la Task 2).

- [ ] **Step 1: Escribe el SQL de migración**

```sql
-- 20260731140000_perio_exam.sql
create table if not exists public.perio_exam (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons(id) on delete cascade,
  patient_id  uuid not null,
  exam_date   date not null default current_date,
  examiner_id uuid,
  notes       text,
  signed_at   timestamptz,          -- null = borrador; no nulo = snapshot inmutable
  created_at  timestamptz not null default now(),
  created_by  uuid,
  -- FK compuesta anti cross-tenant: usa el MISMO destino que odontogram_findings
  -- (clinical_records(customer_id, salon_id) o customers(id, salon_id), según exista el unique).
  constraint perio_exam_patient_fk
    foreign key (patient_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade
);

create index if not exists perio_exam_patient_idx
  on public.perio_exam (salon_id, patient_id, exam_date desc);

alter table public.perio_exam enable row level security;

create policy perio_exam_select on public.perio_exam
  for select using (salon_id in (select app.user_salon_ids()));
create policy perio_exam_insert on public.perio_exam
  for insert with check (salon_id in (select app.user_salon_ids()));
create policy perio_exam_update on public.perio_exam
  for update using (salon_id in (select app.user_salon_ids()));

-- Inmutabilidad: una exploración firmada no puede editarse ni borrarse.
create or replace function public.perio_exam_guard_signed()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE') then
    if old.signed_at is not null then
      raise exception 'perio_exam firmada es inmutable';
    end if;
    return old;
  end if;
  -- UPDATE: si ya estaba firmada, prohíbe cualquier cambio salvo pasar de no-firmada a firmada.
  if old.signed_at is not null then
    raise exception 'perio_exam firmada es inmutable';
  end if;
  return new;
end $$;

create trigger perio_exam_guard
  before update or delete on public.perio_exam
  for each row execute function public.perio_exam_guard_signed();
```

> Verifica primero contra `20260731120000_odontogram_findings.sql` el destino EXACTO de la FK de paciente (tabla + columnas del `unique`) y úsalo aquí. Si el `unique(customer_id, salon_id)` no existe donde apuntas, apunta al que sí exista (customers) — **no** modifiques tablas compartidas para forzarlo.

- [ ] **Step 2: Aplica la migración por la Management API** (con User-Agent de navegador) y verifica `perio_exam` existe (`select` a `information_schema.columns`).
- [ ] **Step 3: Test de forma del SQL en verde.** Run: `npx vitest run src/tests/unit/perio-exam-migration.test.ts`
- [ ] **Step 4: Commit** — `feat(perio): tabla perio_exam + RLS + inmutabilidad al firmar`.

---

## Task 2: Migración `perio_tooth` + `perio_site` (CAL generado + RLS)

**Files:**
- Create: `supabase/migrations/20260731150000_perio_tooth_site.sql`
- Test: `src/tests/unit/perio-site-migration.test.ts`

**Interfaces:**
- Consumes: `perio_exam(id, salon_id)` (Task 1).
- Produces: `perio_tooth(id, salon_id, perio_exam_id, fdi_tooth, mobility, furcation, plaque)` y `perio_site(id, salon_id, perio_exam_id, fdi_tooth, site, pd_mm, gingival_margin_mm, cal_mm [generado], bop, suppuration, plaque)`.

- [ ] **Step 1: SQL de migración**

```sql
-- 20260731150000_perio_tooth_site.sql
create type public.perio_site_position as enum ('MB','B','DB','ML','L','DL');

-- unique compuesto para poder referenciar (id, salon_id) desde los hijos
alter table public.perio_exam add constraint perio_exam_id_salon_uk unique (id, salon_id);

create table if not exists public.perio_tooth (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid not null references public.salons(id) on delete cascade,
  perio_exam_id uuid not null,
  fdi_tooth     smallint not null,
  mobility      smallint not null default 0 check (mobility between 0 and 3),
  furcation     jsonb,          -- p.ej. {"B":1,"L":2}
  plaque        boolean,
  constraint perio_tooth_exam_fk
    foreign key (perio_exam_id, salon_id)
    references public.perio_exam (id, salon_id) on delete cascade,
  unique (perio_exam_id, fdi_tooth)
);

create table if not exists public.perio_site (
  id                 uuid primary key default gen_random_uuid(),
  salon_id           uuid not null references public.salons(id) on delete cascade,
  perio_exam_id      uuid not null,
  fdi_tooth          smallint not null,
  site               public.perio_site_position not null,
  pd_mm              smallint not null check (pd_mm between 0 and 20),
  gingival_margin_mm smallint not null default 0 check (gingival_margin_mm between -15 and 15),
  -- CAL = PD + (−margen) = PD − margen  (margen con signo; recesión = margen negativo)
  cal_mm             smallint generated always as (pd_mm - gingival_margin_mm) stored,
  bop                boolean not null default false,
  suppuration        boolean not null default false,
  plaque             boolean not null default false,
  constraint perio_site_exam_fk
    foreign key (perio_exam_id, salon_id)
    references public.perio_exam (id, salon_id) on delete cascade,
  unique (perio_exam_id, fdi_tooth, site)
);

create index if not exists perio_site_exam_idx on public.perio_site (salon_id, perio_exam_id);
create index if not exists perio_tooth_exam_idx on public.perio_tooth (salon_id, perio_exam_id);

alter table public.perio_tooth enable row level security;
alter table public.perio_site  enable row level security;

create policy perio_tooth_select on public.perio_tooth for select using (salon_id in (select app.user_salon_ids()));
create policy perio_tooth_insert on public.perio_tooth for insert with check (salon_id in (select app.user_salon_ids()));
create policy perio_site_select  on public.perio_site  for select using (salon_id in (select app.user_salon_ids()));
create policy perio_site_insert  on public.perio_site  for insert with check (salon_id in (select app.user_salon_ids()));

-- Inmutabilidad transitiva: no editar/borrar filas cuyo exam ya está firmado.
create or replace function public.perio_child_guard_signed()
returns trigger language plpgsql as $$
declare _signed timestamptz;
begin
  select signed_at into _signed from public.perio_exam
   where id = coalesce(old.perio_exam_id, new.perio_exam_id);
  if _signed is not null then
    raise exception 'exploración perio firmada es inmutable';
  end if;
  return coalesce(new, old);
end $$;

create trigger perio_tooth_guard before update or delete on public.perio_tooth
  for each row execute function public.perio_child_guard_signed();
create trigger perio_site_guard before update or delete on public.perio_site
  for each row execute function public.perio_child_guard_signed();
```

- [ ] **Step 2:** Aplica por Management API (User-Agent navegador) y verifica `cal_mm` es columna generada (inserta pd=5, margen=-2 ⇒ cal=7).
- [ ] **Step 3:** Test de forma del SQL en verde.
- [ ] **Step 4: Commit** — `feat(perio): perio_tooth + perio_site (CAL generado) + RLS + inmutabilidad`.

---

## Task 3: Módulo puro `perio.ts` (sitios, CAL, validaciones, roll-ups)

**Files:**
- Create: `src/lib/dental/perio.ts`
- Test: `src/tests/unit/perio.test.ts`

**Interfaces:**
- Produces: `SITE_ORDER`, `PerioSitePosition`, `PerioSiteMeasurement`, `deriveCal`, `isValidPd`, `isValidMargin`, `computePerioRollups`, `perioStage`.

- [ ] **Step 1: Tests que fallan** (casos concretos):

```ts
import { describe, expect, it } from "vitest";
import { SITE_ORDER, deriveCal, isValidPd, computePerioRollups, perioStage } from "@/lib/dental/perio";

describe("perio pure", () => {
  it("SITE_ORDER son los 6 sitios en orden vestibular→lingual", () => {
    expect(SITE_ORDER).toEqual(["MB","B","DB","ML","L","DL"]);
  });
  it("deriveCal = pd - margen (recesión aumenta CAL)", () => {
    expect(deriveCal(5, 0)).toBe(5);
    expect(deriveCal(5, -2)).toBe(7);   // recesión 2mm
    expect(deriveCal(4, 2)).toBe(2);    // margen coronal
  });
  it("isValidPd acota 0..20", () => {
    expect(isValidPd(3)).toBe(true);
    expect(isValidPd(-1)).toBe(false);
    expect(isValidPd(21)).toBe(false);
  });
  it("computePerioRollups: %BoP, peor PD, CAL medio", () => {
    const sites = [
      { fdi: 11, site: "MB", pd_mm: 3, gingival_margin_mm: 0, bop: true },
      { fdi: 11, site: "B",  pd_mm: 5, gingival_margin_mm: -1, bop: false },
    ] as const;
    const r = computePerioRollups(sites);
    expect(r.bopPercent).toBe(50);
    expect(r.worstPd).toBe(5);
    expect(r.meanCal).toBeCloseTo((3 + 6) / 2, 5); // cal 3 y 6
  });
  it("perioStage por CAL máximo (I/II/III/IV)", () => {
    expect(perioStage(1)).toBe("I");
    expect(perioStage(4)).toBe("II");
    expect(perioStage(6)).toBe("III");
  });
});
```

- [ ] **Step 2: Implementa `perio.ts`** con `SITE_ORDER = ["MB","B","DB","ML","L","DL"] as const`, `deriveCal = (pd, margin) => pd - margin`, validaciones de rango, `computePerioRollups` (bopPercent redondeado, worstPd = max pd, meanCal = media de `deriveCal`) y `perioStage(maxCal)` → `"I"` (≤2), `"II"` (3–4), `"III"` (5–?), `"IV"` (≥5 con complejidad — v1: III si 5+; documenta que IV requiere señales extra fuera de alcance). Sin `any`, tipos exportados.
- [ ] **Step 3:** `npx vitest run src/tests/unit/perio.test.ts` verde.
- [ ] **Step 4: Commit** — `feat(perio): módulo puro (sitios, CAL, roll-ups, estadificación)`.

---

## Task 4: Tipos DB perio (`src/types/database.ts`)

**Files:** Modify: `src/types/database.ts`
**Interfaces:** Produces: `PerioExam`, `PerioExamInsert`, `PerioTooth`, `PerioToothInsert`, `PerioSite`, `PerioSiteInsert`, `PerioSitePosition`.

- [ ] **Step 1:** Añade las interfaces/tipos siguiendo el estilo de `OdontogramFinding`/`OdontogramFindingInsert` ya presentes (mismo naming, `Insert` sin campos derivados: `cal_mm`, `id`, `created_at`). `PerioSitePosition = "MB"|"B"|"DB"|"ML"|"L"|"DL"`.
- [ ] **Step 2:** `npx tsc --noEmit` = 0. (Sin test propio; lo cubren las tareas que los consumen.)
- [ ] **Step 3: Commit** — `feat(perio): tipos de BD perio_exam/tooth/site`.

---

## Task 5: Queries + hooks perio

**Files:**
- Create: `src/lib/queries/perio.ts`, `src/hooks/use-perio.ts`
- Test: `src/tests/unit/perio-queries.test.ts` (deriva agrupación exam→dientes→sitios de un array plano; mockea el cliente como en los tests de `odontogram` existentes)

**Interfaces:**
- Consumes: tipos Task 4, `computePerioRollups` Task 3.
- Produces: `perioKeys`, `fetchPerioExams(salonId, patientId)`, `fetchPerioExam(salonId, examId)` (dientes+sitios), `groupSitesByTooth`, hooks `usePerioExams`, `usePerioExam`, `useSavePerioExam`.

- [ ] **Step 1:** Test de `groupSitesByTooth` (array plano de `perio_site` → `Map<fdi, PerioSite[]>` en `SITE_ORDER`).
- [ ] **Step 2:** Implementa queries (patrón fetch de `odontogram.ts`: `.eq('salon_id',…)`, `.order('exam_date',{ascending:false})`) y hooks TanStack (patrón `use-odontogram.ts`: `enabled` cuando hay `patientId`, `invalidateQueries` al guardar).
- [ ] **Step 3:** vitest verde + `tsc` 0.
- [ ] **Step 4: Commit** — `feat(perio): queries + hooks TanStack`.

---

## Task 6: Server actions perio (crear/guardar/firmar, gated)

**Files:**
- Create: `src/app/(dashboard)/periodontograma/actions.ts`
- Test: `src/tests/unit/perio-actions.test.ts` (rechaza si sector ≠ odontología; rechaza escritura sin rol; scope por `salon_id`)

**Interfaces:**
- Produces: `createPerioExam(input)`, `savePerioMeasurements(examId, tooth[], site[])`, `signPerioExam(examId)` → `{ ok, data|error }` (mismo contrato que `addOdontogramFinding`).

- [ ] **Step 1:** Tests: (a) sector peluquería ⇒ `{ ok:false }`; (b) rol sin permiso de escritura ⇒ rechazo; (c) inserta acotado por `salon_id` del salón activo; (d) `signPerioExam` marca `signed_at`.
- [ ] **Step 2:** Implementa con `getActiveSalonSector`/`getActiveSalon`/`canManage…` como hacen las actions dentales existentes. Defensa en profundidad de sector aquí también.
- [ ] **Step 3:** verde + `tsc` 0.
- [ ] **Step 4: Commit** — `feat(perio): server actions (crear/guardar/firmar) gated sector+rol`.

---

## Task 7: Carta de sondaje `perio-chart.tsx`

**Files:**
- Create: `src/components/dental/perio-chart.tsx`
- Test: `src/tests/unit/perio-chart.test.tsx` (render: 32 dientes permanentes, 6 inputs de PD por diente; editar PD dispara el callback; BoP marca punto)

**Interfaces:**
- Consumes: `PERMANENT_FDI_NUMBERS`/`getTooth` (tooth.ts), `SITE_ORDER`/`deriveCal` (perio.ts), tipos Task 4.
- Produces: `<PerioChart teeth values onChange readOnly? />`.

- [ ] **Step 1: Test que falla** (RTL): dado `values` vacío en modo edición, renderiza inputs numéricos de PD por diente×sitio; teclear "5" en un sitio llama `onChange` con `{ fdi, site, pd_mm: 5 }`; con `readOnly` no hay inputs (solo lectura). Marca BoP visible.
- [ ] **Step 2:** Implementa la carta: arcada superior (vestibular arriba / palatino abajo) e inferior, 6 sitios por diente, inputs de PD y margen, toggles BoP/supuración/placa, movilidad 0–3 y furca por diente. Reutiliza estilo/escala de `odontogram-chart.tsx`. Muestra CAL derivado (readonly, vía `deriveCal`). Accesible (labels + teclado). Sin `any`.
- [ ] **Step 3:** vitest + `tsc` 0.
- [ ] **Step 4: Commit** — `feat(perio): carta de sondaje editable (6 sitios/diente)`.

---

## Task 8: Panel de roll-ups `perio-summary.tsx`

**Files:**
- Create: `src/components/dental/perio-summary.tsx`
- Test: `src/tests/unit/perio-summary.test.tsx`

**Interfaces:** Consumes `computePerioRollups`/`perioStage`. Produces `<PerioSummary sites />`.

- [ ] **Step 1:** Test: dados sitios con 1 de 2 BoP y PDs 3/5 ⇒ muestra "50% BoP", "peor PD 5 mm", "CAL medio …", "Estadio …".
- [ ] **Step 2:** Implementa tarjeta de resumen (usa el estilo de tarjetas del panel). Sin `any`.
- [ ] **Step 3:** verde + `tsc` 0.
- [ ] **Step 4: Commit** — `feat(perio): panel de roll-ups (%BoP, peor PD, CAL medio, estadio)`.

---

## Task 9: Página periodontograma (gated + selector + nueva/historial)

**Files:**
- Create: `src/app/(dashboard)/periodontograma/layout.tsx` (gate sector = odontología, 404/redirect si no), `src/app/(dashboard)/periodontograma/page.tsx`
- Test: `src/tests/unit/periodontograma-page.test.tsx` (o de gating, según lo que exista para odontograma)

**Interfaces:** Consumes `patient-selector.tsx`, hooks Task 5, `PerioChart` (7), `PerioSummary` (8), actions (6).

- [ ] **Step 1:** Test de gating (sector ≠ odontología ⇒ no renderiza / redirect), como el de la página de odontograma.
- [ ] **Step 2:** Implementa: sin `?paciente` ⇒ `PatientSelector` (reutiliza el del odontograma); con `?paciente` ⇒ botón "Nueva exploración" (crea `perio_exam` borrador y muestra `PerioChart` editable + `PerioSummary` en vivo + "Firmar"), y lista/historial de exploraciones previas (solo lectura). Guardar → `savePerioMeasurements`; Firmar → `signPerioExam` (tras firmar, la carta pasa a solo lectura).
- [ ] **Step 3:** verde + `tsc` 0. Smoke: la ruta compila.
- [ ] **Step 4: Commit** — `feat(perio): página periodontograma (selector, nueva exploración, historial, firmar)`.

---

## Task 10: Evolutivo del odontograma — fold "boca en fecha X"

**Files:**
- Create: `src/lib/dental/fold.ts`, `src/components/dental/evolution-date-picker.tsx`
- Modify: `src/app/(dashboard)/odontograma/page.tsx` (añade selector de fecha que refleja el estado histórico)
- Test: `src/tests/unit/fold.test.ts`

**Interfaces:**
- Consumes: `OdontogramFinding` (con `detected_at`, `resolved_at`, `fdi_tooth`, `tooth_state`, `surfaces`).
- Produces: `foldFindingsAsOf(findings, isoDate)` → `Map<number, CurrentToothState>` (mismo tipo que `deriveCurrentStates`).

- [ ] **Step 1: Test que falla:**

```ts
import { describe, expect, it } from "vitest";
import { foldFindingsAsOf } from "@/lib/dental/fold";

const f = (over: Partial<any>) => ({
  fdi_tooth: 11, tooth_state: "caries", finding_type: "caries",
  surfaces: [], recorded_at: over.detected_at,
  detected_at: over.detected_at, resolved_at: over.resolved_at ?? null, ...over,
});

describe("foldFindingsAsOf", () => {
  it("toma el hallazgo vigente a la fecha (detected<=X y (resolved nulo o >X))", () => {
    const findings = [
      f({ fdi_tooth: 11, tooth_state: "caries", detected_at: "2026-01-10", resolved_at: "2026-03-01" }),
      f({ fdi_tooth: 11, tooth_state: "obturado", detected_at: "2026-03-01", resolved_at: null }),
    ];
    expect(foldFindingsAsOf(findings, "2026-02-01").get(11)?.tooth_state).toBe("caries");
    expect(foldFindingsAsOf(findings, "2026-04-01").get(11)?.tooth_state).toBe("obturado");
  });
  it("ignora hallazgos posteriores a la fecha", () => {
    const findings = [f({ detected_at: "2026-05-01", resolved_at: null })];
    expect(foldFindingsAsOf(findings, "2026-01-01").size).toBe(0);
  });
});
```

- [ ] **Step 2:** Implementa `foldFindingsAsOf`: por `fdi_tooth`, elige el hallazgo con mayor `detected_at` tal que `detected_at <= X` y (`resolved_at` nulo o `resolved_at > X`). Puro, sin `any`.
- [ ] **Step 3:** `evolution-date-picker.tsx`: `<input type="date">` accesible; al cambiar, el odontograma pinta el fold de esa fecha (y un botón "hoy" para volver al estado actual `deriveCurrentStates`). Cablea en `odontograma/page.tsx` sin romper el modo actual.
- [ ] **Step 4:** vitest + `tsc` 0.
- [ ] **Step 5: Commit** — `feat(evolutivo): fold "boca en fecha X" del odontograma event-sourced`.

---

## Task 11: Evolutivo perio — historial/comparación

**Files:**
- Create: `src/components/dental/perio-history.tsx`
- Modify: la página perio (Task 9) para incluirlo.
- Test: `src/tests/unit/perio-history.test.tsx`

**Interfaces:** Consumes `usePerioExams` (Task 5), `computePerioRollups`.

- [ ] **Step 1:** Test: dada una lista de exploraciones, renderiza una fila por fecha con sus roll-ups (%BoP / peor PD / CAL medio) y permite seleccionar una para ver su carta (solo lectura).
- [ ] **Step 2:** Implementa el historial (tabla/lista ordenada por `exam_date` desc); al elegir una, carga su `PerioChart` readOnly + `PerioSummary`. Tendencia simple entre la más reciente y la anterior (↑/↓ en %BoP) si hay ≥2. Sin `any`.
- [ ] **Step 3:** verde + `tsc` 0.
- [ ] **Step 4: Commit** — `feat(evolutivo): historial y comparación de exploraciones perio`.

---

## Task 12: Nav "Periodontograma" (solo odontología)

**Files:**
- Modify: `src/components/dashboard-nav-items.ts`
- Test: el test existente de `dashboard-nav-items` — añade caso: en sector odontología aparece "Periodontograma"; en peluquería NO.

- [ ] **Step 1:** Test que falla: `buildDashboardNavItems({ sector: "odontologia", … })` incluye la entrada Periodontograma (ruta `/periodontograma`); con `sector: "peluqueria"` no.
- [ ] **Step 2:** Añade la entrada condicionada a `sector === "odontologia"`, junto a "Odontograma", con icono coherente (lucide, p.ej. `Activity`). No cambies el comportamiento de peluquería.
- [ ] **Step 3:** `npx vitest run` (nav + suite) verde, `tsc` 0.
- [ ] **Step 4: Commit** — `feat(perio): entrada de nav Periodontograma (gated odontología)`.

---

## Task 13: Seed demo perio para `demo-dental`

**Files:**
- Create: `scripts/seed-demo-perio.mjs` (aplica por Management API, User-Agent navegador) — o SQL equivalente.

- [ ] **Step 1:** Para cada paciente de `demo-dental` (salón demo dental), inserta 1–3 `perio_exam` en fechas distintas (evolutivo visible), con `perio_tooth` (movilidad ocasional) y `perio_site` para los 32 dientes × 6 sitios con PD realistas (mayoría 1–3 mm, algunos bolsillos 4–6 mm), márgenes con alguna recesión, BoP ~15–25% de sitios, alguna supuración puntual. Firma las exploraciones antiguas (`signed_at`), deja la última en borrador en 1–2 pacientes.
- [ ] **Step 2:** Ejecuta el seed y verifica conteos (`select count(*) from perio_site` > 0 para el salón demo).
- [ ] **Step 3: Commit** — `chore(demo): seed de periodontogramas ficticios para demo-dental`.

---

## Notas de integración (para el controlador tras la ejecución)

- Al terminar: `npx tsc --noEmit` = 0 y `npx vitest run` verde (≥ 1436 + nuevos). Reinicia la demo y smoke: `/periodontograma` (selector → nueva exploración → carta editable → roll-ups → firmar → readonly) y `/odontograma` con el selector de fecha (boca en fecha X).
- Confirma que **peluquería no cambia** (nav sin Periodontograma, sin rutas perio) y que **denueveanueve no se tocó**.
- Las migraciones deben estar **aplicadas en Supabase** (no solo escritas): verifica `perio_exam`/`perio_tooth`/`perio_site` en `information_schema`.
