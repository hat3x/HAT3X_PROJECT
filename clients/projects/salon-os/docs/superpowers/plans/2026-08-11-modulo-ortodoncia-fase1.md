# Módulo Ortodoncia — Fase 1 (núcleo clínico) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una sección `/ortodoncia` por paciente (sector odontología) con ficha ortodóncica, datos del tratamiento (aparatología + duración), timeline de visitas y consentimiento reutilizado.

**Architecture:** La ficha y el tratamiento viven en `clinical_records.data.ortho` (JSONB, merge sin pisar otras claves). Una tabla nueva `ortho_visit` guarda el log por cita. El consentimiento reutiliza el flujo `consents` existente (el tipo `ortodoncia` y su plantilla ya existen). La UI copia el patrón de `/odontograma` y `/periodontograma` (server page → `PatientSelector` o vista cliente; layout con `SectorGate`).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + RLS), Zod, TanStack Query v5, Vitest, Tailwind + shadcn/ui.

## Global Constraints

- Rama de trabajo: `hat3x/HAT3X-038` (repo `clients/projects/salon-os`, es repo git propio).
- Todo escritura acotada por `salon_id`; sector gate `salon.sector !== "odontologia"` en cada server action (RLS solo comprueba tenant, no sector).
- **RSC boundary (memoria [[reference_salonos_rsc_boundary]]):** los componentes cliente NUNCA importan de `@/lib/salon` (arrastra `next/headers`). `salonId` se resuelve en el server page y se pasa como prop.
- `clinical_records` RLS de INSERT/UPDATE = **owner/manager** → la acción de ficha/tratamiento se gatea a `["owner","manager"]`. `ortho_visit` (tabla nueva, RLS `for all` por tenant) permite `["owner","manager","staff"]`.
- Dinero en céntimos (no aplica en Fase 1). Fechas ISO `YYYY-MM-DD`.
- Migraciones se aplican por Supabase Management API (`POST https://api.supabase.com/v1/projects/{ref}/database/migrations`, `Authorization: Bearer <token>`, `Content-Type: application/sql`, `User-Agent: Mozilla/5.0`, body = SQL). project-ref: `jztoyekixcziaicrnlce`.
- Verde obligatorio antes de desplegar: `npx tsc --noEmit` = 0 y la suite Vitest completa.
- Etiquetas de UI en español; enum/label maps de dominio en `src/lib/dental/*`, no en componentes.

---

### Task 1: Dominio ortho (tipos + label maps puros)

**Files:**
- Create: `src/lib/dental/ortho.ts`
- Modify: `src/lib/dental/index.ts` (barrel — añadir `export * from "./ortho";`)
- Test: `src/tests/unit/ortho-logic.test.ts`

**Interfaces:**
- Produces: tipos `MalocclusionClass`, `CrowdingLevel`, `Crossbite`, `ApplianceType`, `OrthoArch`, `OrthoStatus`, `OrthoFicha`, `OrthoTreatment`, `OrthoData`, `OrthoVisitActions`; constantes `EMPTY_ORTHO_FICHA`, `EMPTY_ORTHO_TREATMENT`; label maps `MALOCCLUSION_CLASS_LABELS`, `CROWDING_LEVEL_LABELS`, `CROSSBITE_LABELS`, `APPLIANCE_TYPE_LABELS`, `ORTHO_ARCH_LABELS`, `ORTHO_STATUS_LABELS`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/ortho-logic.test.ts
import { describe, it, expect } from "vitest";

import {
  MALOCCLUSION_CLASS_LABELS,
  APPLIANCE_TYPE_LABELS,
  ORTHO_STATUS_LABELS,
  EMPTY_ORTHO_FICHA,
  EMPTY_ORTHO_TREATMENT,
} from "@/lib/dental/ortho";

