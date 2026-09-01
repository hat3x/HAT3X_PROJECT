# Tarea 4 — Ajustes → Economía — Informe

**Estado:** completa.

**Hash del commit:** `c2e1d2a19dd7107683609c9dac4960ec4ed7a588` (rama `feature/atlas`)

**Línea de tests (suite entera):**
```
 Test Files  83 passed (83)
      Tests  749 passed (749)
[exited with code 0]
```
(incluye `src/tests/componentes/form-economia.test.tsx` — 3 tests en verde)

**Código de `npx tsc --noEmit`:** `TSC_EXIT_CODE=0`

**Ficheros:**
- Creado: `apps/atlas/src/lib/db/acciones-economia.ts`
- Creado: `apps/atlas/src/components/ajustes/FormEconomia.tsx`
- Creado: `apps/atlas/src/app/ajustes/economia/page.tsx`
- Modificado: `apps/atlas/src/app/ajustes/page.tsx` (entrada «Economía», icono `Coins`, solo propietario)
- Creado: `apps/atlas/src/tests/componentes/form-economia.test.tsx`

**Notas:**
- El `<input>` de coste de la hora se dejó con solo `aria-label` (sin duplicar el nombre accesible con el `<span>` envolvente), mismo criterio que 2C — el test pasó a la primera con ese ajuste.
- No se tocó `src/lib/rentabilidad/margen.ts` ni su test (trabajo en paralelo de otro agente); confirmado con `git status` antes y después.
- Commit incluye solo los 5 ficheros de la Tarea 4 — verificado con `git status --short` antes de `git add`.

**Dudas:** ninguna.
