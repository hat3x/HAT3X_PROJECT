# Task 6 Report — Wire sector into the dashboard shell

## Status: DONE

## Commit
`bfc72fc7e26b61f77dc19ec16fb415534709bf87` — `feat(salon-os): plumb sector through the dashboard shell`
Branch: `hat3x/HAT3X-035` (nested repo `clients/projects/salon-os`, no branch created/switched).

## What changed

### `src/app/(dashboard)/layout.tsx`
- Added `import { SectorProvider } from "@/components/providers/sector-provider";`.
- **Deviation from the literal brief (per orchestrator's explicit resolution):** did NOT add `getActiveSalonSector()` to the `Promise.all([...])`. `getActiveSalon()` already resolves `sector` (added in Task 3 — `ActiveSalon.sector: SalonSector`, confirmed in `src/lib/salon.ts` lines 9-15 and 107-121). Added a derived local instead:
  ```ts
  const sector = salon?.sector ?? "peluqueria";
  ```
  This avoids a redundant second DB round-trip through `getActiveSalonSector()` (which itself just calls `getActiveSalon()` internally and unwraps `.sector`).
- Wrapped the existing children (previously the direct child of `<SalonFeaturesProvider>`) with `<SectorProvider sector={sector}> ... </SectorProvider>`, nested inside `SalonFeaturesProvider`, outside the nav/content `div`. Everything else in the layout (imports, `Promise.all` array, `showSettings`, `SalonBrandStyle`, `QueryProvider`) left unchanged.

### `src/components/dashboard-nav.tsx`
- Added `import { useSector } from "@/components/providers/sector-provider";`.
- Added `const sector = useSector();` right after the existing `const hasPos = useHasPos();`.
- Changed `buildDashboardNavItems({ showSettings, hasPos });` to `buildDashboardNavItems({ showSettings, hasPos, sector });`.

No other files touched. `git status --short` in `clients/projects/salon-os` shows a clean tree after commit; only these two files were staged and committed.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0, no output.
- `npx vitest run` → **84 test files passed, 1247 tests passed**, 0 failures. Matches the expected count (brief said "1235 + new"; actual full-suite count is 1247, all green — this already includes the pre-existing `sector-provider.test.tsx` and `dashboard-nav-items-sector.test.ts` suites that this task's wiring makes exercisable end-to-end).
- Manual smoke: a dev server was already running on port 3000. `curl -s -o /dev/null -w "%{http_code}\n" --max-time 45 http://localhost:3000/dashboard` → `307` (redirect, consistent with unauthenticated access to a protected route). No 500/compile error, indicating the layout + nav changes compiled and rendered without throwing.

## Concerns

None. The resolution matches what Task 3 actually shipped (`ActiveSalon.sector` exists and is already fetched by the `Promise.all`), so deriving `sector` locally is strictly more correct than the brief's literal instruction to call `getActiveSalonSector()` separately — that would have issued a second, fully redundant `getActiveSalon()` call (since `getActiveSalonSector()` just wraps it) on every dashboard page load.