describe("ortho label maps", () => {
  it("cubre las 4 clases de maloclusión", () => {
    expect(Object.keys(MALOCCLUSION_CLASS_LABELS)).toHaveLength(4);
    expect(MALOCCLUSION_CLASS_LABELS["II-1"]).toBe("Clase II división 1");
  });

  it("cubre las 4 aparatologías y los 4 estados", () => {
    expect(Object.keys(APPLIANCE_TYPE_LABELS)).toHaveLength(4);
    expect(APPLIANCE_TYPE_LABELS.alineadores).toBe("Alineadores invisibles");
    expect(ORTHO_STATUS_LABELS.retencion).toBe("Retención");
  });

  it("los EMPTY_* tienen todos los campos en null/false", () => {
    expect(EMPTY_ORTHO_FICHA.malocclusionClass).toBeNull();
    expect(EMPTY_ORTHO_FICHA.diastema).toBe(false);
    expect(EMPTY_ORTHO_TREATMENT.status).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-logic.test.ts`
Expected: FAIL — cannot find module `@/lib/dental/ortho`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dental/ortho.ts
/** Dominio de ortodoncia (Fase 1): tipos, valores por defecto y etiquetas ES. Puro, sin IO. */

export type MalocclusionClass = "I" | "II-1" | "II-2" | "III";
export type CrowdingLevel = "ninguno" | "leve" | "moderado" | "severo";
export type Crossbite = "ninguna" | "anterior" | "posterior";
export type ApplianceType =
  | "brackets_metalicos"
  | "brackets_esteticos"
  | "alineadores"
  | "ortopedia";
export type OrthoArch = "superior" | "inferior" | "ambas";
export type OrthoStatus = "activo" | "retencion" | "finalizado" | "cancelado";

export interface OrthoFicha {
  malocclusionClass: MalocclusionClass | null;
  crowdingUpper: CrowdingLevel | null;
  crowdingLower: CrowdingLevel | null;
  diastema: boolean;
  diastemaNote: string | null;
  crossbite: Crossbite | null;
  overjetMm: number | null;
  overbiteMm: number | null;
  openBite: boolean;
  diagnosisNotes: string | null;
}

export interface OrthoTreatment {
  applianceType: ApplianceType | null;
  arch: OrthoArch | null;
  estimatedMonths: number | null;
  startDate: string | null; // ISO "YYYY-MM-DD"
  status: OrthoStatus | null;
  objectives: string | null;
}

export interface OrthoData {
  ficha: OrthoFicha;
  treatment: OrthoTreatment;
}

export interface OrthoVisitActions {
  wireChange: boolean;
  wireDetail: string | null;
  ligatures: boolean;
  elastics: boolean;
  elasticsDetail: string | null;
  alignerDelivered: number | null;
}

export const EMPTY_ORTHO_FICHA: OrthoFicha = {
  malocclusionClass: null,
  crowdingUpper: null,
  crowdingLower: null,
  diastema: false,
  diastemaNote: null,
  crossbite: null,
  overjetMm: null,
  overbiteMm: null,
  openBite: false,
  diagnosisNotes: null,
};

export const EMPTY_ORTHO_TREATMENT: OrthoTreatment = {
  applianceType: null,
  arch: null,
  estimatedMonths: null,
  startDate: null,
  status: null,
  objectives: null,
};

export const MALOCCLUSION_CLASS_LABELS: Record<MalocclusionClass, string> = {
  I: "Clase I",
  "II-1": "Clase II división 1",
  "II-2": "Clase II división 2",
  III: "Clase III",
};

export const CROWDING_LEVEL_LABELS: Record<CrowdingLevel, string> = {
  ninguno: "Ninguno",
  leve: "Leve",
  moderado: "Moderado",
  severo: "Severo",
};

export const CROSSBITE_LABELS: Record<Crossbite, string> = {
  ninguna: "Ninguna",
  anterior: "Anterior",
  posterior: "Posterior",
};

export const APPLIANCE_TYPE_LABELS: Record<ApplianceType, string> = {
  brackets_metalicos: "Brackets metálicos",
  brackets_esteticos: "Brackets estéticos",
  alineadores: "Alineadores invisibles",
  ortopedia: "Ortopedia",
};

export const ORTHO_ARCH_LABELS: Record<OrthoArch, string> = {
  superior: "Superior",
  inferior: "Inferior",
  ambas: "Ambas",
};

export const ORTHO_STATUS_LABELS: Record<OrthoStatus, string> = {
  activo: "Activo",
  retencion: "Retención",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};
```

Luego añade a `src/lib/dental/index.ts` (una línea, conservando los exports existentes):

```ts
export * from "./ortho";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dental/ortho.ts src/lib/dental/index.ts src/tests/unit/ortho-logic.test.ts
git commit -m "feat(ortodoncia): dominio ortho (tipos + label maps)"
```

---

### Task 2: Validación Zod (ficha/tratamiento + visita)

**Files:**
- Create: `src/lib/validations/ortho.ts`
- Test: `src/tests/unit/ortho-schema.test.ts`

**Interfaces:**
- Consumes: nada (Zod puro).
- Produces: `orthoDataSchema`, `OrthoDataInput`, `OrthoDataValues`; `orthoVisitSchema`, `OrthoVisitInput`, `OrthoVisitValues`; sub-esquemas `orthoFichaSchema`, `orthoTreatmentSchema`, `orthoVisitActionsSchema`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/ortho-schema.test.ts
import { describe, it, expect } from "vitest";

import { orthoDataSchema, orthoVisitSchema } from "@/lib/validations/ortho";

describe("orthoDataSchema", () => {
  it("acepta una ficha/tratamiento vacíos (todo opcional)", () => {
    const result = orthoDataSchema.safeParse({ ficha: {}, treatment: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ficha.malocclusionClass).toBeNull();
      expect(result.data.ficha.diastema).toBe(false);
    }
  });

  it("acepta valores válidos de enums y mm", () => {
    const result = orthoDataSchema.safeParse({
      ficha: { malocclusionClass: "II-1", overjetMm: 4, diastema: true },
      treatment: { applianceType: "alineadores", estimatedMonths: 24, status: "activo" },
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un enum inválido de aparatología", () => {
    const result = orthoDataSchema.safeParse({
      ficha: {},
      treatment: { applianceType: "invisible-brand-x" },
    });
    expect(result.success).toBe(false);
  });
});

describe("orthoVisitSchema", () => {
  it("acepta una visita mínima con fecha ISO", () => {
    const result = orthoVisitSchema.safeParse({
      visitDate: "2026-08-12",
      actions: { wireChange: true },
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una fecha con formato no-ISO", () => {
    const result = orthoVisitSchema.safeParse({ visitDate: "12/08/2026", actions: {} });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-schema.test.ts`
Expected: FAIL — cannot find module `@/lib/validations/ortho`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/validations/ortho.ts
import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().default(null);

export const orthoFichaSchema = z.object({
  malocclusionClass: z.enum(["I", "II-1", "II-2", "III"]).nullable().default(null),
  crowdingUpper: z.enum(["ninguno", "leve", "moderado", "severo"]).nullable().default(null),
  crowdingLower: z.enum(["ninguno", "leve", "moderado", "severo"]).nullable().default(null),
  diastema: z.boolean().default(false),
  diastemaNote: optionalText(500),
  crossbite: z.enum(["ninguna", "anterior", "posterior"]).nullable().default(null),
  overjetMm: z.number().min(-20).max(40).nullable().default(null),
  overbiteMm: z.number().min(-20).max(40).nullable().default(null),
  openBite: z.boolean().default(false),
  diagnosisNotes: optionalText(4000),
});

export const orthoTreatmentSchema = z.object({
  applianceType: z
    .enum(["brackets_metalicos", "brackets_esteticos", "alineadores", "ortopedia"])
    .nullable()
    .default(null),
  arch: z.enum(["superior", "inferior", "ambas"]).nullable().default(null),
  estimatedMonths: z.number().int().min(1).max(120).nullable().default(null),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida").nullable().default(null),
  status: z.enum(["activo", "retencion", "finalizado", "cancelado"]).nullable().default(null),
  objectives: optionalText(4000),
});

export const orthoDataSchema = z.object({
  ficha: orthoFichaSchema,
  treatment: orthoTreatmentSchema,
});

export type OrthoDataInput = z.input<typeof orthoDataSchema>;
export type OrthoDataValues = z.output<typeof orthoDataSchema>;

export const orthoVisitActionsSchema = z.object({
  wireChange: z.boolean().default(false),
  wireDetail: optionalText(300),
  ligatures: z.boolean().default(false),
  elastics: z.boolean().default(false),
  elasticsDetail: optionalText(300),
  alignerDelivered: z.number().int().min(0).max(200).nullable().default(null),
});

export const orthoVisitSchema = z.object({
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  appointmentId: z.string().uuid().nullable().default(null),
  actions: orthoVisitActionsSchema,
  notes: optionalText(4000),
  nextStep: optionalText(1000),
});

export type OrthoVisitInput = z.input<typeof orthoVisitSchema>;
export type OrthoVisitValues = z.output<typeof orthoVisitSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/ortho.ts src/tests/unit/ortho-schema.test.ts
git commit -m "feat(ortodoncia): esquemas Zod ficha/tratamiento/visita"
```

---

### Task 3: Migración `ortho_visit` + tipo en database.ts

**Files:**
- Create: `supabase/migrations/20260811120000_ortho_visit.sql`
- Modify: `src/types/database.ts` (añadir el bloque `ortho_visit` dentro de `Database["public"]["Tables"]` y el alias `OrthoVisit`)

**Interfaces:**
- Produces: tabla `public.ortho_visit`; tipo `OrthoVisit = Tables<"ortho_visit">`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260811120000_ortho_visit.sql
-- Log de progreso de ortodoncia por cita (Fase 1 del módulo de ortodoncia).
-- La ficha y el tratamiento viven en clinical_records.data.ortho (JSONB); esta tabla
-- guarda una entrada por visita.
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/migrations
--   User-Agent: Mozilla/5.0
--   Authorization: Bearer <token>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>

begin;

create table public.ortho_visit (
  id             uuid primary key default gen_random_uuid(),
  salon_id       uuid not null references public.salons(id) on delete cascade,
  customer_id    uuid not null,
  appointment_id uuid references public.appointments(id) on delete set null,
  visit_date     date not null default current_date,
  actions        jsonb not null default '{}',
  notes          text,
  next_step      text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint ortho_visit_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade
);

create index ortho_visit_customer_idx
  on public.ortho_visit (salon_id, customer_id, visit_date desc);

alter table public.ortho_visit enable row level security;

create policy ortho_visit_rw on public.ortho_visit
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
```

- [ ] **Step 2: Aplicar la migración por Management API y verificar**

Aplicar el fichero con el script del scratchpad usado para las demás migraciones dentales (Management API, `User-Agent: Mozilla/5.0`, `Content-Type: application/sql`, token del `.env.local`). Luego verificar contra la BD:

Run (verificación por REST con la service-role key):
```
GET https://jztoyekixcziaicrnlce.supabase.co/rest/v1/ortho_visit?select=id&limit=1
  apikey: <service_role>   Authorization: Bearer <service_role>
```
Expected: `200 []` (tabla existe, vacía). Si devuelve `PGRST205` (tabla no encontrada) → la migración no se aplicó; revisar.

- [ ] **Step 3: Añadir el tipo a `src/types/database.ts`**

Dentro de `Database["public"]["Tables"]`, junto a las demás tablas dentales (p. ej. tras `treatment_plan`), añadir:

```ts
      ortho_visit: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          appointment_id: string | null;
          visit_date: string;
          actions: Json;
          notes: string | null;
          next_step: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          appointment_id?: string | null;
          visit_date?: string;
          actions?: Json;
          notes?: string | null;
          next_step?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          appointment_id?: string | null;
          visit_date?: string;
          actions?: Json;
          notes?: string | null;
          next_step?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
```

Y junto a los demás alias exportados (donde están `ClinicalRecord`, `TreatmentPlan`, etc.):

```ts
export type OrthoVisit = Tables<"ortho_visit">;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811120000_ortho_visit.sql src/types/database.ts
git commit -m "feat(ortodoncia): tabla ortho_visit + tipo (RLS por tenant)"
```

---

### Task 4: Capa de queries (lectura)

**Files:**
- Create: `src/lib/queries/ortho.ts`

**Interfaces:**
- Consumes: `OrthoData`, `EMPTY_ORTHO_FICHA`, `EMPTY_ORTHO_TREATMENT` (Task 1); `OrthoVisit` (Task 3).
- Produces: `orthoKeys` (factory de query keys); `fetchOrthoData(salonId, customerId): Promise<OrthoData>`; `fetchOrthoVisits(salonId, customerId): Promise<OrthoVisit[]>`.

- [ ] **Step 1: Escribir la implementación** (queries de solo lectura, cliente de navegador)

```ts
// src/lib/queries/ortho.ts
import {
  EMPTY_ORTHO_FICHA,
  EMPTY_ORTHO_TREATMENT,
  type OrthoData,
} from "@/lib/dental/ortho";
import { createClient } from "@/lib/supabase/client";
import type { OrthoVisit } from "@/types/database";

export const orthoKeys = {
  all: (salonId: string) => ["ortho", salonId] as const,
  data: (salonId: string, customerId: string) =>
    [...orthoKeys.all(salonId), "data", customerId] as const,
  visits: (salonId: string, customerId: string) =>
    [...orthoKeys.all(salonId), "visits", customerId] as const,
};

/**
 * Lee la ficha + tratamiento ortho desde clinical_records.data.ortho.
 * Devuelve SIEMPRE una forma completa (rellena con EMPTY_* lo que falte),
 * para que el formulario sea controlado sin ramas por null.
 */
export async function fetchOrthoData(
  salonId: string,
  customerId: string,
): Promise<OrthoData> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clinical_records")
    .select("data")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error !== null) throw new Error(error.message);

  const raw = (data?.data ?? {}) as Record<string, unknown>;
  const ortho = (raw.ortho ?? {}) as Partial<OrthoData>;
  return {
    ficha: { ...EMPTY_ORTHO_FICHA, ...(ortho.ficha ?? {}) },
    treatment: { ...EMPTY_ORTHO_TREATMENT, ...(ortho.treatment ?? {}) },
  };
}

/** Timeline de visitas ortho (más reciente primero). */
export async function fetchOrthoVisits(
  salonId: string,
  customerId: string,
): Promise<OrthoVisit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ortho_visit")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/ortho.ts
git commit -m "feat(ortodoncia): queries de lectura (data + visitas)"
```

---

### Task 5: Server actions (merge JSONB + visitas)

**Files:**
- Create: `src/app/(dashboard)/ortodoncia/actions.ts`
- Test: `src/tests/unit/ortho-actions.test.ts`

**Interfaces:**
- Consumes: `orthoDataSchema`, `OrthoDataInput`, `orthoVisitSchema`, `OrthoVisitInput` (Task 2); `OrthoVisit`, `Json`, `MemberRole` (types).
- Produces: `ActionResult<T>`; `saveOrthoData(customerId, input): Promise<ActionResult<null>>`; `addOrthoVisit(customerId, input): Promise<ActionResult<OrthoVisit>>`; `deleteOrthoVisit(visitId): Promise<ActionResult<null>>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/ortho-actions.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock, getUserMock } =
  vi.hoisted(() => ({
    getActiveSalonMock: vi.fn(),
    getActiveMembershipMock: vi.fn(),
    fromMock: vi.fn(),
    getUserMock: vi.fn(),
  }));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => fromMock(table),
    auth: { getUser: () => getUserMock() },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveOrthoData } from "@/app/(dashboard)/ortodoncia/actions";

function asRole(role: MemberRole) {
  return { role };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("saveOrthoData", () => {
  it("rechaza si el salón no es odontología", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "peluqueria" });
    const res = await saveOrthoData("c1", { ficha: {}, treatment: {} });
    expect(res.ok).toBe(false);
  });

  it("rechaza a staff (ficha es owner/manager)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue(asRole("staff"));
    const res = await saveOrthoData("c1", { ficha: {}, treatment: {} });
    expect(res.ok).toBe(false);
  });

  it("hace merge preservando otras claves de data", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue(asRole("owner"));

    let upsertPayload: Record<string, unknown> | null = null;
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe("clinical_records");
      return {
        // read chain: .select().eq().eq().maybeSingle()
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { data: { last_xray_at: "2026-01-01", ortho: { ficha: {} } } },
                error: null,
              }),
            }),
          }),
        }),
        // write chain: .upsert()
        upsert: (payload: Record<string, unknown>) => {
          upsertPayload = payload;
          return Promise.resolve({ error: null });
        },
      };
    });

    const res = await saveOrthoData("c1", {
      ficha: { malocclusionClass: "I" },
      treatment: { status: "activo" },
    });

    expect(res.ok).toBe(true);
    const written = upsertPayload as { data: Record<string, unknown> };
    expect(written.data.last_xray_at).toBe("2026-01-01"); // clave ajena preservada
    expect(
      (written.data.ortho as { ficha: { malocclusionClass: string } }).ficha.malocclusionClass,
    ).toBe("I");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-actions.test.ts`
Expected: FAIL — cannot find module `@/app/(dashboard)/ortodoncia/actions`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/(dashboard)/ortodoncia/actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  orthoDataSchema,
  orthoVisitSchema,
  type OrthoDataInput,
  type OrthoVisitInput,
} from "@/lib/validations/ortho";
import type { Json, MemberRole, OrthoVisit } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado";
const ERROR_SECTOR = "Esta sección solo está disponible en clínicas dentales";
const ERROR_ROLE = "No tienes permisos para esta acción";

// clinical_records restringe INSERT/UPDATE a owner/manager por RLS; ortho_visit permite staff.
const FICHA_ROLES: readonly MemberRole[] = ["owner", "manager"];
const VISIT_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

async function assertOrthoAccess(
  requiredRoles: readonly MemberRole[],
): Promise<{ ok: true; salonId: string } | { ok: false; error: string }> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };
  if (salon.sector !== "odontologia") return { ok: false, error: ERROR_SECTOR };

  const membership = await getActiveMembership();
  if (membership === null || !requiredRoles.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }
  return { ok: true, salonId: salon.id };
}

/**
 * Guarda ficha + tratamiento ortho haciendo MERGE sobre clinical_records.data:
 * lee el data actual, reemplaza SOLO el sub-árbol `ortho`, y reescribe. Preserva
 * cualquier otra clave de `data`. Upsert por customer_id (crea la ficha si no existe).
 */
export async function saveOrthoData(
  customerId: string,
  input: OrthoDataInput,
): Promise<ActionResult<null>> {
  const parsed = orthoDataSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertOrthoAccess(FICHA_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: current, error: readErr } = await supabase
    .from("clinical_records")
    .select("data")
    .eq("customer_id", customerId)
    .eq("salon_id", access.salonId)
    .maybeSingle();
  if (readErr !== null) return { ok: false, error: readErr.message };

  const existing = (current?.data ?? {}) as Record<string, unknown>;
  const nextData = { ...existing, ortho: parsed.data } as Json;

  const { error } = await supabase
    .from("clinical_records")
    .upsert(
      { customer_id: customerId, salon_id: access.salonId, data: nextData },
      { onConflict: "customer_id" },
    );
  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Añade una entrada al timeline de visitas ortho. */
export async function addOrthoVisit(
  customerId: string,
  input: OrthoVisitInput,
): Promise<ActionResult<OrthoVisit>> {
  const parsed = orthoVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertOrthoAccess(VISIT_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("ortho_visit")
    .insert({
      salon_id: access.salonId,
      customer_id: customerId,
      appointment_id: parsed.data.appointmentId,
      visit_date: parsed.data.visitDate,
      actions: parsed.data.actions as Json,
      notes: parsed.data.notes,
      next_step: parsed.data.nextStep,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data };
}

/** Borra una visita del timeline (owner/manager/staff, acotado por salón). */
export async function deleteOrthoVisit(visitId: string): Promise<ActionResult<null>> {
  const access = await assertOrthoAccess(VISIT_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("ortho_visit")
    .delete()
    .eq("id", visitId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ortodoncia/actions.ts" src/tests/unit/ortho-actions.test.ts
git commit -m "feat(ortodoncia): server actions (merge data + visitas)"
```

