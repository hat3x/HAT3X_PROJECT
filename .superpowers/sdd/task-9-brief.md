## Task 9: Coming-soon shell + settings-nav terminology

**Files:**
- Create: `src/components/coming-soon.tsx`, `src/app/(dashboard)/proximamente/page.tsx`
- Modify: `src/app/(dashboard)/ajustes/ajustes-nav.tsx`

**Interfaces:**
- Consumes: `useTerms()`.
- Produces: `<ComingSoon/>`; `/proximamente` route; settings nav "Servicios"/"Personal" relabeled via `useTerms()`.

- [ ] **Step 1: Coming-soon component**

Create `src/components/coming-soon.tsx` — centered card: title "Próximamente", subtitle "Este módulo aún no está disponible para tu sector." Pure presentational (no props required).

- [ ] **Step 2: Route**

Create `src/app/(dashboard)/proximamente/page.tsx` rendering `<ComingSoon/>`.

- [ ] **Step 3: Relabel settings nav**

Modify `src/app/(dashboard)/ajustes/ajustes-nav.tsx` (client component): `const terms = useTerms();` and replace the hardcoded "Servicios"/"Personal" labels with `terms.servicePlural`/`terms.professionalPlural`. Leave the rest.

- [ ] **Step 4: Verify typecheck + suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/coming-soon.tsx clients/projects/salon-os/src/app/\(dashboard\)/proximamente/ clients/projects/salon-os/src/app/\(dashboard\)/ajustes/ajustes-nav.tsx
git commit -m "feat(salon-os): coming-soon shell + sector terminology in settings nav"
```

---

