# Task 8 — Layout + página server `/ortodoncia` (con stub de vista) — Report

## Files changed (created)

- `src/components/dental/ortodoncia-view.tsx` — client stub, exports `OrtodonciaView({ salonId, customerId })`, returns `null`.
- `src/app/(dashboard)/ortodoncia/layout.tsx` — wraps children in `<SectorGate required="odontologia">`.
- `src/app/(dashboard)/ortodoncia/page.tsx` — server component: resolves `getActiveSalonId()` + `searchParams.paciente` in parallel, renders no-salon `Card`, else `PatientSelector` (hrefBase `/ortodoncia`, purposeLabel "ver su ortodoncia") when no patient, else `OrtodonciaView`.

All three files were written **verbatim** from the brief (`.superpowers/sdd/2026-08-11-modulo-ortodoncia-fase1/task-8-brief.md`, Steps 1–3).

## Verification against real existing code (before writing)

Read `src/app/(dashboard)/odontograma/layout.tsx`, `src/app/(dashboard)/odontograma/page.tsx`, `src/app/(dashboard)/periodontograma/layout.tsx`, `src/app/(dashboard)/periodontograma/page.tsx`, `src/components/dental/patient-selector.tsx`, `src/components/guards/sector-gate.tsx`, and confirmed `getActiveSalonId` export in `src/lib/salon.ts`.

Confirmed:
- `SectorGate` — named export from `@/components/guards/sector-gate`, async function component, prop `required: SalonSector`. Matches brief exactly.
- `getActiveSalonId` — named export from `@/lib/salon`, `Promise<string | null>`. Matches brief.
- `PatientSelector` — named export from `@/components/dental/patient-selector`, accepts `salonId: string`, `hrefBase?: string`, `purposeLabel?: string`. Matches brief's usage exactly (this is a generalized component already built to support exactly this multi-view pattern — `/odontograma` uses the defaults, `/periodontograma` and now `/ortodoncia` pass `hrefBase`/`purposeLabel`).
- `Card`/`CardContent` from `@/components/ui/card` — already used identically elsewhere in the dashboard.

## Deviations from the brief

**None.** No import path, prop name, or prop shape differed from what the brief specified, so no adjustment was needed. One thing worth flagging for the reviewer (not a deviation, just a note): the brief's `page.tsx` uses a simpler header (`container max-w-4xl`, plain `h1`/`p`, no icon, no "Cambiar paciente" back-link) than the richer pattern used in `/odontograma` and `/periodontograma` (icon badge header + back-link, and a no-salon `Card` with an `Info` icon). I followed the brief's explicit verbatim code as instructed rather than copying the richer header/no-salon pattern, since the task instructions scoped the "match real existing code" check to import paths/prop shapes only, and the brief said "Create three files verbatim from the brief." Task 9 (which replaces the stub) may want to reconcile this visual inconsistency, but that's out of scope here.

## tsc result

`npx tsc --noEmit` → **0 errors** (no output).

## Self-review

- Stub component: `"use client"` present, exports `OrtodonciaView`, props typed `{ salonId: string; customerId: string }`, returns `React.ReactElement | null` (always `null` for now) — matches brief.
- Layout: default export `OrtodonciaLayout`, wraps `children` with `SectorGate required="odontologia"` — matches brief and mirrors `/odontograma` and `/periodontograma` layouts exactly (same gate, same sector).
- Page: `searchParams` typed as `Promise<{ paciente?: string }>` (Next.js 14 async searchParams pattern used identically in odontograma/periodontograma), `Promise.all` resolves salon id + params concurrently, `metadata.title = "Ortodoncia"`, three-way branch (no-salon / no-patient / has-patient) matches brief and sibling routes' branching logic (only the no-salon card copy/icon and header markup differ, per brief).
- `git status --short` after commit confirms only the 3 intended files were staged/committed (`A` status); all pre-existing unrelated modified/untracked files (horarios, appointments, etc. — unrelated in-progress work on this branch) were left untouched.
- Commit message matches brief's Step 5 exactly: `feat(ortodoncia): ruta /ortodoncia (layout + page + stub vista)`.

## Concerns

- None blocking. Sole note is the header/back-link inconsistency mentioned above (brief's page.tsx intentionally simpler than sibling routes) — flagging for whoever does Task 9 in case they want visual parity with `/odontograma` and `/periodontograma`.

## Commit

`8a554b5` — `feat(ortodoncia): ruta /ortodoncia (layout + page + stub vista)`
3 files changed, 63 insertions(+): `src/app/(dashboard)/ortodoncia/layout.tsx`, `src/app/(dashboard)/ortodoncia/page.tsx`, `src/components/dental/ortodoncia-view.tsx`.
