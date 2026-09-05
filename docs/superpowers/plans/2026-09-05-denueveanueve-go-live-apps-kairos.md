# Go-live de las apps de cliente y staff de De Nueve a Nueve — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el salón pueda dar y quitar acceso a su equipo desde Kairos sin intervención de HAT3X, que cada profesional entre en la app de staff y vea su propia agenda, y que las dos PWAs queden desplegadas bajo el dominio real del producto.

**Architecture:** El vínculo cuenta↔profesional **ya existe** (`professionals.user_id`, con FK a `auth.users`); este plan le añade la unicidad que le falta y lo puebla desde tres Server Actions nuevas en el panel (invitar, cambiar rol, revocar), apoyadas en el cliente admin y en las políticas RLS ya desplegadas. La app de staff pasa a autoseleccionar la ficha propia por ese vínculo. El resolutor de subdominio de ambas PWAs gana una lista de etiquetas reservadas para poder vivir bajo `*.clientes.` y `*.equipo.`.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · Supabase (`@supabase/supabase-js`, service_role admin, Auth admin API) · Zod · Vitest + Testing Library · Vite/React 18 + TanStack Query v5 (las dos PWAs).

**Spec:** [`docs/superpowers/specs/2026-09-05-denueveanueve-go-live-apps-kairos-design.md`](../specs/2026-09-05-denueveanueve-go-live-apps-kairos-design.md)

## Global Constraints

- **Tres repositorios distintos, cada uno con su git.** Kairos: `clients/projects/salon-os/`. App de cliente: `clients/projects/denueveanueve/`. App de staff: `clients/projects/denueveanueve-staff/`. Cada tarea dice en cuál trabaja; los comandos se ejecutan con ese directorio como CWD.
- **TypeScript strict, sin `any`.** `npx tsc --noEmit -p tsconfig.json` debe terminar en 0 en el repo tocado.
- **La suite existente debe seguir verde.** Kairos: `npx vitest run`. Las PWAs: `npm test` (= `vitest run`).
- **Migraciones** en `clients/projects/salon-os/supabase/migrations/`, nombradas `YYYYMMDDHHMMSS_<slug>.sql`, idempotentes, envueltas en `begin; … commit;` y con guardián `do $$ … $$` autoverificable. Patrón de referencia: `20260731100000_salon_sector.sql`.
- **Aplicación de migraciones:** vía Management API de Supabase contra el proyecto `jztoyekixcziaicrnlce`. Token en `clients/projects/salon-os/.env.local`, variable `SUPABASE_ACCESS_TOKEN`. Endpoint `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`. **Enviar un `User-Agent` de navegador** o Cloudflare responde 1010.
- **Multi-tenant:** toda lectura y escritura se acota por `salon_id`. Las Server Actions nuevas revalidan el rol aunque el layout ya lo haga: se ejecutan de forma independiente.
- **Secretos:** nunca se envía una contraseña en texto plano por ningún canal. El acceso se entrega siempre por invitación. `SUPABASE_SERVICE_ROLE_KEY` no sale jamás del servidor.
- **Idioma:** el código, los comentarios y los mensajes de usuario van en español, como el resto de los tres repos.
- Commits frecuentes, uno por tarea como mínimo.

---

## File Structure

**Kairos (`clients/projects/salon-os/`)**

- Create: `supabase/migrations/20260905100000_professional_user_link_unique.sql` — índice único parcial `(salon_id, user_id)` + guardián que aborta si ya hay duplicados.
- Create: `src/lib/team-access/rules.ts` — lógica **pura** de acceso de equipo: estado derivado, permiso por rol, guardián del último owner. Sin React ni Supabase.
- Create: `src/lib/team-access/rules.test.ts` — cobertura de lo anterior.
- Create: `src/lib/validations/team-access.ts` — esquemas Zod de las entradas de las tres acciones.
- Create: `src/app/(dashboard)/ajustes/personal/access-actions.ts` — las tres Server Actions. Fichero aparte de `actions.ts`, que ya tiene 300+ líneas de gestión de ficha; el acceso es otra responsabilidad.
- Create: `src/tests/integration/team-access-grant.test.ts` y `src/tests/integration/team-access-change-revoke.test.ts`.
- Create: `src/app/(dashboard)/ajustes/personal/access-cell.tsx` — celda de UI: estado de acceso y acciones.
- Modify: `src/app/(dashboard)/ajustes/personal/professionals-view.tsx` — monta la celda en la fila del profesional.
- Modify: `src/app/(dashboard)/ajustes/personal/page.tsx` — carga el estado de acceso junto al listado.

**App de staff (`clients/projects/denueveanueve-staff/`)**

- Create: `src/lib/my-professional.ts` — resolución **pura** de "qué ficha soy" a partir del listado y el `user_id` de sesión.
- Create: `src/lib/my-professional.test.ts`
- Modify: `src/lib/professionals-queries.ts` — el `select` incluye `user_id`.
- Modify: `src/lib/professionals.ts` — el tipo de item incluye `userId`.
- Modify: `src/pages/EmployeeCalendar.tsx` — autoselección por vínculo; sustituir la nota de diseño obsoleta.
- Modify: `src/lib/salon.ts` y `src/lib/salon.test.ts` — etiquetas reservadas.

**App de cliente (`clients/projects/denueveanueve/`)**

- Modify: `src/lib/salon.ts` y `src/lib/salon.test.ts` — etiquetas reservadas.
- Modify: `.env.example` — `VITE_SALON_OS_API_URL` apunta al panel Kairos.

**Documentación (repo raíz `g:\HAT3X\CLAUDE\HAT3X`)**

- Create: `docs/superpowers/plans/2026-09-05-denueveanueve-runbook-despliegue.md` — pasos manuales de DNS, Vercel y Supabase Auth, que ninguna tarea automatiza.
- Delete: `clients/projects/denueveanueve/docs/PENDIENTE-mis-citas-rls.md` — el pendiente que describe ya está resuelto en el servidor.

---

## Task 1: Unicidad del vínculo cuenta↔profesional

**Files:**
- Create: `clients/projects/salon-os/supabase/migrations/20260905100000_professional_user_link_unique.sql`

**Interfaces:**
- Produces (SQL): índice `professionals_salon_user_unique` sobre `public.professionals (salon_id, user_id) where user_id is not null`; y función `public.user_id_by_email(p_email text) returns uuid`, `SECURITY DEFINER`, ejecutable **solo** por `service_role`. No hay cambios de tipos TS para la columna: `professionals.user_id` ya está en `src/types/database.ts` (líneas 233, 242, 251).

- [ ] **Step 1: Comprobar que hoy no hay duplicados que impidan crear el índice**

CWD: `clients/projects/salon-os/`

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
curl -s -X POST "https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
  -d '{"query":"select salon_id, user_id, count(*) from public.professionals where user_id is not null group by 1,2 having count(*) > 1"}'
```

Esperado: `[]`. Si devuelve filas, **detente** y repórtalo: significa que una misma cuenta ya está ligada a dos fichas del mismo salón y hay que decidir cuál sobrevive antes de imponer la unicidad.

- [ ] **Step 2: Escribir la migración con guardián**

```sql
-- Vínculo cuenta↔profesional: una cuenta, como mucho una ficha por salón.
--
-- `professionals.user_id` (uuid nullable, FK a auth.users ON DELETE SET NULL) ya existía
-- y ya tiene índice NO único (`idx_professionals_user_id`, migración inicial). Lo que
-- faltaba es la INVARIANTE: dentro de un mismo salón, dos fichas no pueden apuntar a la
-- misma cuenta — si ocurriera, "qué profesional soy" dejaría de tener respuesta única y la
-- agenda propia de la app de staff sería ambigua.
--
-- Entre salones DISTINTOS sí puede repetirse: una persona que trabaja en dos salones es un
-- caso legítimo del modelo multi-tenant. Por eso la clave del índice es (salon_id, user_id)
-- y no user_id a secas.
--
-- Parcial (`where user_id is not null`) porque NULL es el estado normal: un profesional sin
-- acceso a la app. En Postgres varios NULL no colisionan en un índice único, pero se deja
-- explícito para que el índice sea más pequeño y la intención quede escrita.
begin;

create unique index if not exists professionals_salon_user_unique
  on public.professionals (salon_id, user_id)
  where user_id is not null;

comment on index public.professionals_salon_user_unique is
  'Una cuenta de auth, como mucho una ficha de profesional por salon. Entre salones puede repetirse.';

