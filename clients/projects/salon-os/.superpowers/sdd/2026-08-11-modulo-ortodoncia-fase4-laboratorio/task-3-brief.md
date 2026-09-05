### Task 3: Migración `lab_order` + tipo en database.ts

**Files:**
- Create: `supabase/migrations/20260811140000_lab_order.sql`
- Modify: `src/types/database.ts` (tabla `lab_order` + alias `LabOrder`)

**Interfaces:**
- Produces: tabla `public.lab_order`; enum `lab_order_kind`; tipo `LabOrder = Tables<"lab_order">`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260811140000_lab_order.sql
-- Pedidos a laboratorio de ortodoncia (Fase 4). Estado derivado de las fechas en la app.
--
-- APLICACIÓN VÍA MANAGEMENT API (la aplica el usuario en el SQL editor):
--   POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/migrations
--   Content-Type: application/sql
--   Body: <contenido de este archivo>

begin;

create type public.lab_order_kind as enum ('modelo', 'retenedor', 'alineadores', 'ortopedia', 'otro');

create table public.lab_order (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons(id) on delete cascade,
  customer_id  uuid not null,
  kind         public.lab_order_kind not null,
  lab_name     text,
  sent_at      date not null,
  received_at  date,
  delivered_at date,
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint lab_order_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade
);

create index lab_order_customer_idx on public.lab_order (salon_id, customer_id, sent_at desc);

alter table public.lab_order enable row level security;

create policy lab_order_rw on public.lab_order
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
```

> **Nota:** confirmar contra una migración dental existente (p. ej. `20260811130000_ortho_payments.sql`) que el nombre de la tabla de salones es `public.salons`, que la referencia `salons(id)` y el patrón RLS `app.user_salon_ids()` coinciden con lo ya usado; ajustar si el proyecto usa otro nombre. Reutilizar exactamente el mismo patrón que la migración de Fase 2.

- [ ] **Step 2: Aplicar la migración (usuario) y verificar** — el usuario aplica el SQL; verificar por REST:
```
GET https://jztoyekixcziaicrnlce.supabase.co/rest/v1/lab_order?select=id&limit=1
  apikey: <anon>  Authorization: Bearer <anon>
```
Expected: `200 []`.

- [ ] **Step 3: Tipo en `database.ts`** — dentro de `Database["public"]["Tables"]`, junto a las dentales, añadir el bloque `lab_order` (Row/Insert/Update/Relationships) siguiendo el molde de `ortho_visit`: columnas del `create table` (`sent_at` `string`; `received_at`/`delivered_at`/`lab_name`/`notes`/`created_by` → `string | null`; `created_at`/`updated_at` → `string`; `kind` → union `"modelo" | "retenedor" | "alineadores" | "ortopedia" | "otro"`; defaults/nullables → opcionales en Insert). Y el alias junto a los demás:
```ts
export type LabOrder = Tables<"lab_order">;
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811140000_lab_order.sql src/types/database.ts
git commit -m "feat(ortodoncia): tabla lab_order + tipo (RLS por tenant)"
```

---

