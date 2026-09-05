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

