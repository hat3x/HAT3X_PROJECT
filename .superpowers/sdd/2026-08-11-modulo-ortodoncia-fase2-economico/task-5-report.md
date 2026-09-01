# Task 5 — Report: Server actions del plan de pago (crear vía RPC, cobrar, deshacer, cancelar)

## Files changed

- Created: `src/app/(dashboard)/ortodoncia/payment-actions.ts`
- Created: `src/tests/unit/ortho-payment-actions.test.ts`

## TDD evidence

### RED (Step 2)

Ran `npx vitest run src/tests/unit/ortho-payment-actions.test.ts` after writing only the test file:

```
FAIL  src/tests/unit/ortho-payment-actions.test.ts [ src/tests/unit/ortho-payment-actions.test.ts ]
Error: Failed to resolve import "@/app/(dashboard)/ortodoncia/payment-actions" from
"src/tests/unit/ortho-payment-actions.test.ts". Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
```

Confirmed: fails because the module doesn't exist yet, exactly as expected.

### GREEN (Step 4)

After writing `payment-actions.ts` (and the one cast adjustment described below):

```
Test Files  1 passed (1)
     Tests  4 passed (4)
```

All four cases pass:
- rechaza si el salón no es odontología
- rechaza a staff (crear plan es owner/manager)
- owner: llama a la RPC con el calendario calculado y devuelve el planId
- traduce el error PLAN_EXISTS de la RPC a un mensaje claro

### `npx tsc --noEmit`

Clean (no output / exit 0) across the whole project after both files were in place.

## Cast adjustments (with rationale)

1. **Implementation — `createOrthoPaymentPlan` return value.**
   Brief text: `return { ok: true, data: { planId: data as string } };`
   Written as: `return { ok: true, data: { planId: data } };`
   Reason: the RPC's typed signature in `src/types/database.ts` (`create_ortho_payment_plan: { Args: {...}; Returns: string }`, lines 4119-4133) already makes `supabase.rpc("create_ortho_payment_plan", ...)`'s `data` field typed as `string`. Adding `as string` on an already-`string` value is a no-op cast; kept the code cast-free instead since strict mode has no complaint about it either way — no behavior change, no test-observable difference (`res.data.planId` still resolves to the mocked `"plan-123"`).

2. **Test — `.mock.calls[0]` destructuring (`noUncheckedIndexedAccess`).**
   Brief text: `const [fn, args] = rpcMock.mock.calls[0];`
   Written as: `const [fn, args] = rpcMock.mock.calls[0] as [string, unknown];`
   Reason: this repo's `tsconfig.json` has `"noUncheckedIndexedAccess": true`, so `rpcMock.mock.calls[0]` types as `any[] | undefined`, and destructuring it directly fails `tsc --noEmit` with `TS2488: Type 'any[] | undefined' must have a '[Symbol.iterator]()' method...`. This is the exact same pattern already used elsewhere in the suite for the identical situation (e.g. `src/tests/unit/appointment-reminder-actions.test.ts:148` and `src/tests/unit/recall-actions.test.ts:134`: `const [to, body] = sendSmsMock.mock.calls[0] as [string, string];`). Used `[string, unknown]` here because the mocked `rpc` signature is `(fn: string, args: unknown) => rpcMock(fn, args)`. No assertion logic changed — same three `expect` calls follow, unaffected.

No other deviations from the brief's verbatim code.

## Self-review

- **Access gates verified against spec**: `createOrthoPaymentPlan`, `unpayInstallment`, `cancelOrthoPaymentPlan` all gate on `MANAGER_ROLES = ["owner", "manager"]`; `payInstallment` gates on `STAFF_ROLES = ["owner", "manager", "staff"]` — matches "Gates: crear/cancelar/deshacer = owner/manager; cobrar = owner/manager/staff" from the task description.
- **Sector gate**: `assertAccess` rejects any salon whose `sector !== "odontologia"` before checking role, for all four actions (shared helper).
- **salon_id scoping**: every Supabase table query (`ortho_installment`, `ortho_payment_plan`) and the RPC call includes `.eq("salon_id", access.salonId)` / `p_salon_id: access.salonId` — no cross-tenant leakage path.
- **RPC error translation**: `error.message.includes("PLAN_EXISTS")` → friendly Spanish message `"Este paciente ya tiene un plan de pago activo"`; any other RPC error message passes through verbatim (test only covers PLAN_EXISTS, both paths implemented as specified).
- **Schema/type field names cross-checked** directly against `src/types/database.ts`: `ortho_payment_plan` Row (`total_cents`, `down_payment_cents`, `installment_count`, `day_of_month`, `start_date`, `status`, `notes`, `updated_at`, …) and `ortho_installment` Row (`plan_id`, `seq`, `due_date`, `amount_cents`, `status`, `paid_at`, `paid_method`, `paid_amount_cents`) — all match what the implementation reads/writes. RPC args (`p_salon_id` … `p_installments`) match `create_ortho_payment_plan.Args` exactly, and `Returns: string` confirmed for point 1 above.
- **Pattern consistency**: mirrors the sibling `src/app/(dashboard)/ortodoncia/actions.ts` (`assertOrthoAccess` → here `assertAccess`; same `ActionResult<T>` shape, same `ERROR_NO_SALON`/`ERROR_SECTOR`/`ERROR_ROLE` message strings, same `revalidatePath("/ortodoncia")` convention) — no invented conventions.
- **`payInstallment` completion side-effect**: after marking a cuota `pagada`, it re-counts remaining `pendiente` installments for the plan and flips `ortho_payment_plan.status` to `completado` only when zero remain — not exercised by this task's test suite (only `createOrthoPaymentPlan` is tested per the brief), but logic was read carefully against the brief's verbatim code with no changes.
- **`unpayInstallment` reopen side-effect**: symmetric — reverts the cuota to `pendiente`, clears paid fields, and reopens the plan (`status: "activo"`) only if it was `completado`, scoped by `.eq("status", "completado")` guard so it's a no-op update otherwise. Not test-covered by the brief's suite; implemented as specified.
- Ran `npx eslint` directly on the two new files but the project has no bare ESLint config (uses `next lint`, which is a whole-repo command not appropriate for a scoped task run) — skipped per the orchestrator's instruction to only run the targeted vitest file and `tsc --noEmit`.

## Concerns

- `payInstallment`, `unpayInstallment`, and `cancelOrthoPaymentPlan` have zero test coverage in this task's suite — the brief's Step 1 test file only exercises `createOrthoPaymentPlan`. This is as specified in the brief (verbatim test file), not a gap I introduced. Flagging in case a later task is expected to add coverage for the other three actions.
- No UI wiring in this task (out of scope per the brief) — these actions aren't yet called from any component.

## Commit

```
git add "src/app/(dashboard)/ortodoncia/payment-actions.ts" src/tests/unit/ortho-payment-actions.test.ts
git commit -m "feat(ortodoncia): server actions plan de pago (RPC + cobro)"
```