-- ── Búsqueda de cuenta por email ────────────────────────────────────────────
-- Dar acceso necesita saber si el email YA tiene cuenta: una persona que trabaja en dos
-- salones de Kairos se invita una vez y se le añade una membresía más. Sin esta consulta,
-- `inviteUserByEmail` fallaría con "email already registered" y el segundo salón no podría
-- darle acceso nunca.
--
-- `auth.users` NO está expuesta por PostgREST, así que ni el cliente admin puede leerla con
-- `.from()`. Esta función es la única puerta, y es lo más estrecha posible:
--   · devuelve SOLO el uuid — nunca el hash de contraseña, el teléfono ni los metadatos;
--   · SECURITY DEFINER con `search_path` fijado, para que no la secuestre un search_path
--     manipulado;
--   · EXECUTE revocado a todo el mundo salvo service_role, que solo existe en el servidor.
-- Un email es un identificador que quien gestiona el salón ya conoce (lo acaba de teclear),
-- así que confirmar su existencia no filtra nada que no supiera.
create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

comment on function public.user_id_by_email(text) is
  'uuid de la cuenta con ese email, o null. Solo service_role: la usa el alta de acceso de equipo.';

-- Guardián: la migración se declara aplicada solo si ambas piezas existen de verdad, y si
-- la función NO quedó ejecutable por authenticated (que sería una fuga de enumeración).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'professionals_salon_user_unique'
  ) then
    raise exception 'professionals_salon_user_unique no se creo';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'user_id_by_email'
  ) then
    raise exception 'user_id_by_email no se creo';
  end if;

  if has_function_privilege('authenticated', 'public.user_id_by_email(text)', 'execute') then
    raise exception 'user_id_by_email quedo ejecutable por authenticated';
  end if;
end $$;

commit;
```

- [ ] **Step 3: Aplicar la migración**

CWD: `clients/projects/salon-os/`

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
python - <<'PY' > /tmp/mig.json
import json, pathlib
sql = pathlib.Path("supabase/migrations/20260905100000_professional_user_link_unique.sql").read_text(encoding="utf-8")
print(json.dumps({"query": sql}))
PY
curl -s -X POST "https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" --data-binary @/tmp/mig.json
```

Esperado: respuesta sin campo `message` de error (`[]` o similar). Si aparece `"message": "Failed to run sql query…"`, la migración no se aplicó: corrige y repite.

- [ ] **Step 4: Verificar la invariante contra la base**

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
curl -s -X POST "https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
  -d '{"query":"select indexname, indexdef from pg_indexes where schemaname = '"'"'public'"'"' and indexname = '"'"'professionals_salon_user_unique'"'"'"}'
```

Esperado: una fila, con `indexdef` conteniendo `UNIQUE` y `WHERE (user_id IS NOT NULL)`.

- [ ] **Step 5: Commit**

CWD: `clients/projects/salon-os/`

```bash
git add supabase/migrations/20260905100000_professional_user_link_unique.sql
git commit -m "feat(acceso): una cuenta, como mucho una ficha por salon"
```

---

## Task 2: Reglas puras de acceso de equipo

**Files:**
- Create: `clients/projects/salon-os/src/lib/team-access/rules.ts`
- Test: `clients/projects/salon-os/src/lib/team-access/rules.test.ts`

**Interfaces:**
- Consumes: `MemberRole` de `@/types/database` (`'owner' | 'manager' | 'staff'`).
- Produces:
  - `type AccessStatus = "none" | "invited" | "active"`
  - `resolveAccessStatus(input: { userId: string | null; emailConfirmedAt: string | null }): AccessStatus`
  - `canManageTeamAccess(role: MemberRole | null | undefined): boolean`
  - `lastOwnerViolation(input: { targetCurrentRole: MemberRole | null; nextRole: MemberRole | null; ownerCount: number }): string | null`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/team-access/rules.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import {
  canManageTeamAccess,
  lastOwnerViolation,
  resolveAccessStatus,
} from "@/lib/team-access/rules";

describe("resolveAccessStatus", () => {
  it("sin cuenta ligada es 'none'", () => {
    expect(resolveAccessStatus({ userId: null, emailConfirmedAt: null })).toBe("none");
  });

  it("con cuenta ligada pero sin confirmar es 'invited'", () => {
    expect(resolveAccessStatus({ userId: "u1", emailConfirmedAt: null })).toBe("invited");
  });

  it("con cuenta ligada y confirmada es 'active'", () => {
    expect(
      resolveAccessStatus({ userId: "u1", emailConfirmedAt: "2026-09-05T10:00:00Z" }),
    ).toBe("active");
  });
});

describe("canManageTeamAccess", () => {
  it("owner y manager pueden", () => {
    expect(canManageTeamAccess("owner")).toBe(true);
    expect(canManageTeamAccess("manager")).toBe(true);
  });

  it("staff, null y undefined no pueden", () => {
    expect(canManageTeamAccess("staff")).toBe(false);
    expect(canManageTeamAccess(null)).toBe(false);
    expect(canManageTeamAccess(undefined)).toBe(false);
  });
});

describe("lastOwnerViolation", () => {
  it("degradar al unico owner se rechaza", () => {
    expect(
      lastOwnerViolation({ targetCurrentRole: "owner", nextRole: "manager", ownerCount: 1 }),
    ).toBe("No puedes dejar el salón sin ningún propietario");
  });

  it("revocar al unico owner se rechaza", () => {
    expect(
      lastOwnerViolation({ targetCurrentRole: "owner", nextRole: null, ownerCount: 1 }),
    ).toBe("No puedes dejar el salón sin ningún propietario");
  });

  it("degradar a un owner cuando hay dos se permite", () => {
    expect(
      lastOwnerViolation({ targetCurrentRole: "owner", nextRole: "manager", ownerCount: 2 }),
    ).toBeNull();
  });

  it("tocar a alguien que no es owner nunca viola la regla", () => {
    expect(
      lastOwnerViolation({ targetCurrentRole: "staff", nextRole: null, ownerCount: 1 }),
    ).toBeNull();
  });

  it("mantener owner como owner no viola la regla", () => {
    expect(
      lastOwnerViolation({ targetCurrentRole: "owner", nextRole: "owner", ownerCount: 1 }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

CWD: `clients/projects/salon-os/`

Run: `npx vitest run src/lib/team-access/rules.test.ts`
Esperado: FAIL — no se resuelve el módulo `@/lib/team-access/rules`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/lib/team-access/rules.ts`:

```typescript
/**
 * Reglas PURAS del acceso de equipo. Sin React, sin Supabase, sin `process.env`:
 * todo entra por parámetro para poder probarlas en aislamiento.
 *
 * El permiso REAL lo imponen las políticas RLS del servidor
 * (owners_managers_insert_members / _update_ / owners_delete_members). Estas funciones
 * son la primera barrera y la fuente de los mensajes legibles.
 */
import type { MemberRole } from "@/types/database";

/** Estado de acceso de un profesional, derivado de su ficha y su cuenta. */
export type AccessStatus = "none" | "invited" | "active";

/**
 * Deriva el estado de acceso:
 *   · sin `user_id` en la ficha        → no tiene acceso
 *   · con cuenta pero sin confirmar    → invitado (le llegó el email, no ha entrado)
 *   · con cuenta confirmada            → activo
 */
export function resolveAccessStatus(input: {
  userId: string | null;
  emailConfirmedAt: string | null;
}): AccessStatus {
  if (input.userId === null) return "none";
  return input.emailConfirmedAt === null ? "invited" : "active";
}

/** `true` si el rol puede dar, cambiar o quitar accesos del equipo. */
export function canManageTeamAccess(role: MemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Guardián del último propietario. Devuelve el mensaje de rechazo, o `null` si la
 * operación es legítima.
 *
 * `nextRole: null` representa una REVOCACIÓN (la membresía desaparece). Un salón sin
 * ningún owner se queda sin nadie capaz de gestionar accesos: es un callejón sin salida
 * que solo HAT3X podría deshacer, justo lo que este trabajo viene a evitar.
 */
export function lastOwnerViolation(input: {
  targetCurrentRole: MemberRole | null;
  nextRole: MemberRole | null;
  ownerCount: number;
}): string | null {
  const dejaDeSerOwner = input.targetCurrentRole === "owner" && input.nextRole !== "owner";
  if (dejaDeSerOwner && input.ownerCount <= 1) {
    return "No puedes dejar el salón sin ningún propietario";
  }
  return null;
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npx vitest run src/lib/team-access/rules.test.ts`
Esperado: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/team-access/rules.ts src/lib/team-access/rules.test.ts
git commit -m "feat(acceso): reglas puras de acceso de equipo y guardian del ultimo owner"
```

---

## Task 3: Validación Zod de las entradas

**Files:**
- Create: `clients/projects/salon-os/src/lib/validations/team-access.ts`
- Test: `clients/projects/salon-os/src/lib/validations/team-access.test.ts`

**Interfaces:**
- Produces:
  - `grantAccessSchema` — objeto `{ professionalId: string (uuid); email: string (email, normalizado a minúsculas sin espacios); role: 'manager' | 'staff' }`
  - `type GrantAccessInput = z.infer<typeof grantAccessSchema>`
  - `changeRoleSchema` — `{ professionalId: string (uuid); role: 'owner' | 'manager' | 'staff' }`
  - `type ChangeRoleInput = z.infer<typeof changeRoleSchema>`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/validations/team-access.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { changeRoleSchema, grantAccessSchema } from "@/lib/validations/team-access";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("grantAccessSchema", () => {
  it("acepta una entrada valida y normaliza el email", () => {
    const parsed = grantAccessSchema.parse({
      professionalId: UUID,
      email: "  Ana.Fernandez@Example.com ",
      role: "staff",
    });
    expect(parsed.email).toBe("ana.fernandez@example.com");
    expect(parsed.role).toBe("staff");
  });

  it("rechaza un email que no lo es", () => {
    const r = grantAccessSchema.safeParse({
      professionalId: UUID,
      email: "no-es-un-email",
      role: "staff",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un professionalId que no es uuid", () => {
    const r = grantAccessSchema.safeParse({
      professionalId: "abc",
      email: "ana@example.com",
      role: "staff",
    });
    expect(r.success).toBe(false);
  });

  it("no deja invitar directamente como owner", () => {
    const r = grantAccessSchema.safeParse({
      professionalId: UUID,
      email: "ana@example.com",
      role: "owner",
    });
    expect(r.success).toBe(false);
  });
});

describe("changeRoleSchema", () => {
  it("acepta owner, que si es un ascenso valido", () => {
    const parsed = changeRoleSchema.parse({ professionalId: UUID, role: "owner" });
    expect(parsed.role).toBe("owner");
  });

  it("rechaza un rol inventado", () => {
    const r = changeRoleSchema.safeParse({ professionalId: UUID, role: "jefe" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npx vitest run src/lib/validations/team-access.test.ts`
