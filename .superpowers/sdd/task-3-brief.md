## Task 3: Resolve sector server-side (`src/lib/salon.ts`)

**Files:**
- Modify: `src/lib/salon.ts`

**Interfaces:**
- Consumes: existing `getActiveSalon()`, `SalonSector`.
- Produces: `getActiveSalonSector(): Promise<SalonSector | null>`; `getActiveSalon()` result includes `sector: SalonSector`.

- [ ] **Step 1: Read `getActiveSalon`**

Read `src/lib/salon.ts` around `getActiveSalon`; confirm the `.select("id, name, slug, timezone, ...")` and the returned shape.

- [ ] **Step 2: Add `sector` to the select and `getActiveSalonSector`**

Extend the `getActiveSalon()` select to include `sector`; add `sector` (typed `SalonSector`) to the returned object. Add:
```ts
/** Sector del salón activo (o null si no hay salón). */
export async function getActiveSalonSector(): Promise<SalonSector | null> {
  const salon = await getActiveSalon();
  return salon?.sector ?? null;
}
```
Import `SalonSector` from `@/types/database`.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add clients/projects/salon-os/src/lib/salon.ts
git commit -m "feat(salon-os): resolve active salon sector server-side"
```

---

