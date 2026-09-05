### Task 7: Entrada de navegación "Ortodoncia"

**Files:**
- Modify: `src/components/dashboard-nav-items.ts` (declarar `ORTODONCIA_ITEM` junto a `PERIODONTOGRAMA_ITEM`; insertarlo en la rama `sector === "odontologia"` de `buildDashboardNavItems`, tras `PERIODONTOGRAMA_ITEM`)
- Test: `src/tests/unit/dashboard-nav-items-sector.test.ts` (extender)

**Interfaces:**
- Consumes: `NavItem`, `buildDashboardNavItems` (existentes).
- Produces: `ORTODONCIA_ITEM`.

- [ ] **Step 1: Write the failing test** (añadir al fichero existente)

```ts
// añadir dentro de src/tests/unit/dashboard-nav-items-sector.test.ts
it("incluye /ortodoncia para odontología y no para peluquería", () => {
  const dental = buildDashboardNavItems({ showSettings: true, hasPos: false, sector: "odontologia" });
  const hair = buildDashboardNavItems({ showSettings: true, hasPos: false, sector: "peluqueria" });
  expect(dental.some((i) => i.href === "/ortodoncia")).toBe(true);
  expect(hair.some((i) => i.href === "/ortodoncia")).toBe(false);
});
```

(Si `buildDashboardNavItems` no está ya importado en el fichero, añade el import desde `@/components/dashboard-nav-items` siguiendo el estilo de los tests existentes en ese archivo.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-sector.test.ts`
Expected: FAIL — `/ortodoncia` no aparece.

- [ ] **Step 3: Write the implementation**

Elige un icono lucide (los otros dentales usan `Stethoscope`, `Activity`); añade `Braces` al import de `lucide-react` del fichero. Declara el item junto a los otros dentales:

```ts
export const ORTODONCIA_ITEM: NavItem = {
  href: "/ortodoncia",
  label: "Ortodoncia",
  icon: Braces,
};
```

E insértalo en la rama odontología, tras Periodontograma:

```ts
    return [
      ...withSectorLabels.slice(0, insertAt),
      ODONTOGRAMA_ITEM,
      PERIODONTOGRAMA_ITEM,
      ORTODONCIA_ITEM,
      PLANES_ITEM,
      EXPEDIENTE_ITEM,
      ...withSectorLabels.slice(insertAt),
    ];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/dashboard-nav-items-sector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard-nav-items.ts src/tests/unit/dashboard-nav-items-sector.test.ts
git commit -m "feat(ortodoncia): entrada de nav (solo odontología)"
```

---