Esperado: FAIL — no se resuelve el módulo.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/lib/validations/team-access.ts`:

```typescript
/**
 * Esquemas de entrada de las acciones de acceso de equipo.
 *
 * INVITAR no admite `owner` a propósito: la propiedad del salón se transfiere con
 * intención sobre una cuenta que YA existe (changeRoleSchema), no se reparte por email en
 * el mismo gesto con el que se da de alta a una peluquera.
 */
import { z } from "zod";

const professionalId = z.string().uuid("Identificador de profesional no válido");

export const grantAccessSchema = z.object({
  professionalId,
  email: z.string().trim().toLowerCase().email("Escribe un email válido"),
  role: z.enum(["manager", "staff"], {
    errorMap: () => ({ message: "El rol debe ser manager o staff" }),
  }),
});

export type GrantAccessInput = z.infer<typeof grantAccessSchema>;

export const changeRoleSchema = z.object({
  professionalId,
  role: z.enum(["owner", "manager", "staff"], {
    errorMap: () => ({ message: "Rol no válido" }),
  }),
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npx vitest run src/lib/validations/team-access.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/team-access.ts src/lib/validations/team-access.test.ts
git commit -m "feat(acceso): validacion de las entradas de acceso de equipo"
```

---

## Task 4: Server Action `grantProfessionalAccess`

**Files:**
- Create: `clients/projects/salon-os/src/app/(dashboard)/ajustes/personal/access-actions.ts`
- Test: `clients/projects/salon-os/src/tests/integration/team-access-grant.test.ts`

**Interfaces:**
- Consumes: `grantAccessSchema`, `GrantAccessInput` (Task 3); `canManageTeamAccess` (Task 2); `getActiveMembership` de `@/lib/salon`; `createAdminClient` de `@/lib/supabase/admin`.
- Produces: `type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }` exportado desde este módulo, y `grantProfessionalAccess(input: GrantAccessInput): Promise<ActionResult<{ status: "invited" | "linked" | "already" }>>` — `invited` = cuenta nueva creada por invitación; `linked` = el email ya tenía cuenta y solo se le ha añadido este salón; `already` = la ficha ya tenía acceso.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/tests/integration/team-access-grant.test.ts`:

```typescript
/**
 * Integración de `grantProfessionalAccess` con dobles de Supabase.
 *
 * Se dobla: `@/lib/salon` (membresía activa fija), `@/lib/supabase/admin` (Auth admin +
 * escrituras), y `next/cache` (revalidatePath no-op). La lógica pura de reglas y la
 * validación Zod son las REALES.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const SALON_ID = "salon-1";
const PRO_ID = "11111111-1111-4111-8111-111111111111";
const NEW_USER_ID = "22222222-2222-4222-8222-222222222222";

const EXISTING_USER_ID = "33333333-3333-4333-8333-333333333333";

const holder = vi.hoisted(() => ({
  role: "owner" as "owner" | "manager" | "staff",
  professionalRow: null as { id: string; salon_id: string; user_id: string | null } | null,
  /** Devuelto por la RPC `user_id_by_email`: null = ese email no tiene cuenta todavía. */
  existingUserId: null as string | null,
  invited: [] as string[],
  memberInserts: [] as Array<Record<string, unknown>>,
  professionalUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/lib/salon", () => ({
  getActiveMembership: async () => ({
    salonId: SALON_ID,
    role: holder.role,
    canOverlapAppointments: false,
  }),
}));

vi.mock("@/lib/supabase/admin", () => {
  function from(table: string) {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      insert(payload: Record<string, unknown>) {
        if (table === "salon_members") holder.memberInserts.push(payload);
        return builder;
      },
      update(payload: Record<string, unknown>) {
        if (table === "professionals") holder.professionalUpdates.push(payload);
        return builder;
      },
      async maybeSingle() {
        if (table === "professionals") return { data: holder.professionalRow, error: null };
        return { data: null, error: null };
      },
      then(resolve: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return builder;
  }

  return {
    createAdminClient: () => ({
      from,
      rpc: async (_name: string, _args: Record<string, unknown>) => ({
        data: holder.existingUserId,
        error: null,
      }),
      auth: {
        admin: {
          inviteUserByEmail: async (email: string) => {
            holder.invited.push(email);
            return { data: { user: { id: NEW_USER_ID } }, error: null };
          },
        },
      },
    }),
  };
});

const { grantProfessionalAccess } = await import(
  "@/app/(dashboard)/ajustes/personal/access-actions"
);

beforeEach(() => {
  holder.role = "owner";
  holder.professionalRow = { id: PRO_ID, salon_id: SALON_ID, user_id: null };
  holder.existingUserId = null;
  holder.invited = [];
  holder.memberInserts = [];
  holder.professionalUpdates = [];
});

describe("grantProfessionalAccess", () => {
  it("invita, crea la membresia y liga la ficha", async () => {
    const r = await grantProfessionalAccess({
      professionalId: PRO_ID,
      email: "ana@example.com",
      role: "staff",
    });

    expect(r).toEqual({ ok: true, data: { status: "invited" } });
    expect(holder.invited).toEqual(["ana@example.com"]);
    expect(holder.memberInserts[0]).toMatchObject({
      salon_id: SALON_ID,
      user_id: NEW_USER_ID,
      role: "staff",
    });
    expect(holder.professionalUpdates[0]).toMatchObject({ user_id: NEW_USER_ID });
  });

  it("es idempotente: si la ficha ya tiene cuenta, no duplica membresia", async () => {
    holder.professionalRow = { id: PRO_ID, salon_id: SALON_ID, user_id: NEW_USER_ID };

    const r = await grantProfessionalAccess({
      professionalId: PRO_ID,
      email: "ana@example.com",
      role: "staff",
    });

    expect(r).toEqual({ ok: true, data: { status: "already" } });
    expect(holder.memberInserts).toHaveLength(0);
  });

  it("si el email ya tiene cuenta (otro salon), la reutiliza sin invitar de nuevo", async () => {
    holder.existingUserId = EXISTING_USER_ID;

    const r = await grantProfessionalAccess({
      professionalId: PRO_ID,
      email: "ana@example.com",
      role: "staff",
    });

    expect(r).toEqual({ ok: true, data: { status: "linked" } });
    expect(holder.invited).toHaveLength(0);
    expect(holder.memberInserts[0]).toMatchObject({
      salon_id: SALON_ID,
      user_id: EXISTING_USER_ID,
      role: "staff",
    });
    expect(holder.professionalUpdates[0]).toMatchObject({ user_id: EXISTING_USER_ID });
  });

  it("un staff no puede dar acceso", async () => {
    holder.role = "staff";

    const r = await grantProfessionalAccess({
      professionalId: PRO_ID,
      email: "ana@example.com",
      role: "staff",
    });

    expect(r.ok).toBe(false);
    expect(holder.invited).toHaveLength(0);
  });

  it("rechaza una ficha de otro salon", async () => {
    holder.professionalRow = null; // la consulta acotada por salon_id no la encuentra

    const r = await grantProfessionalAccess({
      professionalId: PRO_ID,
      email: "ana@example.com",
      role: "staff",
    });

    expect(r.ok).toBe(false);
    expect(holder.invited).toHaveLength(0);
  });

  it("rechaza un email invalido antes de tocar nada", async () => {
    const r = await grantProfessionalAccess({
      professionalId: PRO_ID,
      email: "no-es-email",
      role: "staff",
    });

    expect(r.ok).toBe(false);
    expect(holder.invited).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npx vitest run src/tests/integration/team-access-grant.test.ts`
Esperado: FAIL — no se resuelve `access-actions`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/app/(dashboard)/ajustes/personal/access-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership } from "@/lib/salon";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageTeamAccess } from "@/lib/team-access/rules";
import { grantAccessSchema, type GrantAccessInput } from "@/lib/validations/team-access";