---

### Task 6: Hooks React Query

**Files:**
- Create: `src/hooks/use-ortodoncia.ts`

**Interfaces:**
- Consumes: `orthoKeys`, `fetchOrthoData`, `fetchOrthoVisits` (Task 4); `saveOrthoData`, `addOrthoVisit`, `deleteOrthoVisit` (Task 5); `OrthoDataInput`, `OrthoVisitInput` (Task 2).
- Produces: `useOrthoData(salonId, customerId)`, `useOrthoVisits(salonId, customerId)`, `useSaveOrthoData(salonId, customerId)`, `useAddOrthoVisit(salonId, customerId)`, `useDeleteOrthoVisit(salonId, customerId)`.

- [ ] **Step 1: Write the implementation**

```ts
// src/hooks/use-ortodoncia.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addOrthoVisit,
  deleteOrthoVisit,
  saveOrthoData,
} from "@/app/(dashboard)/ortodoncia/actions";
import { fetchOrthoData, fetchOrthoVisits, orthoKeys } from "@/lib/queries/ortho";
import type { OrthoDataInput, OrthoVisitInput } from "@/lib/validations/ortho";

export function useOrthoData(salonId: string, customerId: string) {
  return useQuery({
    queryKey: orthoKeys.data(salonId, customerId),
    queryFn: () => fetchOrthoData(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

export function useOrthoVisits(salonId: string, customerId: string) {
  return useQuery({
    queryKey: orthoKeys.visits(salonId, customerId),
    queryFn: () => fetchOrthoVisits(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

export function useSaveOrthoData(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrthoDataInput) => {
      const result = await saveOrthoData(customerId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.data(salonId, customerId),
      });
    },
  });
}

export function useAddOrthoVisit(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrthoVisitInput) => {
      const result = await addOrthoVisit(customerId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.visits(salonId, customerId),
      });
    },
  });
}

export function useDeleteOrthoVisit(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const result = await deleteOrthoVisit(visitId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.visits(salonId, customerId),
      });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-ortodoncia.ts
git commit -m "feat(ortodoncia): hooks React Query"
```

