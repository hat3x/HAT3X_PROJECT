## Task 6: Wire sector into the dashboard shell

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`, `src/components/dashboard-nav.tsx`

**Interfaces:**
- Consumes: `getActiveSalonSector()`, `SectorProvider`, `useSector()`, `buildDashboardNavItems({..., sector})`.
- Produces: client tree wrapped in `<SectorProvider sector>`; `DashboardNav` passes `useSector()` into the nav builder.

- [ ] **Step 1: Resolve sector in the layout**

In `src/app/(dashboard)/layout.tsx`: add `getActiveSalonSector()` to the existing `Promise.all([...])`; wrap the current children (inside `SalonFeaturesProvider`) with `<SectorProvider sector={sector ?? "peluqueria"}>`. Import `SectorProvider` and `getActiveSalonSector`.

- [ ] **Step 2: Read sector in the nav**

In `src/components/dashboard-nav.tsx`: import `useSector`; pass `sector` into `buildDashboardNavItems({ showSettings, hasPos, sector })`.

- [ ] **Step 3: Verify typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; ALL tests pass (1235 + new).

- [ ] **Step 4: Manual smoke**

With a dev server running: `curl -s -o /dev/null -w "%{http_code}\n" --max-time 45 http://localhost:3000/dashboard`
Expected: `307`, no compile error in dev output.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/app/\(dashboard\)/layout.tsx clients/projects/salon-os/src/components/dashboard-nav.tsx
git commit -m "feat(salon-os): plumb sector through the dashboard shell"
```

---

