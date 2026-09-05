# Task 4 Report — Capa de queries (lectura)

## Status: ✅ DONE

## Files Changed
- **Created:** `src/lib/queries/ortho.ts` (60 lines)

## Implementation

### Queries Implemented
1. **`orthoKeys`** — Query key factory for React Query integration (3 keys: all, data, visits)
2. **`fetchOrthoData(salonId, customerId): Promise<OrthoData>`** — Reads ortho ficha + treatment from `clinical_records.data.ortho` JSONB, returns fully populated object (defaults to `EMPTY_ORTHO_FICHA` and `EMPTY_ORTHO_TREATMENT` if missing)
3. **`fetchOrthoVisits(salonId, customerId): Promise<OrthoVisit[]>`** — Reads timeline from `ortho_visit` table, ordered by `visit_date` desc, then `created_at` desc

### Design Details
- **Browser-only client:** Uses `createClient()` (Supabase browser client)
- **Defensive merging:** Fills missing nested ortho data with empty defaults to ensure controlled form behavior
- **Error handling:** Throws on query errors; returns empty array for visits if no records

## TypeScript Verification
```
npx tsc --noEmit
→ 0 errors ✅
```

No type issues. Imports resolve:
- `@/lib/dental/ortho` (Task 1 deliverable)
- `@/types/database` (Task 3 deliverable: OrthoVisit type)
- `@/lib/supabase/client` (existing)

## Commit
```
2be70b0 feat(ortodoncia): queries de lectura (data + visitas)
1 file changed, 60 insertions(+)
```

## Self-Review
✅ Code matches brief exactly (character-by-character)
✅ No external dependencies added
✅ Follows naming conventions (camelCase functions, orthoKeys factory)
✅ JSDoc comments preserved
✅ Error handling consistent with codebase pattern
✅ Query keys follow TanStack Query factory pattern (nested structure)

## Concerns
None. This is a straightforward read-only query layer with no side effects.

## Next Steps
Task 5 (hooks layer) will wrap these functions with React Query (`useQuery`), and Task 6+ will build UI components consuming the hooks.

---
Generated: 2026-08-11
Branch: `hat3x/HAT3X-038`