/** Resultado tipado de una acción de acceso de equipo. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const SETTINGS_PATH = "/ajustes/personal";

/**
 * Resuelve el salón activo y exige rol de gestión.
 *
 * Defensa en profundidad: el layout ya bloquea a `staff` y la RLS impone el permiso en el
 * servidor, pero un Server Action se invoca de forma independiente y debe revalidarlo.
 */
async function requireManagerSalonId(): Promise<
  { ok: true; salonId: string } | { ok: false; error: string }
> {
  const membership = await getActiveMembership();
  if (membership === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }
  if (!canManageTeamAccess(membership.role)) {
    return { ok: false, error: "No tienes permiso para gestionar los accesos del equipo" };
  }
  return { ok: true, salonId: membership.salonId };
}

/**
 * Da acceso a la app a un profesional del salón activo.
 *
 * Dos escrituras que van juntas: la membresía (`salon_members`) es lo que permite ENTRAR,
 * y el vínculo (`professionals.user_id`) es lo que permite saber QUIÉN eres una vez dentro.
 * Una sin la otra deja a la persona a medias.
 *
 * Idempotente: si la ficha ya tiene cuenta ligada, no invita ni inserta nada y devuelve
 * `already`. Repetir el gesto no rompe ni duplica.
 */
export async function grantProfessionalAccess(
  input: GrantAccessInput,
): Promise<ActionResult<{ status: "invited" | "linked" | "already" }>> {
  const parsed = grantAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const guard = await requireManagerSalonId();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  // Guarda de tenant: la ficha debe ser de ESTE salón. Sin esto, un manager podría
  // ligar una cuenta a la ficha de otro salón pasando un uuid ajeno.
  const { data: professional, error: readError } = await admin
    .from("professionals")
    .select("id, salon_id, user_id")
    .eq("id", parsed.data.professionalId)
    .eq("salon_id", guard.salonId)
    .maybeSingle();

  if (readError !== null) {
    return { ok: false, error: readError.message };
  }
  if (professional === null) {
    return { ok: false, error: "Ese profesional no pertenece a tu salón" };
  }
  if (professional.user_id !== null) {
    return { ok: true, data: { status: "already" } };
  }

  // ¿Ese email ya tiene cuenta? Una persona que trabaja en dos salones de Kairos se invita
  // UNA vez; al segundo salón solo se le añade una membresía. Sin esta consulta previa,
  // `inviteUserByEmail` fallaría con "email already registered" y el segundo salón no
  // podría darle acceso nunca. `auth.users` no es consultable con `.from()`: va por la RPC
  // `user_id_by_email`, que solo puede ejecutar service_role y solo devuelve el uuid.
  const { data: existingUserId, error: lookupError } = await admin.rpc("user_id_by_email", {
    p_email: parsed.data.email,
  });

  if (lookupError !== null) {
    return { ok: false, error: lookupError.message };
  }

  let userId: string;
  let status: "invited" | "linked";

  if (typeof existingUserId === "string") {
    userId = existingUserId;
    status = "linked";
  } else {
    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(parsed.data.email);

    if (inviteError !== null || invited?.user == null) {
      return { ok: false, error: inviteError?.message ?? "No se pudo enviar la invitación" };
    }
    userId = invited.user.id;
    status = "invited";
  }

  const { error: memberError } = await admin.from("salon_members").insert({
    salon_id: guard.salonId,
    user_id: userId,
    role: parsed.data.role,
  });

  if (memberError !== null) {
    return { ok: false, error: memberError.message };
  }

  const { error: linkError } = await admin
    .from("professionals")
    .update({ user_id: userId })
    .eq("id", professional.id)
    .eq("salon_id", guard.salonId);

  if (linkError !== null) {
    return { ok: false, error: linkError.message };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: { status } };
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npx vitest run src/tests/integration/team-access-grant.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Step 5: Verificar tipos y suite completa**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
```
Esperado: ambos en verde.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/ajustes/personal/access-actions.ts" src/tests/integration/team-access-grant.test.ts
git commit -m "feat(acceso): invitar a un profesional a la app desde su ficha"
```

---

## Task 5: Server Actions `changeProfessionalRole` y `revokeProfessionalAccess`

**Files:**
- Modify: `clients/projects/salon-os/src/app/(dashboard)/ajustes/personal/access-actions.ts`
- Modify: `clients/projects/salon-os/src/app/(dashboard)/ajustes/personal/actions.ts:316` — `deleteProfessional` rechaza borrar una ficha con acceso vivo.
- Test: `clients/projects/salon-os/src/tests/integration/team-access-change-revoke.test.ts`

**Interfaces:**
- Consumes: `changeRoleSchema`, `ChangeRoleInput` (Task 3); `lastOwnerViolation` (Task 2); `requireManagerSalonId`, `ActionResult`, `SETTINGS_PATH` y `createAdminClient` (ya presentes en el módulo tras la Task 4).
- Produces:
  - `changeProfessionalRole(input: ChangeRoleInput): Promise<ActionResult<null>>`
  - `revokeProfessionalAccess(professionalId: string): Promise<ActionResult<null>>`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/tests/integration/team-access-change-revoke.test.ts`:

```typescript
/**
 * Integración de `changeProfessionalRole` y `revokeProfessionalAccess`.
 * El caso que más importa: no dejar un salón sin ningún propietario.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const SALON_ID = "salon-1";
const PRO_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const holder = vi.hoisted(() => ({
  role: "owner" as "owner" | "manager" | "staff",
  professionalRow: null as { id: string; salon_id: string; user_id: string | null } | null,
  targetRole: "staff" as "owner" | "manager" | "staff",
  ownerCount: 2,
  memberUpdates: [] as Array<Record<string, unknown>>,
  memberDeletes: 0,
  professionalUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/lib/salon", () => ({
  getActiveMembership: async () => ({
    salonId: SALON_ID,
    role: holder.role,
    canOverlapAppointments: false,
  }),
}));

vi.mock("@/lib/supabase/admin", () => {
  function from(table: string) {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      update(payload: Record<string, unknown>) {
        if (table === "salon_members") holder.memberUpdates.push(payload);
        if (table === "professionals") holder.professionalUpdates.push(payload);
        return builder;
      },
      delete() {
        if (table === "salon_members") holder.memberDeletes += 1;
        return builder;
      },
      async maybeSingle() {
        if (table === "professionals") return { data: holder.professionalRow, error: null };
        if (table === "salon_members") return { data: { role: holder.targetRole }, error: null };
        return { data: null, error: null };
      },
      then(resolve: (v: { data: unknown; error: null; count: number }) => unknown) {
        return Promise.resolve({
          data: null,
          error: null,
          count: holder.ownerCount,
        }).then(resolve);
      },
    };
    return builder;
  }

  return { createAdminClient: () => ({ from }) };
});

const { changeProfessionalRole, revokeProfessionalAccess } = await import(
  "@/app/(dashboard)/ajustes/personal/access-actions"
);

beforeEach(() => {
  holder.role = "owner";
  holder.professionalRow = { id: PRO_ID, salon_id: SALON_ID, user_id: USER_ID };
  holder.targetRole = "staff";
  holder.ownerCount = 2;
  holder.memberUpdates = [];
  holder.memberDeletes = 0;
  holder.professionalUpdates = [];
});

describe("changeProfessionalRole", () => {
  it("asciende un staff a manager", async () => {
    const r = await changeProfessionalRole({ professionalId: PRO_ID, role: "manager" });

    expect(r.ok).toBe(true);
    expect(holder.memberUpdates[0]).toMatchObject({ role: "manager" });
  });

  it("no degrada al unico owner", async () => {
    holder.targetRole = "owner";
    holder.ownerCount = 1;

    const r = await changeProfessionalRole({ professionalId: PRO_ID, role: "manager" });

    expect(r).toEqual({
      ok: false,
      error: "No puedes dejar el salón sin ningún propietario",
    });
    expect(holder.memberUpdates).toHaveLength(0);
  });

  it("si hay dos owners, degradar a uno se permite", async () => {
    holder.targetRole = "owner";
    holder.ownerCount = 2;

    const r = await changeProfessionalRole({ professionalId: PRO_ID, role: "manager" });

    expect(r.ok).toBe(true);
  });
});

describe("revokeProfessionalAccess", () => {
  it("borra la membresia y desliga la ficha", async () => {
    const r = await revokeProfessionalAccess(PRO_ID);

    expect(r.ok).toBe(true);
    expect(holder.memberDeletes).toBe(1);
    expect(holder.professionalUpdates[0]).toMatchObject({ user_id: null });
  });

  it("no revoca al unico owner", async () => {
    holder.targetRole = "owner";
    holder.ownerCount = 1;

    const r = await revokeProfessionalAccess(PRO_ID);

    expect(r.ok).toBe(false);
    expect(holder.memberDeletes).toBe(0);
  });

  it("sobre una ficha sin acceso no hace nada y no falla", async () => {
    holder.professionalRow = { id: PRO_ID, salon_id: SALON_ID, user_id: null };

    const r = await revokeProfessionalAccess(PRO_ID);

    expect(r.ok).toBe(true);
    expect(holder.memberDeletes).toBe(0);
  });

  it("un staff no puede revocar", async () => {
    holder.role = "staff";

    const r = await revokeProfessionalAccess(PRO_ID);

    expect(r.ok).toBe(false);
    expect(holder.memberDeletes).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npx vitest run src/tests/integration/team-access-change-revoke.test.ts`
Esperado: FAIL — `changeProfessionalRole` no está exportada.

- [ ] **Step 3: Ampliar los imports de la cabecera**

En `access-actions.ts`, el bloque de imports (justo debajo de `"use server";`, que debe seguir siendo la primera sentencia del fichero) pasa a incluir también:

```typescript
import { canManageTeamAccess, lastOwnerViolation } from "@/lib/team-access/rules";
import {
  changeRoleSchema,
  grantAccessSchema,
  type ChangeRoleInput,
  type GrantAccessInput,
} from "@/lib/validations/team-access";
import type { MemberRole } from "@/types/database";
```

(sustituyendo los dos imports parciales que dejó la Task 4).

- [ ] **Step 4: Añadir el contexto compartido y las dos acciones**

Al final de `access-actions.ts`:

```typescript
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Carga la ficha (acotada al salón) y el rol actual de su cuenta, más cuántos owners
 * quedan en el salón. Es el contexto que necesitan tanto el cambio de rol como la
 * revocación para decidir si la operación deja el salón sin propietario.
 */
async function loadAccessContext(
  admin: AdminClient,
  salonId: string,
  professionalId: string,
): Promise<
  | { ok: true; userId: string | null; currentRole: MemberRole | null; ownerCount: number }
  | { ok: false; error: string }
> {
  const { data: professional, error } = await admin
    .from("professionals")
    .select("id, salon_id, user_id")
    .eq("id", professionalId)
    .eq("salon_id", salonId)
    .maybeSingle();

  if (error !== null) return { ok: false, error: error.message };
  if (professional === null) {
    return { ok: false, error: "Ese profesional no pertenece a tu salón" };
  }
  if (professional.user_id === null) {
    return { ok: true, userId: null, currentRole: null, ownerCount: 0 };
  }

  const { data: member, error: memberError } = await admin
    .from("salon_members")
    .select("role")
    .eq("salon_id", salonId)
    .eq("user_id", professional.user_id)
    .maybeSingle();

  if (memberError !== null) return { ok: false, error: memberError.message };

  const { count, error: countError } = await admin
    .from("salon_members")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", salonId)
    .eq("role", "owner");

  if (countError !== null) return { ok: false, error: countError.message };

  return {
    ok: true,
    userId: professional.user_id,
    currentRole: (member?.role ?? null) as MemberRole | null,
    ownerCount: count ?? 0,
  };
}

/** Cambia el rol de la cuenta ligada a un profesional del salón activo. */
export async function changeProfessionalRole(
  input: ChangeRoleInput,
): Promise<ActionResult<null>> {
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const guard = await requireManagerSalonId();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const ctx = await loadAccessContext(admin, guard.salonId, parsed.data.professionalId);
  if (!ctx.ok) return ctx;
  if (ctx.userId === null) {
    return { ok: false, error: "Ese profesional todavía no tiene acceso" };
  }

  const violation = lastOwnerViolation({
    targetCurrentRole: ctx.currentRole,
    nextRole: parsed.data.role,
    ownerCount: ctx.ownerCount,
  });
  if (violation !== null) return { ok: false, error: violation };

  const { error } = await admin
    .from("salon_members")
    .update({ role: parsed.data.role })
    .eq("salon_id", guard.salonId)
    .eq("user_id", ctx.userId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: null };
}

/**
 * Quita el acceso de un profesional: borra su membresía y desliga la ficha.
 *
 * NO borra el usuario de Supabase Auth ni la ficha: el histórico de citas y visitas
 * sigue colgando del profesional, y la persona puede recuperar el acceso más adelante
 * sin perder nada.
 */
export async function revokeProfessionalAccess(
  professionalId: string,
): Promise<ActionResult<null>> {
  const guard = await requireManagerSalonId();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const ctx = await loadAccessContext(admin, guard.salonId, professionalId);
  if (!ctx.ok) return ctx;

  // Sin cuenta ligada no hay nada que revocar. Devolver ok mantiene la acción idempotente.
  if (ctx.userId === null) {
    return { ok: true, data: null };
  }

  const violation = lastOwnerViolation({
    targetCurrentRole: ctx.currentRole,
    nextRole: null,
    ownerCount: ctx.ownerCount,
  });
  if (violation !== null) return { ok: false, error: violation };

  const { error: deleteError } = await admin
    .from("salon_members")
    .delete()
    .eq("salon_id", guard.salonId)
    .eq("user_id", ctx.userId);

  if (deleteError !== null) return { ok: false, error: deleteError.message };

  const { error: unlinkError } = await admin
    .from("professionals")
    .update({ user_id: null })
    .eq("id", professionalId)
    .eq("salon_id", guard.salonId);

  if (unlinkError !== null) return { ok: false, error: unlinkError.message };

  revalidatePath(SETTINGS_PATH);
  return { ok: true, data: null };
}
```

- [ ] **Step 5: Impedir que se borre una ficha con acceso vivo**

Sin esto, borrar a una profesional que tiene acceso deja su cuenta dentro del salón pero sin ficha: entra en la app de staff y no tiene agenda ninguna, y nadie puede revocarla ya desde la UI porque la fila desde la que se revoca ha desaparecido.

Añadir el test al mismo fichero `src/tests/integration/team-access-change-revoke.test.ts`:

```typescript
describe("deleteProfessional con acceso vivo", () => {
  it("se rechaza y pide revocar primero", async () => {
    const { deleteProfessional } = await import(
      "@/app/(dashboard)/ajustes/personal/actions"
    );
    holder.professionalRow = { id: PRO_ID, salon_id: SALON_ID, user_id: USER_ID };

    const r = await deleteProfessional(PRO_ID);

    expect(r).toEqual({
      ok: false,
      error: "Quita primero el acceso de esta persona para poder borrar su ficha",
    });
  });
});
```

Y en `src/app/(dashboard)/ajustes/personal/actions.ts`, dentro de `deleteProfessional` (línea 316), antes de ejecutar el borrado:

```typescript
  // Una ficha con cuenta ligada no se borra: primero se revoca el acceso. El orden
  // importa — al revés, la persona se queda dentro del salón sin ficha y sin forma de
  // que nadie le quite el acceso desde la UI.
  const { data: linked, error: linkedError } = await supabase
    .from("professionals")
    .select("user_id")
    .eq("id", professionalId)
    .eq("salon_id", guard.salonId)
    .maybeSingle();

  if (linkedError !== null) {
    return { ok: false, error: linkedError.message };
  }
  if (linked?.user_id != null) {
    return {
      ok: false,
      error: "Quita primero el acceso de esta persona para poder borrar su ficha",
    };
  }
```

Ajusta los nombres `supabase` / `guard.salonId` a los que ya use esa función en el fichero.

- [ ] **Step 6: Ejecutar el test y comprobar que pasa**

Run: `npx vitest run src/tests/integration/team-access-change-revoke.test.ts`
Esperado: PASS, 8 tests.

- [ ] **Step 7: Verificar tipos y suite completa**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
```
Esperado: ambos en verde.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/ajustes/personal/access-actions.ts" "src/app/(dashboard)/ajustes/personal/actions.ts" src/tests/integration/team-access-change-revoke.test.ts
git commit -m "feat(acceso): cambiar rol y revocar, sin poder dejar el salon sin duenos"
```

---

## Task 6: UI de acceso en la ficha del profesional

**Files:**
- Create: `clients/projects/salon-os/src/app/(dashboard)/ajustes/personal/access-cell.tsx`
- Modify: `clients/projects/salon-os/src/app/(dashboard)/ajustes/personal/professionals-view.tsx`
- Modify: `clients/projects/salon-os/src/app/(dashboard)/ajustes/personal/page.tsx`
- Test: `clients/projects/salon-os/src/tests/unit/access-cell.test.tsx`

**Interfaces:**
- Consumes: `grantProfessionalAccess`, `revokeProfessionalAccess` (Tasks 4-5); `resolveAccessStatus`, `AccessStatus` (Task 2).
- Produces: componente `AccessCell(props: AccessCellProps)` con `AccessCellProps = { professionalId: string; userId: string | null; emailConfirmedAt: string | null; role: MemberRole | null; canManage: boolean }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/tests/unit/access-cell.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(dashboard)/ajustes/personal/access-actions", () => ({
  grantProfessionalAccess: vi.fn(),
  changeProfessionalRole: vi.fn(),
  revokeProfessionalAccess: vi.fn(),
}));