---

### Task 7: Entrada de navegación "Ortodoncia"

**Files:**
- Modify: `src/components/dashboard-nav-items.ts` (declarar `ORTODONCIA_ITEM` junto a `PERIODONTOGRAMA_ITEM`; insertarlo en la rama `sector === "odontologia"` de `buildDashboardNavItems`, tras `PERIODONTOGRAMA_ITEM`)
- Test: `src/tests/unit/dashboard-nav-items-sector.test.ts` (extender)

**Interfaces:**
- Consumes: `NavItem`, `buildDashboardNavItems` (existentes).
- Produces: `ORTODONCIA_ITEM`.

- [ ] **Step 1: Write the failing test** (añadir al fichero existente)

```ts
// añadir dentro de src/tests/unit/dashboard-nav-items-sector.test.ts
it("incluye /ortodoncia para odontología y no para peluquería", () => {
  const dental = buildDashboardNavItems({ showSettings: true, hasPos: false, sector: "odontologia" });
  const hair = buildDashboardNavItems({ showSettings: true, hasPos: false, sector: "peluqueria" });
  expect(dental.some((i) => i.href === "/ortodoncia")).toBe(true);
  expect(hair.some((i) => i.href === "/ortodoncia")).toBe(false);
});
```

(Si `buildDashboardNavItems` no está ya importado en el fichero, añade el import desde `@/components/dashboard-nav-items` siguiendo el estilo de los tests existentes en ese archivo.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-sector.test.ts`
Expected: FAIL — `/ortodoncia` no aparece.

- [ ] **Step 3: Write the implementation**

Elige un icono lucide (los otros dentales usan `Stethoscope`, `Activity`); añade `Braces` al import de `lucide-react` del fichero. Declara el item junto a los otros dentales:

```ts
export const ORTODONCIA_ITEM: NavItem = {
  href: "/ortodoncia",
  label: "Ortodoncia",
  icon: Braces,
};
```

E insértalo en la rama odontología, tras Periodontograma:

```ts
    return [
      ...withSectorLabels.slice(0, insertAt),
      ODONTOGRAMA_ITEM,
      PERIODONTOGRAMA_ITEM,
      ORTODONCIA_ITEM,
      PLANES_ITEM,
      EXPEDIENTE_ITEM,
      ...withSectorLabels.slice(insertAt),
    ];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-sector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard-nav-items.ts src/tests/unit/dashboard-nav-items-sector.test.ts
git commit -m "feat(ortodoncia): entrada de nav (solo odontología)"
```

---

### Task 8: Layout + página server `/ortodoncia`

**Files:**
- Create: `src/app/(dashboard)/ortodoncia/layout.tsx`
- Create: `src/app/(dashboard)/ortodoncia/page.tsx`
- Create: `src/components/dental/ortodoncia-view.tsx` (STUB — lo completa Task 9)

**Interfaces:**
- Consumes: `SectorGate` (`@/components/guards/sector-gate`), `getActiveSalonId` (`@/lib/salon`), `PatientSelector` (`@/components/dental/patient-selector`).
- Produces: la ruta `/ortodoncia`; export `OrtodonciaView` (stub) con props `{ salonId: string; customerId: string }`.

- [ ] **Step 1: Crear el stub de la vista** (lo completa Task 9)

```tsx
// src/components/dental/ortodoncia-view.tsx
"use client";

export interface OrtodonciaViewProps {
  salonId: string;
  customerId: string;
}

export function OrtodonciaView(_props: OrtodonciaViewProps): React.ReactElement | null {
  return null;
}
```

- [ ] **Step 2: Crear el layout** (gate de sector, copia exacta del de odontograma)

```tsx
// src/app/(dashboard)/ortodoncia/layout.tsx
import { SectorGate } from "@/components/guards/sector-gate";

export default function OrtodonciaLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <SectorGate required="odontologia">{children}</SectorGate>;
}
```

- [ ] **Step 3: Crear la página** (mismo patrón que expediente/odontograma)

```tsx
// src/app/(dashboard)/ortodoncia/page.tsx
import type { Metadata } from "next";

