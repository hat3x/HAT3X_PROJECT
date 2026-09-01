# Task 9 Report — Coming-soon shell + settings-nav terminology

**Status:** DONE
**Commit:** a073b38dce41d361404c45c4b87671ebebacdb20 (branch `hat3x/HAT3X-035`, repo `clients/projects/salon-os`)

## Summary

Implemented all 3 steps from `task-9-brief.md`:

1. **`src/components/coming-soon.tsx`** (new) — `ComingSoon`, a zero-prop presentational
   component. Renders a centered `Card`/`CardContent` (from `@/components/ui/card`) with a
   `Sparkles` icon chip, title "Próximamente" and subtitle "Este módulo aún no está disponible
   para tu sector." Styling follows the app's existing empty-state conventions (compared against
   `FeatureGateNotice` and `FacturacionEmpty`): `animate-fade-up`, `border-dashed`, rounded icon
   chip with `bg-accent text-primary`.

2. **`src/app/(dashboard)/proximamente/page.tsx`** (new) — server component, `export const
   metadata = { title: "Próximamente" }`, wraps `<ComingSoon/>` in `<main className="container
   flex min-h-[60vh] items-center justify-center py-10">` (top-level dashboard routes need their
   own `container`/padding — the shared `(dashboard)/layout.tsx` only wraps children in a bare
   `flex-1` div, confirmed by reading it and `dashboard/page.tsx`).

3. **`src/app/(dashboard)/ajustes/ajustes-nav.tsx`** (modified) — added
   `import { useTerms } from "@/components/providers/sector-provider";`. Inside `AjustesNav()`,
   added `const terms = useTerms();` and a derived `items` array (`NAV_ITEMS.map(...)`) that
   swaps the label for `/ajustes/servicios` → `terms.servicePlural` and `/ajustes/personal` →
   `terms.professionalPlural`, leaving every other `NAV_ITEMS` entry and the module-level const
   itself untouched (the hook can't run at module scope, so the mapping happens per-render in the
   component body, matching the instruction). The render loop now iterates `items` instead of
   `NAV_ITEMS`.

Only these 3 files were touched — confirmed via `git status --porcelain` before staging.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0, no output.
- `npx vitest run` → **85 test files passed (85), 1251 tests passed (1251)**, 0 failed. No new
  test files were added (brief scoped this task to exactly 3 files); existing suite stayed green,
  including `src/tests/unit/sector-provider.test.tsx` which already exercised `useTerms()`.

## Commit

```
git add clients/projects/salon-os/src/components/coming-soon.tsx \
        clients/projects/salon-os/src/app/\(dashboard\)/proximamente/ \
        clients/projects/salon-os/src/app/\(dashboard\)/ajustes/ajustes-nav.tsx
git commit -m "feat(salon-os): coming-soon shell + sector terminology in settings nav"
```

Run from inside the nested repo (`clients/projects/salon-os`), so paths were relative to that
root: `src/components/coming-soon.tsx`, `src/app/(dashboard)/proximamente/`,
`src/app/(dashboard)/ajustes/ajustes-nav.tsx` — same file set, same message. Commit:
`a073b38dce41d361404c45c4b87671ebebacdb20`. Working tree clean after commit
(`git status --porcelain` empty). No branch was created or switched; stayed on
`hat3x/HAT3X-035` throughout.

## Notes / friction encountered

- A local "Fact-Forcing Gate" hook intercepted every `Write`/`Edit` call in this repo and required
  presenting (1) callers of the file, (2) confirmation no duplicate exists, (3) data-file
  structure if applicable, (4) the verbatim instruction — before the operation was allowed to
  proceed. This added a few extra round-trips (in particular the `proximamente/page.tsx` write
  needed a second, more explicit attempt citing a concrete file:line precedent for "what calls a
  Next.js `page.tsx`") but did not require any deviation from the brief's file list or content.
- No `<ComingSoon/>` consumer yet reroutes real nav links to `/proximamente` — the brief scoped
  this task to the shell + route + nav relabel only, no wiring of other pages to the placeholder.

## Concerns

None. `/proximamente` is currently reachable but not yet linked from anywhere in the app (out of
scope per brief). `ComingSoon` has no props, matching "pure presentational" requirement exactly.
