# Task 1 Report — `salon_sector` enum + `salons.sector` column

## Status: DONE_WITH_CONCERNS

All deliverables from `.superpowers/sdd/task-1-brief.md` are complete and verified. One material discrepancy
was found and resolved safely (see "Repo topology discrepancy" below) — this is why the status is
`DONE_WITH_CONCERNS` rather than `DONE`.

## Files changed

- **Created**: `clients/projects/salon-os/supabase/migrations/20260731100000_salon_sector.sql`
- **Modified**: `clients/projects/salon-os/src/types/database.ts`
  (5 additions only: `SalonSector` exported union, `sector` in `salons` Row/Insert/Update, `salon_sector` in `Enums`)

Both files committed in **`clients/projects/salon-os`'s own nested git repository**
(see topology note below), commit `85a5ffa8eea1698017ff87d1d98b05a5625a9fc1`, branch `hat3x/HAT3X-035`.

## Step 1 — Migration file

Created verbatim as specified in the brief:

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

## Step 2 — Applied via Supabase Management API

Command run exactly as given in the brief (Git Bash, from repo root, with browser User-Agent header):

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

**Output:**
```
(201, [])
(201, [{'sector': 'peluqueria', 'count': 2}])
```

First call (apply migration): `201, []` — success, no error rows.
Second call (verification query): `201, [{'sector': 'peluqueria', 'count': 2}]` — both existing salons now have
`sector = 'peluqueria'` (the default), confirming the `NOT NULL DEFAULT 'peluqueria'` backfill worked correctly
and no data was lost or nulled.

## Step 3 — TypeScript mirror in `src/types/database.ts`

Located `export type SalonFeature = ...` (line 77) and added directly after it:

```ts
/**
 * Sector del tenant. Espejo TS del enum `public.salon_sector` (migración
 * 20260731100000_salon_sector). Lo fija HAT3X al alta; determina
 * nav/terminologia/modulos. Default `peluqueria` (back-compat).
 */
export type SalonSector = "peluqueria" | "odontologia" | "restauracion";
```

Located the `salons` table block (`Row`/`Insert`/`Update`, originally lines 88–137) and added:
- `sector: SalonSector;` to `Row`
- `sector?: SalonSector;` to `Insert`
- `sector?: SalonSector;` to `Update`

Located the `Enums:` block (line 1944) and added:
- `salon_sector: SalonSector;` (after `salon_feature: SalonFeature;`)

Total diff: 5 hunks, 11 insertions, 0 deletions, 0 unrelated lines touched.

## Step 4 — Typecheck

```bash
cd clients/projects/salon-os && npx tsc --noEmit -p tsconfig.json
```

**Result: exit code 0.** No errors.

## Step 5 — Commit

### Repo topology discrepancy (the "concern")

The task briefing stated the repo working dir is `c:/Users/josem/Desktop/HAT3X/CLAUDE/HAT3X`, already on branch
`feature/salon-os-multi-sector`, and gave a commit command to run from that repo root with paths prefixed
`clients/projects/salon-os/...`. This is accurate for the **outer HAT3X monorepo** — confirmed
`git branch --show-current` at the outer root returns `feature/salon-os-multi-sector`.

However, `clients/projects/salon-os` is **its own nested git repository** (has its own `.git/`), currently
checked out on branch `hat3x/HAT3X-035` with 16 other `hat3x/HAT3X-0NN` ticket branches and no configured
remote. The outer HAT3X repo has **zero files tracked** under `clients/projects/salon-os/` (`git status`
shows the whole directory as `?? clients/projects/salon-os/`, untracked/embedded).

I verified this is a real git boundary, not a false alarm:
- `git add <file-inside-salon-os>` from the outer repo root exits 0 but silently stages **nothing**
  (confirmed via `git ls-files -s` showing no entry — even with `-f`).
- `git add clients/projects/salon-os/` (the directory) triggers git's "adding embedded git repository"
  warning and stages it as an opaque **gitlink** (a commit-SHA pointer, not file contents) — which would be
  actively wrong to commit, especially since the nested repo has no remote (an unreachable gitlink). I staged
  this by accident while testing, confirmed it via `git status` showing `Am clients/projects/salon-os`, and
  immediately reverted it with `git rm --cached -f clients/projects/salon-os` (index-only, working tree
  files were untouched and verified still present on disk afterward). Confirmed outer repo is clean again
  (`?? clients/projects/salon-os/`, nothing staged) — see final verification below.

I found a precedent that initially looked contradictory: `clients/projects/denueveanueve` is *also* a
nested-git directory but has 179 files tracked by the outer repo. Testing showed this is **not** reproducible
for new files — it must be residual from files committed to the outer repo before its nested `.git` existed
at that path. New files cannot be added to the outer repo the same way; the embedded-repo boundary blocks it.

**Decision**: Since (a) the outer repo cannot technically track these files without either an invalid gitlink
or registering a proper `git submodule` (which needs a remote URL — none exists), and (b) I was told not to
create or switch branches, I committed inside the nested `salon-os` repo itself, on its branch that was
**already checked out before I touched anything** (`hat3x/HAT3X-035`) — satisfying the letter and spirit of
"don't create/switch branches" for the repository that actually holds this code's version history.

