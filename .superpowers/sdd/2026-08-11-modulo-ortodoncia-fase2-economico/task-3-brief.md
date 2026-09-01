### Task 3: Migración (2 tablas + RLS + RPC) + tipos en database.ts

**Files:**
- Create: `supabase/migrations/20260811130000_ortho_payments.sql`
- Modify: `src/types/database.ts` (tablas `ortho_payment_plan` + `ortho_installment`, alias, y la función `create_ortho_payment_plan` en la sección `Functions`)

**Interfaces:**
- Produces: tablas + enums + RPC; tipos `OrthoPaymentPlan = Tables<"ortho_payment_plan">`, `OrthoInstallment = Tables<"ortho_installment">`; función RPC tipada.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260811130000_ortho_payments.sql
-- Plan de pago de ortodoncia (Fase 2): presupuesto cerrado a plazos.
--
-- APLICACIÓN VÍA MANAGEMENT API:
--   POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/migrations
--   User-Agent: Mozilla/5.0
--   Authorization: Bearer <token>
--   Content-Type: application/sql
--   Body: <contenido de este archivo>

begin;

create type public.ortho_plan_status as enum ('activo', 'completado', 'cancelado');
create type public.ortho_installment_status as enum ('pendiente', 'pagada');

create table public.ortho_payment_plan (
  id                 uuid primary key default gen_random_uuid(),
  salon_id           uuid not null references public.salons(id) on delete cascade,
  customer_id        uuid not null,
  total_cents        integer not null check (total_cents > 0),
  down_payment_cents integer not null default 0 check (down_payment_cents >= 0),
  installment_count  integer not null check (installment_count >= 1),
  day_of_month       smallint not null check (day_of_month between 1 and 31),
  start_date         date not null,
  currency           char(3) not null default 'EUR',
  status             public.ortho_plan_status not null default 'activo',
  notes              text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (down_payment_cents <= total_cents),
  constraint ortho_payment_plan_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade,
  unique (id, salon_id)
);

-- Solo UN plan activo por paciente.
create unique index ortho_payment_plan_one_active
  on public.ortho_payment_plan (customer_id, salon_id) where status = 'activo';

create table public.ortho_installment (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null,
  plan_id           uuid not null,
  customer_id       uuid not null,
  seq               smallint not null,
  due_date          date not null,
  amount_cents      integer not null check (amount_cents > 0),
  status            public.ortho_installment_status not null default 'pendiente',
  paid_at           timestamptz,
  paid_method       text,
  paid_amount_cents integer,
  created_at        timestamptz not null default now(),
  constraint ortho_installment_plan_fk
    foreign key (plan_id, salon_id)
    references public.ortho_payment_plan (id, salon_id) on delete cascade,
  unique (plan_id, seq)
);

create index ortho_installment_plan_idx on public.ortho_installment (salon_id, plan_id, seq);
create index ortho_installment_overdue_idx
  on public.ortho_installment (salon_id, customer_id, status, due_date);

alter table public.ortho_payment_plan enable row level security;
alter table public.ortho_installment  enable row level security;

create policy ortho_payment_plan_rw on public.ortho_payment_plan
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));
create policy ortho_installment_rw on public.ortho_installment
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

-- Creación atómica del plan + sus cuotas. El calendario se calcula en la app y se
-- pasa como p_installments (array de {seq, dueDate, amountCents}). Gate owner/manager.
create or replace function public.create_ortho_payment_plan(
  p_salon_id           uuid,
  p_customer_id        uuid,
  p_total_cents        integer,
  p_down_payment_cents integer,
  p_installment_count  integer,
  p_day_of_month       integer,
  p_start_date         date,
  p_currency           text,
  p_notes              text,
  p_installments       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_plan_id uuid;
  v_line    jsonb;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  perform 1 from public.salon_members
    where user_id = v_uid and salon_id = p_salon_id and role in ('owner', 'manager');
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform 1 from public.ortho_payment_plan
    where salon_id = p_salon_id and customer_id = p_customer_id and status = 'activo';
  if found then
    raise exception 'PLAN_EXISTS' using errcode = '23505';
  end if;

  insert into public.ortho_payment_plan (
    salon_id, customer_id, total_cents, down_payment_cents, installment_count,
    day_of_month, start_date, currency, status, notes, created_by
  ) values (
    p_salon_id, p_customer_id, p_total_cents, p_down_payment_cents, p_installment_count,
    p_day_of_month, p_start_date, coalesce(p_currency, 'EUR'), 'activo', p_notes, v_uid
  ) returning id into v_plan_id;

  for v_line in select * from jsonb_array_elements(p_installments) loop
    insert into public.ortho_installment (salon_id, plan_id, customer_id, seq, due_date, amount_cents, status)
      values (
        p_salon_id, v_plan_id, p_customer_id,
        (v_line->>'seq')::smallint, (v_line->>'dueDate')::date, (v_line->>'amountCents')::integer,
        'pendiente'
      );
  end loop;

  return v_plan_id;
end;
$$;

revoke all on function public.create_ortho_payment_plan(uuid, uuid, integer, integer, integer, integer, date, text, text, jsonb) from public;
grant execute on function public.create_ortho_payment_plan(uuid, uuid, integer, integer, integer, integer, date, text, text, jsonb) to authenticated;

commit;
```

- [ ] **Step 2: Aplicar la migración (usuario) y verificar**

El usuario aplica el SQL en el editor de Supabase (o el controlador con token). Verificar por REST con la service-role key:
```
GET https://jztoyekixcziaicrnlce.supabase.co/rest/v1/ortho_payment_plan?select=id&limit=1
GET https://jztoyekixcziaicrnlce.supabase.co/rest/v1/ortho_installment?select=id&limit=1
```
Expected: `200 []` en ambas.

- [ ] **Step 3: Tipos en `src/types/database.ts`**

Dentro de `Database["public"]["Tables"]`, junto a las demás dentales, añadir DOS bloques (Row/Insert/Update/Relationships) para `ortho_payment_plan` y `ortho_installment`, siguiendo el molde de `ortho_visit` (mismo estilo). Columnas exactas: las del `create table` de arriba (fechas → `string`, `*_cents`/`installment_count`/`day_of_month`/`seq` → `number`, `status` → los union de enum `"activo"|"completado"|"cancelado"` y `"pendiente"|"pagada"`, nullables → `| null`, defaults → opcionales en Insert con `?`).

En la sección `Database["public"]["Functions"]` añadir:

```ts
      create_ortho_payment_plan: {
        Args: {
          p_salon_id: string;
          p_customer_id: string;
          p_total_cents: number;
          p_down_payment_cents: number;
          p_installment_count: number;
          p_day_of_month: number;
          p_start_date: string;
          p_currency: string;
          p_notes: string | null;
          p_installments: Json;
        };
        Returns: string;
      };
```

Y junto a los alias exportados:

```ts
export type OrthoPaymentPlan = Tables<"ortho_payment_plan">;
export type OrthoInstallment = Tables<"ortho_installment">;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811130000_ortho_payments.sql src/types/database.ts
git commit -m "feat(ortodoncia): tablas plan de pago + RPC atomica + tipos"
```

---