import { OrtodonciaView } from "@/components/dental/ortodoncia-view";
import { PatientSelector } from "@/components/dental/patient-selector";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = { title: "Ortodoncia" };

export default async function OrtodonciaPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}): Promise<React.ReactElement> {
  const [salonId, params] = await Promise.all([getActiveSalonId(), searchParams]);

  const customerId = params.paciente ?? "";
  const hasPatient = customerId.length > 0;

  return (
    <main className="container max-w-4xl py-10 sm:py-12">
      <div className="mb-8 space-y-1">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Ortodoncia</h1>
        <p className="text-muted-foreground">Ficha, tratamiento, visitas y consentimiento</p>
      </div>

      {salonId === null ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tienes una clínica asignada.
          </CardContent>
        </Card>
      ) : !hasPatient ? (
        <PatientSelector
          salonId={salonId}
          hrefBase="/ortodoncia"
          purposeLabel="ver su ortodoncia"
        />
      ) : (
        <OrtodonciaView salonId={salonId} customerId={customerId} />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores. (Verificación visual real en Task 9.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ortodoncia/layout.tsx" "src/app/(dashboard)/ortodoncia/page.tsx" src/components/dental/ortodoncia-view.tsx
git commit -m "feat(ortodoncia): ruta /ortodoncia (layout + page + stub vista)"
```

---

### Task 9: Vista de ortodoncia (ficha + tratamiento + visitas + consentimiento)

**Files:**
- Modify: `src/components/dental/ortodoncia-view.tsx` (sustituir el stub por la implementación real)

**Interfaces:**
- Consumes: hooks (Task 6); label maps + `EMPTY_*` + tipos (Task 1); `OrthoVisit` (Task 3); `OrthoVisitInput` (Task 2); `useConsents`, `useCreateConsent` (`@/hooks/use-consents`); `ConsentList` (`@/components/dental/consent-list`); UI `Button`, `Input`, `Label`, `Textarea`, `Card`,`CardContent`,`CardHeader`,`CardTitle`.
- Produces: componente `OrtodonciaView` (misma firma de props que el stub).

> UI de Fase 1: se usan `<select>`/`<input type="checkbox">` nativos estilados para enums y booleanos (cero riesgo de import; funcional). Un follow-up puede migrarlos a shadcn `Select`/`Checkbox` copiando el uso de `expediente-workspace.tsx`.
> Antes de escribir, abre `src/components/dental/consent-list.tsx` y `src/hooks/use-consents.ts` para confirmar que `ConsentList` acepta `{ salonId, customerId, consents }` y que `useCreateConsent(salonId, customerId).mutate({ customerId, type: "ortodoncia" })` es la firma (lo son según la investigación); ajusta si difiere.

- [ ] **Step 1: Implementar la vista**

```tsx
// src/components/dental/ortodoncia-view.tsx
"use client";

import { useEffect, useState } from "react";

import { ConsentList } from "@/components/dental/consent-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConsents, useCreateConsent } from "@/hooks/use-consents";
import {
  useAddOrthoVisit,
  useDeleteOrthoVisit,
  useOrthoData,
  useOrthoVisits,
  useSaveOrthoData,
} from "@/hooks/use-ortodoncia";
import {
  APPLIANCE_TYPE_LABELS,
  CROSSBITE_LABELS,
  CROWDING_LEVEL_LABELS,
  EMPTY_ORTHO_FICHA,
  EMPTY_ORTHO_TREATMENT,
  MALOCCLUSION_CLASS_LABELS,
  ORTHO_ARCH_LABELS,
  ORTHO_STATUS_LABELS,
  type OrthoFicha,
  type OrthoTreatment,
  type OrthoVisitActions,
} from "@/lib/dental/ortho";
import type { OrthoVisitInput } from "@/lib/validations/ortho";
import type { OrthoVisit } from "@/types/database";

export interface OrtodonciaViewProps {
  salonId: string;
  customerId: string;
}

// <select> nativo tipado que emite el valor del enum o null.
function EnumSelect<T extends string>({
  id,
  value,
  labels,
  onChange,
}: {
  id: string;
  value: T | null;
  labels: Record<T, string>;
  onChange: (v: T | null) => void;
}): React.ReactElement {
  return (
    <select
      id={id}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
    >
      <option value="">—</option>
      {(Object.keys(labels) as T[]).map((k) => (
        <option key={k} value={k}>
          {labels[k]}
        </option>
      ))}
    </select>
  );
}

function numberOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function OrtodonciaView({
  salonId,
  customerId,
}: OrtodonciaViewProps): React.ReactElement {
  const dataQuery = useOrthoData(salonId, customerId);
  const visitsQuery = useOrthoVisits(salonId, customerId);
  const consentsQuery = useConsents(salonId, customerId);
  const saveData = useSaveOrthoData(salonId, customerId);
  const addVisit = useAddOrthoVisit(salonId, customerId);
  const deleteVisit = useDeleteOrthoVisit(salonId, customerId);
  const createConsent = useCreateConsent(salonId, customerId);

  const [ficha, setFicha] = useState<OrthoFicha>(EMPTY_ORTHO_FICHA);
  const [treatment, setTreatment] = useState<OrthoTreatment>(EMPTY_ORTHO_TREATMENT);

  useEffect(() => {
    if (dataQuery.data) {
      setFicha(dataQuery.data.ficha);
      setTreatment(dataQuery.data.treatment);
    }
  }, [dataQuery.data]);

  function handleSaveData(): void {
    saveData.mutate({ ficha, treatment });
  }

  return (
    <div className="space-y-6">
      {/* Ficha ortodóncica */}
      <Card>
        <CardHeader>
          <CardTitle>Ficha ortodóncica</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="malocclusion">Maloclusión</Label>
            <EnumSelect
              id="malocclusion"
              value={ficha.malocclusionClass}
              labels={MALOCCLUSION_CLASS_LABELS}
              onChange={(v) => setFicha((f) => ({ ...f, malocclusionClass: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crossbite">Mordida cruzada</Label>
            <EnumSelect
              id="crossbite"
              value={ficha.crossbite}
              labels={CROSSBITE_LABELS}
              onChange={(v) => setFicha((f) => ({ ...f, crossbite: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crowdingUpper">Apiñamiento superior</Label>
            <EnumSelect
              id="crowdingUpper"
              value={ficha.crowdingUpper}
              labels={CROWDING_LEVEL_LABELS}
              onChange={(v) => setFicha((f) => ({ ...f, crowdingUpper: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crowdingLower">Apiñamiento inferior</Label>
            <EnumSelect
              id="crowdingLower"
              value={ficha.crowdingLower}
              labels={CROWDING_LEVEL_LABELS}
              onChange={(v) => setFicha((f) => ({ ...f, crowdingLower: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="overjet">Resalte (mm)</Label>
            <Input
              id="overjet"
              type="number"
              value={ficha.overjetMm ?? ""}
              onChange={(e) =>
                setFicha((f) => ({ ...f, overjetMm: numberOrNull(e.target.value) }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="overbite">Sobremordida (mm)</Label>
            <Input
              id="overbite"
              type="number"
              value={ficha.overbiteMm ?? ""}
              onChange={(e) =>
                setFicha((f) => ({ ...f, overbiteMm: numberOrNull(e.target.value) }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ficha.diastema}
              onChange={(e) => setFicha((f) => ({ ...f, diastema: e.target.checked }))}
            />
            Diastemas
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ficha.openBite}
              onChange={(e) => setFicha((f) => ({ ...f, openBite: e.target.checked }))}
            />
            Mordida abierta
          </label>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="diagnosisNotes">Notas de diagnóstico</Label>
            <Textarea
              id="diagnosisNotes"
              value={ficha.diagnosisNotes ?? ""}
              onChange={(e) =>
                setFicha((f) => ({ ...f, diagnosisNotes: e.target.value || null }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Tratamiento */}
      <Card>
        <CardHeader>
          <CardTitle>Tratamiento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="appliance">Aparatología</Label>
            <EnumSelect
              id="appliance"
              value={treatment.applianceType}
              labels={APPLIANCE_TYPE_LABELS}
              onChange={(v) => setTreatment((t) => ({ ...t, applianceType: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="arch">Arcada</Label>
            <EnumSelect
              id="arch"
              value={treatment.arch}
              labels={ORTHO_ARCH_LABELS}
              onChange={(v) => setTreatment((t) => ({ ...t, arch: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="months">Duración estimada (meses)</Label>
            <Input
              id="months"
              type="number"
              value={treatment.estimatedMonths ?? ""}
              onChange={(e) =>
                setTreatment((t) => ({ ...t, estimatedMonths: numberOrNull(e.target.value) }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startDate">Fecha de inicio</Label>
            <Input
              id="startDate"
              type="date"
              value={treatment.startDate ?? ""}
              onChange={(e) =>
                setTreatment((t) => ({ ...t, startDate: e.target.value || null }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Estado</Label>
            <EnumSelect
              id="status"
              value={treatment.status}
              labels={ORTHO_STATUS_LABELS}
              onChange={(v) => setTreatment((t) => ({ ...t, status: v }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="objectives">Objetivos</Label>
            <Textarea
              id="objectives"
              value={treatment.objectives ?? ""}
              onChange={(e) =>
                setTreatment((t) => ({ ...t, objectives: e.target.value || null }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSaveData} disabled={saveData.isPending}>
          {saveData.isPending ? "Guardando…" : "Guardar ficha y tratamiento"}
        </Button>
        {saveData.isError && (
          <span className="text-sm text-destructive">
            {(saveData.error as Error).message}
          </span>
        )}
      </div>

      {/* Timeline de visitas */}
      <OrthoVisitsCard
        visits={visitsQuery.data ?? []}
        onAdd={(input) => addVisit.mutate(input)}
        onDelete={(id) => deleteVisit.mutate(id)}
        adding={addVisit.isPending}
      />

      {/* Consentimiento (reutiliza el flujo existente) */}
      <Card>
        <CardHeader>
          <CardTitle>Consentimiento de ortodoncia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={() => createConsent.mutate({ customerId, type: "ortodoncia" })}
            disabled={createConsent.isPending}
          >
            {createConsent.isPending ? "Creando…" : "Crear consentimiento de ortodoncia"}
          </Button>
          <ConsentList
            salonId={salonId}
            customerId={customerId}
            consents={consentsQuery.data ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// --- Timeline de visitas ------------------------------------------------------

const EMPTY_VISIT_ACTIONS: OrthoVisitActions = {
  wireChange: false,
  wireDetail: null,
  ligatures: false,
  elastics: false,
  elasticsDetail: null,
  alignerDelivered: null,
};

function OrthoVisitsCard({
  visits,
  onAdd,
  onDelete,
  adding,
}: {
  visits: readonly OrthoVisit[];
  onAdd: (input: OrthoVisitInput) => void;
  onDelete: (id: string) => void;
  adding: boolean;
}): React.ReactElement {
  const [visitDate, setVisitDate] = useState<string>("");
  const [actions, setActions] = useState<OrthoVisitActions>(EMPTY_VISIT_ACTIONS);
  const [notes, setNotes] = useState<string>("");
  const [nextStep, setNextStep] = useState<string>("");

  function submit(): void {
    if (visitDate.trim() === "") return;
    onAdd({
      visitDate,
      appointmentId: null,
      actions,
      notes: notes || null,
      nextStep: nextStep || null,
    });
    setActions(EMPTY_VISIT_ACTIONS);
    setNotes("");
    setNextStep("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seguimiento de fases</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Formulario de nueva visita */}
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="visitDate">Fecha de la visita</Label>
            <Input
              id="visitDate"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aligner">Alineador entregado (nº)</Label>
            <Input
              id="aligner"
              type="number"
              value={actions.alignerDelivered ?? ""}
              onChange={(e) =>
                setActions((a) => ({ ...a, alignerDelivered: numberOrNull(e.target.value) }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={actions.wireChange}
              onChange={(e) => setActions((a) => ({ ...a, wireChange: e.target.checked }))}
            />
            Cambio de arco
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={actions.ligatures}
              onChange={(e) => setActions((a) => ({ ...a, ligatures: e.target.checked }))}
            />
            Ligaduras
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={actions.elastics}
              onChange={(e) => setActions((a) => ({ ...a, elastics: e.target.checked }))}
            />
            Elásticos
          </label>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="visitNotes">Notas</Label>
            <Textarea
              id="visitNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nextStep">Próximo paso</Label>
            <Input
              id="nextStep"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={submit} disabled={adding || visitDate.trim() === ""}>
              {adding ? "Registrando…" : "Registrar visita"}
            </Button>
          </div>
        </div>

        {/* Lista */}
        {visits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin visitas registradas.</p>
        ) : (
          <ul className="space-y-3">
            {visits.map((v) => {
              const a = (v.actions ?? {}) as Partial<OrthoVisitActions>;
              const chips = [
                a.wireChange ? "Cambio de arco" : null,
                a.ligatures ? "Ligaduras" : null,
                a.elastics ? "Elásticos" : null,
                a.alignerDelivered != null ? `Alineador ${a.alignerDelivered}` : null,
              ].filter(Boolean);
              return (
                <li key={v.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium tabular-nums">{v.visit_date}</span>
                    <button
                      type="button"
                      className="text-xs text-destructive hover:underline"
                      onClick={() => onDelete(v.id)}
                    >
                      Borrar
                    </button>
                  </div>
                  {chips.length > 0 && (
                    <p className="mt-1 text-muted-foreground">{chips.join(" · ")}</p>
                  )}
                  {v.notes && <p className="mt-1 whitespace-pre-wrap">{v.notes}</p>}
                  {v.next_step && (
                    <p className="mt-1 text-muted-foreground">Próximo: {v.next_step}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores. (Si `ConsentList`/`useConsents`/`useCreateConsent` difieren de lo asumido, ajustar imports/props mirando `src/components/dental/consent-list.tsx` y `src/hooks/use-consents.ts`.)

- [ ] **Step 3: Verificación manual (dev server)**

Run: `npm run dev`, navegar a `/ortodoncia`, elegir un paciente de Biodental. Comprobar: guardar ficha+tratamiento persiste al recargar; registrar una visita aparece en el timeline; crear consentimiento de ortodoncia aparece en la lista con botón "Firmar".

- [ ] **Step 4: Commit**

```bash
git add src/components/dental/ortodoncia-view.tsx
git commit -m "feat(ortodoncia): vista (ficha + tratamiento + visitas + consentimiento)"
```

---

### Task 10: Verificación integral + despliegue

**Files:** ninguno nuevo (validación end-to-end).

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 2: Suite de tests completa**

Run: `npx vitest run`
Expected: toda la suite en verde (los ~1772 previos + los nuevos de ortho).

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Expected: build correcto (exit 0), incluida la ruta `/ortodoncia`.

- [ ] **Step 4: Deploy a Vercel**

Ejecutar `scratchpad/deploy_kairos.js` (sube `git ls-files` + `POST /v13/deployments`, teamId `team_cAwFiqStYO0d7Mq46aaxI5NZ`) y esperar a `READY`. Verificar `/ortodoncia` en `https://kairosmanager.app` con la cuenta de Nadia.

- [ ] **Step 5: Cierre**

Run: `git status` (debe quedar sin cambios de ortho sin commitear).

---

## Self-Review (cobertura del spec)

- **Ficha ortodóncica** (spec §2a) → Tasks 1,2,4,5,9. ✔
- **Tratamiento: aparatología + duración** (spec §2b) → Tasks 1,2,5,9. ✔
- **Seguimiento de fases por cita** (spec §2c) → tabla `ortho_visit` Task 3; actions Task 5; UI Task 9. ✔
- **Consentimiento ortho** (spec §2d) → reuso de `consents` (tipo/plantilla ya existen) en Task 9. ✔
- **Datos opción A: JSONB `clinical_records.data.ortho` + 1 tabla nueva** (spec §3) → Tasks 3,5. ✔
- **UX: sección `/ortodoncia` por paciente, gated odontología, patient selector** (spec §4) → Tasks 7,8. ✔
- **Capas técnicas: migración/RLS, Zod, queries, actions, hooks, nav, gating** (spec §5) → Tasks 1–8. ✔
- **TDD + tsc 0 + suite verde + deploy** (spec §6,§7) → tests en Tasks 1,2,5,7; verificación Task 10. ✔
- **Fuera de alcance** (spec §9): cuotas automáticas, financiación, laboratorio, trazabilidad, post-ajuste, STL, cefalometría — NO incluidos. ✔

**Consistencia de tipos:** `OrthoData`/`OrthoFicha`/`OrthoTreatment` (Task 1) usados idénticos en queries (Task 4), validación (Task 2) y vista (Task 9); `OrthoVisit` (Task 3) usado en queries/actions/hooks/vista; nombres de acciones (`saveOrthoData`/`addOrthoVisit`/`deleteOrthoVisit`) idénticos entre Tasks 5, 6 y 9; `orthoKeys` idéntico entre Tasks 4 y 6; `OrthoVisitActions` (Task 1) usado en la vista (Task 9).

**Nota de riesgo controlado:** el `upsert` merge de `clinical_records.data` es read-modify-write, no atómico (last-writer-wins) — aceptable para edición mono-usuario por paciente, consistente con el resto del código.