### Extra care taken: unrelated pre-existing WIP in the same file

Before staging, `src/types/database.ts` already had substantial **unrelated, pre-existing uncommitted
changes** in the working tree (an in-progress verifactu/invoice-hash removal — modified/deleted files under
`src/lib/invoicing/`, `src/app/(dashboard)/facturacion/`, etc., none of it mine, none of it part of Task 1).
A plain `git add src/types/database.ts` would have swept that unrelated WIP's `pos_invoices` type changes
into my commit, violating "touch only the two files in the brief."

To avoid this, I:
1. Staged the whole file once, inspected `git diff --cached`, and identified 3 unrelated hunks
   (`pos_invoices` hash/chain fields) mixed in with my 5 sector-related hunks.
2. `git reset -- src/types/database.ts` to unstage (working tree untouched).
3. Built a minimal patch (`sector-only.patch`, scratchpad dir) containing only my 5 hunks, copied verbatim
   from the real diff.
4. `git apply --cached sector-only.patch` — staged only my hunks into the index.
5. Verified `git diff --cached -- src/types/database.ts` showed exactly my 5 hunks and nothing else.

The unrelated verifactu-removal WIP remains **uncommitted and untouched** in the working tree, exactly as it
was found — safe for whoever owns that work to commit separately later.

### Commit

```bash
cd clients/projects/salon-os
git add supabase/migrations/20260731100000_salon_sector.sql   # new file, no risk of unrelated content
git apply --cached sector-only.patch                           # curated hunks for database.ts (see above)
git commit -m "feat(salon-os): add salons.sector (multi-sector base, default peluqueria)"
```

**Output:**
```
[hat3x/HAT3X-035 85a5ffa] feat(salon-os): add salons.sector (multi-sector base, default peluqueria)
 2 files changed, 27 insertions(+)
 create mode 100644 supabase/migrations/20260731100000_salon_sector.sql
```

**Commit hash**: `85a5ffa8eea1698017ff87d1d98b05a5625a9fc1`
**Repo**: `clients/projects/salon-os` (nested repo)
**Branch**: `hat3x/HAT3X-035` (already checked out, not created/switched)

### Final verification

```
$ git show --stat HEAD
commit 85a5ffa8eea1698017ff87d1d98b05a5625a9fc1
    feat(salon-os): add salons.sector (multi-sector base, default peluqueria)
 src/types/database.ts                               | 11 +++++++++++
 supabase/migrations/20260731100000_salon_sector.sql | 16 ++++++++++++++++
 2 files changed, 27 insertions(+)

$ git branch --show-current   # (in clients/projects/salon-os)
hat3x/HAT3X-035

$ git status --short          # (in clients/projects/salon-os) — unrelated WIP intact, untouched
 M scripts/seed-demo-salon.ts
 M src/app/(dashboard)/ajustes/marca/salon-marca-form.tsx
 ... (pre-existing verifactu-removal WIP, unchanged from before this task)

$ git status --short -- clients/projects/salon-os   # (outer HAT3X repo root)
?? clients/projects/salon-os/
```

Outer repo is clean (no gitlink residue from the earlier accidental stage/revert).

## Self-review

- [x] Migration matches brief verbatim.
- [x] Migration applied successfully (`201, []`); DB verification confirms all existing salons
      (`count: 2`) backfilled to `sector = 'peluqueria'`.
- [x] TS types updated per brief: `SalonSector` exported union, `sector` on Row (required) /
      Insert+Update (optional), `salon_sector` in `Enums`.
- [x] `tsc --noEmit` exits 0.
- [x] Only the two brief-specified files touched — verified the committed diff contains exactly those
      two files and no unrelated content, despite `database.ts` having pre-existing unrelated dirty state.
- [x] Commit message matches brief's Step 5 exactly.
- [ ] **Concern**: commit landed in the nested `salon-os` repo on branch `hat3x/HAT3X-035`, not in the
      outer HAT3X repo's `feature/salon-os-multi-sector` branch as the task description assumed — because
      the latter is technically impossible (embedded-repo boundary blocks tracking new files there; see
      topology discrepancy above). **This will recur identically for every subsequent task in this plan**
      that touches `clients/projects/salon-os` files, since the same boundary applies to all of them.
      Recommend the orchestrator decide, before Task 2, one of:
      (a) create `feature/salon-os-multi-sector` as a branch *inside* the nested `salon-os` repo (based on
          `hat3x/HAT3X-035` or `master`) and have subsequent tasks target that;
      (b) formally register `clients/projects/salon-os` as a proper `git submodule` of the outer repo (needs
          a remote URL — none currently configured for the nested repo); or
      (c) accept that this plan's work simply lives in the nested repo's own ticket-branch workflow, and the
          outer repo's `feature/salon-os-multi-sector` branch is not the actual delivery vehicle.