import { AccessCell } from "@/app/(dashboard)/ajustes/personal/access-cell";

const PRO_ID = "11111111-1111-4111-8111-111111111111";

describe("AccessCell", () => {
  it("sin cuenta ofrece dar acceso", () => {
    render(
      <AccessCell
        professionalId={PRO_ID}
        userId={null}
        emailConfirmedAt={null}
        role={null}
        canManage
      />,
    );
    expect(screen.getByRole("button", { name: /dar acceso/i })).toBeInTheDocument();
  });

  it("con cuenta sin confirmar se muestra como invitado", () => {
    render(
      <AccessCell
        professionalId={PRO_ID}
        userId="u1"
        emailConfirmedAt={null}
        role="staff"
        canManage
      />,
    );
    expect(screen.getByText(/invitado/i)).toBeInTheDocument();
  });

  it("con cuenta confirmada se muestra como activo", () => {
    render(
      <AccessCell
        professionalId={PRO_ID}
        userId="u1"
        emailConfirmedAt="2026-09-05T10:00:00Z"
        role="staff"
        canManage
      />,
    );
    expect(screen.getByText(/activo/i)).toBeInTheDocument();
  });

  it("sin permiso no ofrece ninguna accion", () => {
    render(
      <AccessCell
        professionalId={PRO_ID}
        userId={null}
        emailConfirmedAt={null}
        role={null}
        canManage={false}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npx vitest run src/tests/unit/access-cell.test.tsx`
Esperado: FAIL — no se resuelve `access-cell`.

- [ ] **Step 3: Escribir el componente**

Crear `src/app/(dashboard)/ajustes/personal/access-cell.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveAccessStatus, type AccessStatus } from "@/lib/team-access/rules";
import type { MemberRole } from "@/types/database";

import { grantProfessionalAccess, revokeProfessionalAccess } from "./access-actions";

const STATUS_LABEL: Record<AccessStatus, string> = {
  none: "Sin acceso",
  invited: "Invitado",
  active: "Activo",
};

export interface AccessCellProps {
  professionalId: string;
  /** `professionals.user_id`: null si la ficha no tiene cuenta ligada. */
  userId: string | null;
  /** `auth.users.email_confirmed_at` de esa cuenta, si la hay. */
  emailConfirmedAt: string | null;
  /** Rol de la membresía, si la hay. */
  role: MemberRole | null;
  /** `false` para un `staff`: ve el estado, no las acciones. */
  canManage: boolean;
}

/**
 * Estado de acceso de un profesional y sus acciones, dentro de su fila.
 *
 * El email lo teclea aquí quien gestiona el salón: HAT3X no recoge ni custodia esos datos.
 */
export function AccessCell({
  professionalId,
  userId,
  emailConfirmedAt,
  role,
  canManage,
}: AccessCellProps) {
  const status = resolveAccessStatus({ userId, emailConfirmedAt });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onGrant() {
    setError(null);
    startTransition(async () => {
      const r = await grantProfessionalAccess({ professionalId, email, role: "staff" });
      if (!r.ok) setError(r.error);
      else setEmail("");
    });
  }

  function onRevoke() {
    setError(null);
    startTransition(async () => {
      const r = await revokeProfessionalAccess(professionalId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge variant={status === "active" ? "default" : "secondary"}>
          {STATUS_LABEL[status]}
        </Badge>
        {role !== null ? (
          <span className="text-muted-foreground text-xs">{role}</span>
        ) : null}
      </div>

      {canManage && status === "none" ? (
        <div className="flex items-center gap-2">
          <Input
            type="email"
            value={email}
            placeholder="email@ejemplo.com"
            aria-label="Email para la invitación"
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button size="sm" disabled={pending || email.length === 0} onClick={onGrant}>
            Dar acceso
          </Button>
        </div>
      ) : null}

      {canManage && status !== "none" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={onRevoke}>
          Revocar
        </Button>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npx vitest run src/tests/unit/access-cell.test.tsx`
Esperado: PASS, 4 tests.

- [ ] **Step 5: Montar la celda en el listado**

En `page.tsx`, la consulta que alimenta el listado debe incluir `user_id` de `professionals`, y cargar además —con el cliente admin— el rol de `salon_members` y el `email_confirmed_at` de esas cuentas, pasándolos como props a la vista. En `professionals-view.tsx`, añadir una columna «Acceso» a la tabla que renderice `<AccessCell …>`, con `canManage` derivado del rol del usuario en sesión.

Sigue el estilo de la vista existente: la tabla ya monta los botones de editar y borrar por fila alrededor de la línea 228; la nueva columna va junto a ellos.

- [ ] **Step 6: Verificar tipos y suite completa**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
```
Esperado: ambos en verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/ajustes/personal/" src/tests/unit/access-cell.test.tsx
git commit -m "feat(acceso): el salon da y quita acceso desde la ficha del profesional"
```

---

## Task 7: La app de staff resuelve su propia ficha

**Files:**
- Create: `clients/projects/denueveanueve-staff/src/lib/my-professional.ts`
- Test: `clients/projects/denueveanueve-staff/src/lib/my-professional.test.ts`
- Modify: `clients/projects/denueveanueve-staff/src/lib/professionals-queries.ts`
- Modify: `clients/projects/denueveanueve-staff/src/lib/professionals.ts`

**Interfaces:**
- Produces: `findMyProfessionalId(professionals: ReadonlyArray<{ id: string; userId: string | null }>, userId: string | null): string | null`; y `ProfessionalListItem` gana el campo `userId: string | null`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/my-professional.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

import { findMyProfessionalId } from '@/lib/my-professional';

const LISTA = [
  { id: 'p1', userId: null },
  { id: 'p2', userId: 'u2' },
  { id: 'p3', userId: 'u3' },
];

describe('findMyProfessionalId', () => {
  it('encuentra la ficha ligada a la cuenta', () => {
    expect(findMyProfessionalId(LISTA, 'u3')).toBe('p3');
  });

  it('sin sesion devuelve null', () => {
    expect(findMyProfessionalId(LISTA, null)).toBeNull();
  });

  it('una cuenta sin ficha devuelve null', () => {
    expect(findMyProfessionalId(LISTA, 'u9')).toBeNull();
  });

  it('no confunde fichas sin cuenta con una sesion nula', () => {
    expect(findMyProfessionalId([{ id: 'p1', userId: null }], null)).toBeNull();
  });

  it('con la lista vacia devuelve null', () => {
    expect(findMyProfessionalId([], 'u2')).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

CWD: `clients/projects/denueveanueve-staff/`

Run: `npm test -- src/lib/my-professional.test.ts`
Esperado: FAIL — no se resuelve el módulo.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/lib/my-professional.ts`:

```typescript
/**
 * «¿Qué profesional soy?» — resolución PURA del vínculo cuenta↔ficha.
 *
 * El vínculo vive en `professionals.user_id` (uuid nullable con FK a `auth.users`). Un
 * índice único parcial `(salon_id, user_id)` garantiza que dentro de un salón la respuesta
 * es única, así que basta con la primera coincidencia.
 *
 * Devuelve null cuando no hay sesión, cuando la cuenta no tiene ficha (owner o manager que
 * no atiende), o cuando el vínculo aún no se ha poblado. En todos esos casos la pantalla
 * cae al selector, que sigue siendo el comportamiento correcto para quien ve varias agendas.
 */
export function findMyProfessionalId(
  professionals: ReadonlyArray<{ id: string; userId: string | null }>,
  userId: string | null,
): string | null {
  if (userId === null) return null;
  return professionals.find((p) => p.userId === userId)?.id ?? null;
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/my-professional.test.ts`
Esperado: PASS, 5 tests.

- [ ] **Step 5: Traer `user_id` desde la consulta**

En `src/lib/professionals-queries.ts`, añadir `user_id` a la constante `PROFESSIONALS_SELECT` (la que usa el `.select()` de la línea 60) y mapear el campo a `userId` en el item devuelto. En `src/lib/professionals.ts`, añadir `userId: string | null` a la interfaz `ProfessionalListItem`.

Sin este paso `findMyProfessionalId` recibiría siempre `userId: undefined` y la autoselección nunca ocurriría.

- [ ] **Step 6: Verificar tipos y suite completa**

```bash
npx tsc --noEmit -p tsconfig.json
npm test
```
Esperado: ambos en verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/my-professional.ts src/lib/my-professional.test.ts src/lib/professionals-queries.ts src/lib/professionals.ts
git commit -m "feat(agenda): la app sabe que profesional eres, no hace falta elegirlo"
```

---

## Task 8: Autoselección de la agenda propia

**Files:**
- Modify: `clients/projects/denueveanueve-staff/src/pages/EmployeeCalendar.tsx`
- Test: `clients/projects/denueveanueve-staff/src/pages/EmployeeCalendar.test.tsx`

**Interfaces:**
- Consumes: `findMyProfessionalId` (Task 7); `useAuth()` de `@/lib/auth`, del que se usan `user` (para `user.id`) e `isManager`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `src/pages/EmployeeCalendar.test.tsx` un bloque nuevo, conservando los tests existentes:

```typescript
describe('autoseleccion por vinculo', () => {
  it('un staff con ficha ligada abre su agenda sin tocar el selector', async () => {
    renderCalendar({
      user: { id: 'u3' },
      role: 'staff',
      professionals: [
        { id: 'p1', full_name: 'Ana', user_id: null },
        { id: 'p3', full_name: 'Marta', user_id: 'u3' },
      ],
    });

    expect(await screen.findByText('Marta')).toBeInTheDocument();
    expect(screen.queryByLabelText(/profesional/i)).toBeNull();
  });

  it('un staff sin vinculo conserva el selector', async () => {
    renderCalendar({
      user: { id: 'u9' },
      role: 'staff',
      professionals: [{ id: 'p1', full_name: 'Ana', user_id: null }],
    });

    expect(await screen.findByLabelText(/profesional/i)).toBeInTheDocument();
  });

  it('un owner conserva el selector aunque tenga ficha', async () => {
    renderCalendar({
      user: { id: 'u3' },
      role: 'owner',
      professionals: [{ id: 'p3', full_name: 'Marta', user_id: 'u3' }],
    });

    expect(await screen.findByLabelText(/profesional/i)).toBeInTheDocument();
  });
});
```

> `renderCalendar` es el helper que ya usa este fichero de test. Extiéndelo para aceptar `user`, `role` y el `user_id` de cada profesional si aún no lo hace.

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `npm test -- src/pages/EmployeeCalendar.test.tsx`
Esperado: FAIL — el selector sigue apareciendo para el staff con vínculo.

- [ ] **Step 3: Sustituir la nota de diseño obsoleta**

En la cabecera de `EmployeeCalendar.tsx`, reemplazar el bloque que empieza por `// ⚠️ NOTA DE DISEÑO — vínculo usuario↔profesional PENDIENTE.` por:

```typescript
// Vínculo usuario↔profesional: RESUELTO. `professionals.user_id` (uuid con FK a auth.users)
// identifica qué ficha es cada cuenta, y un índice único parcial (salon_id, user_id)
// garantiza que la respuesta sea única dentro del salón. Un `staff` con vínculo abre
// DIRECTAMENTE su agenda. El selector permanece para `owner` y `manager` —que consultan
// legítimamente las agendas de todo el equipo— y como degradación para un `staff` cuyo
// vínculo aún no se haya poblado.
```

La nota anterior citaba el hallazgo 1 de `docs/HAT3X-031-auditoria-esquema-salon-os.md`, que afirmaba que `user_id` no tenía FK ni estaba poblado. Era cierto en julio; la FK se añadió después.

- [ ] **Step 4: Implementar la autoselección**

En el cuerpo del componente:

```typescript
const { user, isManager } = useAuth();

const myProfessionalId = useMemo(
  () =>
    findMyProfessionalId(
      professionals.map((p) => ({ id: p.id, userId: p.userId })),
      user?.id ?? null,
    ),
  [professionals, user],
);

/** El selector solo se muestra a quien ve varias agendas, o a quien no tiene la suya. */
const showSelector = isManager || myProfessionalId === null;
```

Inicializar el estado del profesional seleccionado con `myProfessionalId` cuando exista, y renderizar el bloque `<Select …>` solo si `showSelector`.

- [ ] **Step 5: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/pages/EmployeeCalendar.test.tsx`
Esperado: PASS, incluidos los tres tests nuevos.

- [ ] **Step 6: Verificar tipos y suite completa**

```bash
npx tsc --noEmit -p tsconfig.json
npm test
```
Esperado: ambos en verde.

- [ ] **Step 7: Commit**

```bash
git add src/pages/EmployeeCalendar.tsx src/pages/EmployeeCalendar.test.tsx
git commit -m "feat(agenda): cada profesional entra y ve la suya"
```

---

## Task 9: Etiquetas reservadas de subdominio — app de cliente

**Files:**
- Modify: `clients/projects/denueveanueve/src/lib/salon.ts`
- Test: `clients/projects/denueveanueve/src/lib/salon.test.ts`
- Modify: `clients/projects/denueveanueve/.env.example`

**Interfaces:**
- Modifica el comportamiento interno de `extractSubdomain`; la firma pública de `resolveSalonSlug` no cambia.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `src/lib/salon.test.ts`:

```typescript
describe('etiquetas reservadas del despliegue', () => {
  it('resuelve el salon bajo el subdominio de plataforma', () => {
    expect(
      resolveSalonSlug({ hostname: 'denueveanueve.clientes.kairosmanager.app' }),
    ).toEqual({ slug: 'denueveanueve', source: 'subdomain' });
  });

  it('el host desnudo de plataforma NO es un salon llamado "clientes"', () => {
    expect(
      resolveSalonSlug({ hostname: 'clientes.kairosmanager.app', envSlug: 'denueveanueve' }),
    ).toEqual({ slug: 'denueveanueve', source: 'env' });
  });

  it('sin fallback, el host desnudo no resuelve nada', () => {
    expect(resolveSalonSlug({ hostname: 'clientes.kairosmanager.app' })).toEqual({
      slug: null,
      source: 'none',
    });
  });

  it('"equipo" tambien esta reservada', () => {
    expect(resolveSalonSlug({ hostname: 'equipo.kairosmanager.app' })).toEqual({
      slug: null,
      source: 'none',
    });
  });

  it('un salon que se llamara "clientes" seguiria resolviendo con ?salon=', () => {
    expect(
      resolveSalonSlug({ hostname: 'clientes.kairosmanager.app', search: '?salon=clientes' }),
    ).toEqual({ slug: 'clientes', source: 'query' });
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

CWD: `clients/projects/denueveanueve/`

Run: `npm test -- src/lib/salon.test.ts`
Esperado: FAIL — el segundo test devuelve `{ slug: 'clientes', source: 'subdomain' }`.

- [ ] **Step 3: Escribir la implementación mínima**

En `src/lib/salon.ts`, justo antes de `extractSubdomain`:

```typescript
/**
 * Etiquetas que pertenecen al DESPLIEGUE, no a ningún salón.
 *
 * Las apps viven bajo `*.clientes.kairosmanager.app` y `*.equipo.kairosmanager.app`. Con un
 * apex de dos etiquetas, `clientes.kairosmanager.app` tiene tres y la heurística lo leería
 * como "el salón `clientes`", mostrando un error de salón inexistente en la puerta de
 * entrada del despliegue. Estas etiquetas se descartan y la resolución cae al orden normal
 * (?salon= y luego el fallback de entorno).
 *
 * Un salón cuyo slug fuera literalmente uno de estos nombres seguiría siendo alcanzable por
 * `?salon=`; es un precio aceptable y consciente por tres nombres.
 */
const RESERVED_LABELS: ReadonlySet<string> = new Set(['clientes', 'equipo', 'www']);
```

Y dentro de `extractSubdomain`, sustituir el tramo que ignora `www` y evalúa el candidato por:

```typescript
  // Ignora un `www` inicial y reevalúa: `www.denueveanueve.clientes.kairosmanager.app`
  // → denueveanueve; `www.kairosmanager.app` → apex.
  const labels = allLabels[0] === 'www' ? allLabels.slice(1) : allLabels;

  // Apex desnudo (≤ 2 etiquetas) → sin subdominio.
  if (labels.length <= 2) return null;

  const candidate = labels[0];
  if (RESERVED_LABELS.has(candidate)) return null;
  return isValidSlug(candidate) ? candidate : null;
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/salon.test.ts`
Esperado: PASS, incluidos los cinco nuevos.

- [ ] **Step 5: Apuntar la API al panel real**

En `.env.example`, cambiar `VITE_SALON_OS_API_URL="https://app.salonos.app"` por `VITE_SALON_OS_API_URL="https://kairosmanager.app"`, con un comentario de una línea indicando que es el host del panel Kairos del que cuelga `/api/public/booking/{slug}`.

El `.env` local no está versionado; su valor se ajusta en el runbook (Task 11).

- [ ] **Step 6: Verificar tipos y suite completa**

```bash
npx tsc --noEmit -p tsconfig.json
npm test
```
Esperado: ambos en verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/salon.ts src/lib/salon.test.ts .env.example
git commit -m "fix(subdominio): el host del despliegue no es un salon"
```

---

## Task 10: Etiquetas reservadas de subdominio — app de staff

**Files:**
- Modify: `clients/projects/denueveanueve-staff/src/lib/salon.ts`
- Test: `clients/projects/denueveanueve-staff/src/lib/salon.test.ts`

**Interfaces:** el mismo cambio interno que la Task 9, en el otro repositorio. `resolveSalonSlug` no cambia de firma.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `src/lib/salon.test.ts`:

```typescript
describe('etiquetas reservadas del despliegue', () => {
  it('resuelve el salon bajo el subdominio de equipo', () => {
    expect(
      resolveSalonSlug({ hostname: 'denueveanueve.equipo.kairosmanager.app' }),
    ).toEqual({ slug: 'denueveanueve', source: 'subdomain' });
  });

  it('el host desnudo de equipo NO es un salon llamado "equipo"', () => {
    expect(
      resolveSalonSlug({ hostname: 'equipo.kairosmanager.app', envSlug: 'denueveanueve' }),
    ).toEqual({ slug: 'denueveanueve', source: 'env' });
  });

  it('sin fallback, el host desnudo no resuelve nada', () => {
    expect(resolveSalonSlug({ hostname: 'equipo.kairosmanager.app' })).toEqual({
      slug: null,
      source: 'none',
    });
  });

  it('"clientes" tambien esta reservada', () => {
    expect(resolveSalonSlug({ hostname: 'clientes.kairosmanager.app' })).toEqual({
      slug: null,
      source: 'none',
    });
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

CWD: `clients/projects/denueveanueve-staff/`

Run: `npm test -- src/lib/salon.test.ts`
Esperado: FAIL — el segundo test devuelve `{ slug: 'equipo', source: 'subdomain' }`.

- [ ] **Step 3: Escribir la implementación mínima**

En `src/lib/salon.ts`, justo antes de `extractSubdomain`:

```typescript
/**
 * Etiquetas que pertenecen al DESPLIEGUE, no a ningún salón.
 *
 * Las apps viven bajo `*.clientes.kairosmanager.app` y `*.equipo.kairosmanager.app`. Con un
 * apex de dos etiquetas, `equipo.kairosmanager.app` tiene tres y la heurística lo leería
 * como "el salón `equipo`", mostrando un error de salón inexistente en la puerta de entrada
 * del despliegue. Estas etiquetas se descartan y la resolución cae al orden normal
 * (?salon= y luego el fallback de entorno).
 *
 * Un salón cuyo slug fuera literalmente uno de estos nombres seguiría siendo alcanzable por
 * `?salon=`; es un precio aceptable y consciente por tres nombres.
 */
const RESERVED_LABELS: ReadonlySet<string> = new Set(['clientes', 'equipo', 'www']);
```

Y dentro de `extractSubdomain`, sustituir el tramo que ignora `www` y evalúa el candidato por:

```typescript
  // Ignora un `www` inicial y reevalúa: `www.denueveanueve.equipo.kairosmanager.app`
  // → denueveanueve; `www.kairosmanager.app` → apex.
  const labels = allLabels[0] === 'www' ? allLabels.slice(1) : allLabels;

  // Apex desnudo (≤ 2 etiquetas) → sin subdominio.
  if (labels.length <= 2) return null;

  const candidate = labels[0];
  if (RESERVED_LABELS.has(candidate)) return null;
  return isValidSlug(candidate) ? candidate : null;
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `npm test -- src/lib/salon.test.ts`
Esperado: PASS, incluidos los cuatro nuevos.

- [ ] **Step 5: Verificar tipos y suite completa**

```bash
npx tsc --noEmit -p tsconfig.json
npm test
```
Esperado: ambos en verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/salon.ts src/lib/salon.test.ts
git commit -m "fix(subdominio): el host del despliegue no es un salon"
```

---

## Task 11: Runbook de despliegue y activación de SMS

**Files:**
- Create: `docs/superpowers/plans/2026-09-05-denueveanueve-runbook-despliegue.md` (repo raíz `g:\HAT3X\CLAUDE\HAT3X`)

**Interfaces:** ninguna. Documento operativo.

Estos pasos **no se automatizan** en este plan: tocan DNS, la consola de Vercel y la de Supabase, requieren credenciales de la cuenta y son irreversibles con un clic. El agente escribe el runbook; los ejecuta una persona.

- [ ] **Step 1: Escribir el runbook**

El documento debe cubrir, en este orden y con detalle suficiente para seguirlo sin conocer el proyecto:

1. **Vercel — app de cliente.** Renombrar el proyecto `denueveanueve_app` (id `prj_7rMONhpjDpIIrAOfvutexEKUEl82`, org `team_cAwFiqStYO0d7Mq46aaxI5NZ`) a `kairos-clientes`. Añadir el dominio comodín `*.clientes.kairosmanager.app`. Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SALON_SLUG=denueveanueve` y `VITE_SALON_OS_API_URL=https://kairosmanager.app`.
2. **Vercel — app de staff.** Proyecto nuevo `kairos-equipo` desde `clients/projects/denueveanueve-staff/`. Dominio comodín `*.equipo.kairosmanager.app`. Las mismas variables de Supabase más `VITE_SALON_SLUG=denueveanueve`.
3. **DNS.** Dos registros comodín en `kairosmanager.app` apuntando a Vercel: `*.clientes` y `*.equipo`. Dejar anotado que un comodín de un solo nivel **no** cubre `a.b.clientes`, y que no hace falta que lo cubra.
4. **Supabase Auth — proveedor de teléfono.** Activarlo en el proyecto `jztoyekixcziaicrnlce` con las credenciales de Twilio que ya usa Kairos para recordatorios (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` en `clients/projects/salon-os/.env.local`). Dejar escrito que cada registro de cliente consume un SMS de pago y que conviene revisar el límite de envíos del proyecto antes de abrir la app al público.
5. **Verificación manual de extremo a extremo**, con casillas propias:
   - Abrir `denueveanueve.clientes.kairosmanager.app` y comprobar que carga con la marca del salón.
   - Registrar un cliente real con un teléfono real y recibir el SMS.
   - Reservar una cita desde la app y verla aparecer en el panel Kairos.
   - Dar acceso a una profesional desde `ajustes/personal`, que reciba la invitación y entre en `denueveanueve.equipo.kairosmanager.app`.
   - Comprobar que abre **su** agenda sin selector.
   - Escanear el QR del cliente registrado y ver la visita acreditada en fidelización.
6. **Reversión.** Qué deshacer si algo falla: quitar el dominio del proyecto Vercel devuelve la app al dominio anterior sin perder datos; desactivar el proveedor de teléfono bloquea registros nuevos pero no expulsa a nadie.

- [ ] **Step 2: Commit**

CWD: repo raíz

```bash
git add docs/superpowers/plans/2026-09-05-denueveanueve-runbook-despliegue.md
git commit -m "docs(denueveanueve): el runbook de lo que no automatiza el plan"
```

---

## Task 12: Cerrar la documentación obsoleta

**Files:**
- Delete: `clients/projects/denueveanueve/docs/PENDIENTE-mis-citas-rls.md`
- Modify: `clients/projects/denueveanueve/README.md`
- Modify: `clients/projects/denueveanueve-staff/README.md`

**Interfaces:** ninguna. Documentación.

- [ ] **Step 1: Confirmar en la base que el pendiente está resuelto**

CWD: `clients/projects/salon-os/`

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')
curl -s -X POST "https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
  -d '{"query":"select policyname from pg_policies where schemaname = '"'"'public'"'"' and tablename = '"'"'appointments'"'"' and policyname = '"'"'self_select_own_appointments'"'"'"}'
```

Esperado: una fila. Si viniera vacío, **no borres el documento**: el pendiente seguiría vivo y habría que replantearlo.

- [ ] **Step 2: Borrar el documento y actualizar el README de la app de cliente**

Eliminar `clients/projects/denueveanueve/docs/PENDIENTE-mis-citas-rls.md`. En el `README.md` de esa app, la fila de la tabla «Estado por pantalla» correspondiente a **Mis citas** pierde la coletilla *«depende de una política RLS/RPC self en el servidor»* y el enlace a la limitación pendiente; queda como operativa, sin salvedad.

- [ ] **Step 3: Actualizar el README de la app de staff**

Documentar en su `README.md` que el profesional propio se resuelve por `professionals.user_id` y que el selector queda para `owner` y `manager`, sustituyendo cualquier mención a que el vínculo esté pendiente.

- [ ] **Step 4: Commit (dos repos)**

```bash
# CWD: clients/projects/denueveanueve/
git add -A docs README.md
git commit -m "docs: mis citas ya no depende de nada, la politica esta puesta"

# CWD: clients/projects/denueveanueve-staff/
git add README.md
git commit -m "docs(agenda): documentar que cada profesional ve la suya"
```

---

## Verificación final

- [ ] `npx tsc --noEmit -p tsconfig.json` en los tres repos: exit 0.
- [ ] `npx vitest run` en Kairos y `npm test` en las dos PWAs: todo verde.
- [ ] El runbook (Task 11) ejecutado por una persona, con sus seis casillas de verificación manual marcadas.
- [ ] `git status` limpio en los tres repos.
