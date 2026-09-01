# Task 8 Report — Pre-login sector picker + login enforcement

## Status
DONE — all steps of the brief completed, typecheck clean, full suite green, manual smoke passed, committed on branch `hat3x/HAT3X-035`.

## Commit
`12cfe7c4f76026ed733d2f15b5f6b5af7afebf90`
```
feat(salon-os): pre-login sector picker + tenant-sector guard on login

 src/app/(auth)/login/actions.ts        | 13 ++++++
 src/app/(auth)/login/login-form.tsx    | 38 ++++++++++++++++--
 src/app/(auth)/login/page.tsx          | 28 ++++++++++---
 src/app/(auth)/login/sector-picker.tsx | 73 ++++++++++++++++++++++++++++++++++
 4 files changed, 143 insertions(+), 9 deletions(-)
```
Only the four files named in the brief were touched (2 created, 2 modified). Confirmed via `git status --porcelain` before staging.

## What was built

### 1. `src/app/(auth)/login/actions.ts` (new)
`"use server"` module exporting `resolveTenantSector(): Promise<SalonSector | null>`, a thin wrapper around the existing `getActiveSalonSector()` (`@/lib/salon`). Matches the brief verbatim.

### 2. `src/app/(auth)/login/sector-picker.tsx` (new)
Server component. Maps `SECTOR_ORDER` to cards using `SECTOR_REGISTRY[s]` (label + brandName), each wrapped in `<a href="/login?sector=<x>">`. Icon per sector via an exported `SECTOR_ICON: Record<SalonSector, LucideIcon>` map:
- `peluqueria` → `Scissors`
- `odontologia` → `Stethoscope`
- `restauracion` → `UtensilsCrossed`

`SECTOR_ICON` is exported (not just internal) so `login-form.tsx` can reuse the same icon set for the themed header rather than duplicating the mapping — the only cross-file coupling beyond what the brief specified, still within the four allowed files.

Visual language matches the existing `login-form.tsx` (same `animate-fade-up` column, `Card` primitives, HAT3X footer signature) so the picker → form transition feels like one flow.

### 3. `src/app/(auth)/login/page.tsx` (modified)
Now reads `searchParams?.sector` (`Record<string, string | string[] | undefined>`, normalizing the Next.js array-or-string shape by taking `[0]` when it's an array), runs it through `parseSectorParam`, and branches:
- `null` → `<SectorPicker />`
- valid `SalonSector` → existing `<Suspense><LoginForm sector={sector} /></Suspense>`

The decorative background wrapper and `<Suspense>` boundary are unchanged/preserved.

### 4. `src/app/(auth)/login/login-form.tsx` (modified)
- Added required prop `sector: SalonSector`.
- Header now themes from `SECTOR_REGISTRY[sector]`: `brandName` replaces the hardcoded "Salon OS" wordmark, and `SECTOR_ICON[sector]` (imported from `./sector-picker`) replaces the hardcoded `Scissors` glyph.
- After a successful `signInWithPassword`, before `router.push`, added the guard exactly as specified in the brief: resolve `tenantSector` via `resolveTenantSector()`, compute `mismatch` via `sectorMismatchMessage(sector, tenantSector)`, and on mismatch sign the user back out, surface the message via the existing `error` state/alert UI, reset `isLoading`, and return early (no navigation). On match (or when `tenantSector` is `null`, e.g. no salon membership yet), flow proceeds unchanged to `router.push(next); router.refresh();`.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0, no output.
- `npx vitest run` → **85 test files passed (85), 1251 tests passed (1251)**. Pre-existing `sector-login-guard.test.ts` (testing `parseSectorParam`/`sectorMismatchMessage` directly) still passes unmodified — those two pure functions were only consumed, not touched.
- Manual smoke (dev server was already live on :3000, not started by me):
  - `GET /login` → `200`, body confirms `<h1>¿Cuál es tu sector?</h1>` with three sector cards (`peluqueria`, `odontologia`, `restauracion`).
  - `GET /login?sector=odontologia` → `200`, body confirms `<title>Iniciar sesión | Salon OS</title>` and brand text `Clínica OS` (i.e. `SECTOR_REGISTRY.odontologia.brandName`) rendered in the themed header.
  - Extra check (not in brief, ran for confidence): `GET /login?sector=garbage` → `200`, falls back to the picker (`parseSectorParam` correctly rejects the invalid value), proving the guard degrades safely rather than crashing.

## Concerns / notes for the next task

- `SECTOR_ICON` is now a shared export living in `sector-picker.tsx` and imported by `login-form.tsx`. This is a deliberate small deviation from a literal reading of "map only in the picker" — the brief's Step 4 explicitly says to theme the header with "brandName + icon," so I mapped the icon per sector instead of leaving a generic glyph. If a future task moves sector config further (e.g. a shared `@/lib/sector/icons` module), this import will need updating — currently it's a same-folder relative import, low risk.
- `restauracion` has `SECTOR_REGISTRY.restauracion.implemented === false` (per the registry), but the picker does not gate/disable that card — Task 8's brief scope was strictly the picker + guard, not sector-availability gating, so `restauracion` is clickable like the other two and will reach the (separately gated, if any) downstream flow. Flagging in case a later task expects unimplemented sectors to show a "Próximamente" state on this picker.
- No ESLint config exists in this project yet (`next lint` prompts to initialize one interactively); I did not run it and did not create a config, since the brief's Step 5 only requires `tsc` + `vitest`. `git status` confirms no stray `.eslintrc*`/`eslint.config*` was created.
