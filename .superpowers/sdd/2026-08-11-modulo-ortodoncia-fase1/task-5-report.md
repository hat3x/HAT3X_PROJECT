# Task 5 Report — Server actions (merge JSONB + visitas)

## Status: DONE

## Files changed
- Created: `src/app/(dashboard)/ortodoncia/actions.ts`
- Created: `src/tests/unit/ortho-actions.test.ts`

Both transcribed verbatim from the task brief
(`.superpowers/sdd/2026-08-11-modulo-ortodoncia-fase1/task-5-brief.md`), with one
necessary deviation in the test file (see "Deviation from brief" below).

## TDD evidence

### RED (Step 2)

Command:
```
npx vitest run src/tests/unit/ortho-actions.test.ts
```

Output (relevant excerpt):
```
 ❯ src/tests/unit/ortho-actions.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/tests/unit/ortho-actions.test.ts [ src/tests/unit/ortho-actions.test.ts ]
Error: Failed to resolve import "@/app/(dashboard)/ortodoncia/actions" from
"src/tests/unit/ortho-actions.test.ts". Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

Matches the brief's expected failure exactly: "FAIL — cannot find module
`@/app/(dashboard)/ortodoncia/actions`".

### GREEN (Step 4, after implementing `actions.ts`)

Command:
```
npx vitest run src/tests/unit/ortho-actions.test.ts
```

Output:
```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

All three tests passed on the first implementation attempt — the mock chain in the
brief's test (`.select().eq().eq().maybeSingle()` for the read, `.upsert()` for the
write) lined up exactly with the implementation's call order (read-then-upsert), so
no test rewiring was needed per the YAGNI instruction.

### Type check

Command:
```
npx tsc --noEmit
```

First run surfaced one pre-existing issue in the brief's verbatim test code (not
related to mock call order — see below). After the fix, second run produced no
output (clean pass, exit 0).

## Deviation from brief (test file only)

The brief's Step 1 test code contains:
```ts
const written = upsertPayload as { data: Record<string, unknown> };
```

With this repo's `tsconfig.json` (`"strict": true`, `"noUncheckedIndexedAccess": true`),
`tsc --noEmit` rejected this as TS2352 ("Conversion of type 'null' to type
'{ data: Record<string, unknown>; }' may be a mistake") because `upsertPayload` is
declared as `Record<string, unknown> | null` and `null` doesn't sufficiently overlap
with the target object type.

Fix applied (test file only, no assertion changed, no production logic touched):
```ts
const written = upsertPayload as unknown as { data: Record<string, unknown> };
```

This is a pure type-narrowing fix on a local test variable — same runtime behavior,
same three assertions (`res.ok`, `written.data.last_xray_at`,
`written.data.ortho.ficha.malocclusionClass`), still fully aligned with the "keep the
assertions" instruction. `src/app/(dashboard)/ortodoncia/actions.ts` was NOT
modified to work around this — it is transcribed 100% verbatim from the brief.

## Self-review

- `saveOrthoData`: validates input with `orthoDataSchema.safeParse`, gates on
  `assertOrthoAccess(FICHA_ROLES)` (owner/manager only — sector must be
  `odontologia`), reads `clinical_records.data` scoped by `customer_id` +
  `salon_id`, merges only the `ortho` sub-key via spread (`{ ...existing, ortho:
  parsed.data }`), upserts with `onConflict: "customer_id"`, revalidates
  `/ortodoncia`. Returns `ActionResult<null>`.
- `addOrthoVisit`: validates with `orthoVisitSchema`, gates on `VISIT_ROLES`
  (owner/manager/staff), inserts into `ortho_visit` scoped by `salon_id` +
  `customer_id`, stamps `created_by` from the authenticated user, returns the
  inserted row as `ActionResult<OrthoVisit>`.
- `deleteOrthoVisit`: gates on `VISIT_ROLES`, deletes from `ortho_visit` scoped by
  both `id` and `salon_id` (defense in depth alongside RLS), returns
  `ActionResult<null>`.
- All three actions short-circuit through `assertOrthoAccess`, which checks (in
  order) salon existence → sector === "odontologia" → membership role against the
  caller-supplied `requiredRoles` list. Confirmed by the two rejection tests
  (non-dental sector, staff role on the ficha path).
- The merge test explicitly proves `last_xray_at` (a foreign/unrelated key in
  `clinical_records.data`) survives the round-trip untouched while `ortho.ficha`
  is replaced with the new input — this is the core behavior the task exists to
  guarantee (avoid clobbering sibling JSONB data belonging to other modules).
- Ran only the targeted test file per instructions; did not run the full suite.

## Concerns

- None blocking. The only deviation is the test-file type-cast fix described above,
  scoped exclusively to satisfy this repo's strict `tsc --noEmit`, with zero change
  to test intent, assertions, or the production action file.
- Not verified in this task (out of scope per brief): actual Supabase RLS policies
  enforcing owner/manager-only writes on `clinical_records` and
  owner/manager/staff on `ortho_visit` — the action code assumes those policies
  exist (per the brief's comment) but this task only covers the server-action
  layer, gated by application-level role checks in `assertOrthoAccess`.
