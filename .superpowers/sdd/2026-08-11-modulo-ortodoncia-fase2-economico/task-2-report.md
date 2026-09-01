# Task 2 Report: Validación Zod (crear plan de pago + cobrar cuota)

**Status:** DONE  
**Date:** 2026-08-12  
**Test Evidence:** RED → GREEN (6/6 passing)

---

## TDD Evidence

### Phase 1: RED
```
Run: npx vitest run src/tests/unit/ortho-payments-schema.test.ts
Error: Failed to resolve import "@/lib/validations/ortho-payments"
       Does the file exist?
Status: FAIL (expected)
```

### Phase 2: GREEN
```
Run: npx vitest run src/tests/unit/ortho-payments-schema.test.ts
Test Files  1 passed (1)
     Tests  6 passed (6)
Status: PASS (all constraints validated)
```

### Phase 3: Type Safety
```
Run: npx tsc --noEmit
Result: No errors
Status: PASS
```

---

## Files Changed

| File | Status | Type |
|------|--------|------|
| `src/lib/validations/ortho-payments.ts` | Created | Implementation |
| `src/tests/unit/ortho-payments-schema.test.ts` | Created | Test |

**Commit:** `b8023fa` — feat(ortodoncia): esquemas Zod plan de pago

---

## Implementation Summary

### `createOrthoPlanSchema`

**Base Object:**
- `totalCents`: integer ≥ 1 (total importe en céntimos)
- `downPaymentCents`: integer ≥ 0 (entrada/entrada)
- `installmentCount`: integer 1–120 (nº cuotas)
- `dayOfMonth`: integer 1–31 (día de cobro)
- `startDate`: ISO date string `YYYY-MM-DD`
- `notes`: optional nullable string ≤ 2000 chars

**Refinements (bifásicos):**

1. **Refine 1:** `downPaymentCents <= totalCents`
   - Message: "La entrada no puede superar el total"
   - Path: `["downPaymentCents"]`

2. **Refine 2:** `(totalCents - downPaymentCents) >= installmentCount`
   - Message: "El importe a financiar es menor que el número de cuotas"
   - Path: `["installmentCount"]`
   - Rationale: Cada cuota debe ser ≥ 1 céntimo

**Type Exports:**
- `CreateOrthoPlanInput`: z.input<typeof createOrthoPlanSchema>
- `CreateOrthoPlanValues`: z.output<typeof createOrthoPlanSchema>

### `payInstallmentSchema`

**Object:**
- `method`: enum string ("efectivo" | "tarjeta" | "transferencia" | "otro")

**Type Exports:**
- `PayInstallmentInput`: z.input<typeof payInstallmentSchema>

---

## Test Coverage

| Test Case | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Plan válido (base) | PASS | PASS | ✓ |
| Entrada > total | FAIL | FAIL | ✓ |
| Financiado < nº cuotas | FAIL | FAIL | ✓ |
| dayOfMonth = 0 | FAIL | FAIL | ✓ |
| dayOfMonth = 32 | FAIL | FAIL | ✓ |
| Método válido (tarjeta) | PASS | PASS | ✓ |
| Método desconocido (bizum) | FAIL | FAIL | ✓ |

**Result:** 6/6 tests passing

---

## Self-Review Checklist

- [x] Code copied verbatim from brief (no divergence)
- [x] Both `.refine()` constraints implemented correctly
- [x] Import style matches project (z from "zod")
- [x] Type exports follow Zod best practices (input/output)
- [x] Test file runs standalone (no external deps)
- [x] TypeScript strict mode passes
- [x] No unused imports or variables
- [x] Error messages in Spanish (localización coherente)
- [x] Committed with signed co-author line

---

## Concerns

**None.** Implementation is straightforward, tests are deterministic, and schemas are locked to brief specifications.

---

## Next Steps (Task 3)

Task 3 will likely implement the domain layer (use cases for creating plans and charging installments) using these schemas as input validators.

---

**Report Generated:** 2026-08-12 11:06 UTC
