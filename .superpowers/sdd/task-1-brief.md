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

