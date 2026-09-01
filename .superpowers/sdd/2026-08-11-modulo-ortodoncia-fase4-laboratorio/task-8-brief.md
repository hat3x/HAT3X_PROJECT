### Task 8: `/ortodoncia` — pestaña "Laboratorio" + bloque de alineadores en "Ficha y tratamiento" (ui-ux-pro-max)

**Files:**
- Modify: `src/components/dental/ortodoncia-view.tsx`

**Interfaces:**
- Consumes: `OrthoLabCard` (Task 7); `computeAlignerProgress` de `@/lib/dental/lab-orders` (Task 1); `visitsQuery` (ya presente en el view para el seguimiento); `treatment.alignerTotal` (Task 1/2); `PillTabs`/`ORTHO_TABS` (Fase 3).

> **OBLIGATORIO:** invoca `ui-ux-pro-max`. NO cambies la lógica de guardado existente: `alignerTotal` es un campo más del `treatment`, ya cubierto por el botón "Guardar ficha y tratamiento" (`useSaveOrthoData`). Antes de editar, LEE el archivo para confirmar: (a) la estructura real de `ORTHO_TABS` y cómo se renderiza cada tab; (b) el estado `treatment`/`setTreatment` y el helper `numberOrNull` (o equivalente); (c) el nombre real de `visitsQuery` y la forma de `v.actions`; (d) el nombre del campo `applianceType` en `OrthoTreatment`. Ajusta los identificadores a los reales.

- [ ] **Step 1: Añadir la pestaña "Laboratorio"**

1. Import: `import { OrthoLabCard } from "@/components/dental/ortho-lab-card";` y `import { computeAlignerProgress } from "@/lib/dental/lab-orders";`.
2. Añadir a `ORTHO_TABS` (tras la de radiografías): `{ id: "laboratorio", label: "Laboratorio" }`.
3. Añadir la rama de contenido: cuando el tab activo sea `"laboratorio"`, renderizar `<OrthoLabCard salonId={salonId} customerId={customerId} />` (usando el mismo mecanismo condicional que las demás tabs del archivo).

- [ ] **Step 2: Añadir el bloque de alineadores en la pestaña "Ficha y tratamiento"**

Dentro de la Card "Tratamiento" (tab "ficha"), cuando `treatment.applianceType === "alineadores"`:
1. Input del total (usa el mismo `numberOrNull`/setter del archivo):
```tsx
{treatment.applianceType === "alineadores" && (
  <div className="space-y-1.5">
    <Label htmlFor="alignerTotal">Nº total de alineadores</Label>
    <Input
      id="alignerTotal"
      type="number"
      min={1}
      value={treatment.alignerTotal ?? ""}
      onChange={(e) =>
        setTreatment((t) => ({ ...t, alignerTotal: numberOrNull(e.target.value) }))
      }
    />
  </div>
)}
```
2. Resumen de progreso (derivado de las visitas ya cargadas):
```tsx
{treatment.applianceType === "alineadores" && treatment.alignerTotal !== null && (() => {
  const progress = computeAlignerProgress(
    treatment.alignerTotal,
    (visitsQuery.data ?? []).map(
      (v) => (v.actions as { alignerDelivered?: number | null }).alignerDelivered ?? null,
    ),
  );
  return (
    <p className="text-sm text-muted-foreground sm:col-span-2">
      Alineadores: <strong>{progress.delivered}</strong> de {progress.total} entregados ·{" "}
      {progress.pending} pendientes
    </p>
  );
})()}
```
(El `alignerTotal` se persiste con el botón "Guardar ficha y tratamiento" existente — `saveOrthoData` ya serializa todo el objeto `treatment`, sin cambios.)

- [ ] **Step 3: Typecheck + verificación visual**

Run: `npx tsc --noEmit` → 0.
Run: `npm run dev` → `/ortodoncia`: la pestaña "Laboratorio" funciona; en "Ficha y tratamiento" con aparatología = alineadores aparecen el input de total + el resumen (entregados según las visitas registradas), y persiste al guardar.

- [ ] **Step 4: Commit**

```bash
git add src/components/dental/ortodoncia-view.tsx
git commit -m "feat(ortodoncia): pestana Laboratorio + progreso de alineadores"
```

---

