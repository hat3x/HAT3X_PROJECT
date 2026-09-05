# Task 4 Report: Capa de queries (lectura del plan de pago + morosidad)

**Date:** 2026-08-12  
**Task:** Implementar read-only query layer para ortodoncia (pagos y morosidad)  
**Status:** DONE

---

## Files Changed

| File | Action | Lines | Notes |
|------|--------|-------|-------|
| `src/lib/queries/ortho-payments.ts` | Created | 67 | New file with 3 exports: `orthoPaymentKeys`, `fetchOrthoPaymentPlan`, `fetchOverdueOrthoCounts` |

---

## Exports

1. **`orthoPaymentKeys`** — Query key factory for TanStack Query
   - `all(salonId)` → base key
   - `plan(salonId, customerId)` → for plan + installments
   - `overdue(salonId, customerIds)` → for overdue counts (deduplicated + sorted customer IDs)

2. **`fetchOrthoPaymentPlan(salonId, customerId)`** — Returns active plan + installments
   - Input: salon ID, customer ID
   - Output: `{ plan: OrthoPaymentPlan; installments: OrthoInstallment[] } | null`
   - Queries `ortho_payment_plan` (status="activo", unique)
   - Joins `ortho_installment` (ordered by seq ascending)
   - Returns `null` if no active plan exists

3. **`fetchOverdueOrthoCounts(salonId, customerIds, todayIso)`** — Delinquency count per customer
   - Input: salon ID, array of customer IDs, ISO date string ("YYYY-MM-DD")
   - Output: `Record<string, number>` (customer_id → overdue installment count)
   - Queries `ortho_installment` where status="pendiente" AND due_date < todayIso
   - Returns empty record if customerIds is empty
   - Accumulates counts per customer

---

## TypeScript Verification

```
$ npx tsc --noEmit
Exit code: 0
```

**Result:** ✓ 0 errors, 0 warnings  
**Dependencies resolved:**
- `OrthoPaymentPlan` ← `@/types/database` (Task 3)
- `OrthoInstallment` ← `@/types/database` (Task 3)
- Supabase client ← `@/lib/supabase/client` (existing)

---

## Git Commit

```
commit 4415a6b
Author: HAT3X Command <info@hat3x.com>
Date:   2026-08-12

    feat(ortodoncia): queries plan de pago + morosidad
    
    1 file changed, 67 insertions(+)
    create mode 100644 src/lib/queries/ortho-payments.ts
```

---

## Self-Review

### Design Correctness

✓ **Query factory pattern** — `orthoPaymentKeys` matches TanStack Query conventions (scoped to salon)  
✓ **Single responsibility** — Each function has one job (fetch plan, fetch overdue counts)  
✓ **Null safety** — Plan query returns `null` when not found; installments defaults to `[]`  
✓ **Error handling** — Errors thrown with Supabase message; caller decides handling  
✓ **Edge cases handled:**
  - Empty customerIds array → returns `{}` immediately (early exit)
  - No installments for plan → returns `[]` (no data)
  - Plan exists but is not "activo" → returns `null` (status filter)

### Type Safety

✓ **No `any` types** — All parameters and returns are explicitly typed  
✓ **Read-only parameters** — `customerIds` as `readonly string[]`  
✓ **Return type clarity** — `Promise<...> | null` explicitly states possibilities  
✓ **Database types imported** — From Task 3 (decoupling tables)

### Browser Client Compliance

✓ Uses `createClient()` from `@/lib/supabase/client` (browser-safe, not server)  
✓ No backend-only operations (Edge Functions, Admin API)  
✓ Appropriate for client-side caching (query keys support TanStack Query invalidation)

### Naming

✓ `fetchOrthoPaymentPlan` — clear that it fetches + combines (not just reads one table)  
✓ `fetchOverdueOrthoCounts` — clear it counts VENCIDAS (overdue), not all pending  
✓ Parameter names match schema (`salonId`, `customerId`, `todayIso`, `status`, `due_date`)

---

## Concerns

**None.** The implementation is minimal, type-safe, and verbatim from the brief. No hidden complexity or edge cases detected.

---

## Next Steps (Task 5+)

- **Task 5:** Mutations layer (`insertOrthoPaymentPlan`, `payInstallment`, etc.)
- **Task 6:** Client components (use queries with TanStack Query hooks)
- **Task 7:** Integration with payment methods (Stripe, manual)

---

## Verification Command

To re-verify types:
```bash
cd clients/projects/salon-os
npx tsc --noEmit
```

Expected output: Exit code 0 (no errors).
