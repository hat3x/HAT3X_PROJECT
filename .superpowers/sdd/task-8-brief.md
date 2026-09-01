## Task 8: Pre-login sector picker + login enforcement

**Files:**
- Create: `src/app/(auth)/login/sector-picker.tsx`, `src/app/(auth)/login/actions.ts`
- Modify: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `SECTOR_ORDER`, `SECTOR_REGISTRY`, `parseSectorParam`, `sectorMismatchMessage`, `getActiveSalonSector`.
- Produces: `resolveTenantSector(): Promise<SalonSector | null>` (server action); `/login` → picker; `/login?sector=<x>` → themed form; sign-in rejects on mismatch.

- [ ] **Step 1: Server action**

Create `src/app/(auth)/login/actions.ts`:
```ts
"use server";
import { getActiveSalonSector } from "@/lib/salon";
import type { SalonSector } from "@/types/database";
export async function resolveTenantSector(): Promise<SalonSector | null> {
  return getActiveSalonSector();
}
```

- [ ] **Step 2: Sector picker**

Create `src/app/(auth)/login/sector-picker.tsx` (server component): map `SECTOR_ORDER` → cards using `SECTOR_REGISTRY[s]` (label + brandName), each an `<a href={\`/login?sector=${s}\`}>`. Use a lucide icon per sector (e.g. `Scissors`, `Stethoscope`/`Activity`, `UtensilsCrossed`).

- [ ] **Step 3: Branch the login page**

Modify `src/app/(auth)/login/page.tsx`: read `searchParams?.sector`, `parseSectorParam` it. If null → render `<SectorPicker/>`. If valid → render `<LoginForm sector={sector} />`.

- [ ] **Step 4: Enforce the guard in the form**

Modify `src/app/(auth)/login/login-form.tsx`: add prop `sector: SalonSector`; theme the header brand from `SECTOR_REGISTRY[sector]` (brandName + icon). After a successful `signInWithPassword`:
```ts
const tenantSector = await resolveTenantSector();
const mismatch = tenantSector ? sectorMismatchMessage(sector, tenantSector) : null;
if (mismatch !== null) {
  await supabase.auth.signOut();
  setError(mismatch);
  setIsLoading(false);
  return;
}
const next = searchParams.get("next") ?? "/dashboard";
router.push(next);
router.refresh();
```
Import `resolveTenantSector` from `./actions`, `sectorMismatchMessage` from `@/lib/auth/sector-login`, `SECTOR_REGISTRY` from `@/lib/sector/registry`.

- [ ] **Step 5: Verify typecheck + suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 6: Manual smoke**

```bash
curl -s -o /dev/null -w "picker %{http_code}\n" --max-time 40 "http://localhost:3000/login"
curl -s -o /dev/null -w "themed %{http_code}\n" --max-time 40 "http://localhost:3000/login?sector=odontologia"
```
Expected: both `200`; no compile errors.

- [ ] **Step 7: Commit**

```bash
git add clients/projects/salon-os/src/app/\(auth\)/login/
git commit -m "feat(salon-os): pre-login sector picker + tenant-sector guard on login"
```

---

