### Task 6: `/ortodoncia` en subsecciones por tabs — UI con ui-ux-pro-max

**Files:**
- Modify: `src/components/dental/ortodoncia-view.tsx`

**Interfaces:**
- Consumes: `PillTabs` (Task 1); `OrthoImagingCard` (Task 5); `OrthoPaymentPlanCard` (Fase 2, ya importado); el resto de bloques ya viven en el fichero.

> **OBLIGATORIO:** invoca `ui-ux-pro-max` antes de reestructurar. NO cambies la lógica (estado `ficha`/`treatment`, `useSaveOrthoData`, `OrthoVisitsCard`, el bloque de consentimiento, `OrthoPaymentPlanCard`): solo envuelve cada bloque en su pestaña.

- [ ] **Step 1: Reestructurar el `return` de `OrtodonciaView` en pestañas**

En `src/components/dental/ortodoncia-view.tsx`:
1. Importar: `import { PillTabs } from "@/components/ui/pill-tabs";` y `import { OrthoImagingCard } from "@/components/dental/ortho-imaging-card";`.
2. Estado: `const [tab, setTab] = useState<string>("ficha");` (usa el `useState` ya importado).
3. Definir las pestañas (constante a nivel de módulo):
```tsx
const ORTHO_TABS = [
  { id: "ficha", label: "Ficha y tratamiento" },
  { id: "seguimiento", label: "Seguimiento" },
  { id: "consentimiento", label: "Consentimiento" },
  { id: "pago", label: "Plan de pago" },
  { id: "radiografias", label: "Radiografías" },
] as const;
```
4. Sustituir el `<div className="space-y-6">…</div>` que envuelve todos los bloques por:
```tsx
    <div className="space-y-6">
      <PillTabs tabs={ORTHO_TABS} active={tab} onChange={setTab} ariaLabel="Secciones de ortodoncia" />

      {tab === "ficha" && (
        <div className="space-y-6">
          {/* Card "Ficha ortodóncica" + Card "Tratamiento" + el <div> del botón
              "Guardar ficha y tratamiento" (con su error) EXISTENTES, sin tocar su lógica */}
        </div>
      )}

      {tab === "seguimiento" && (
        <OrthoVisitsCard
          visits={visitsQuery.data ?? []}
          onAdd={(input) => addVisit.mutate(input)}
          onDelete={(id) => deleteVisit.mutate(id)}
          adding={addVisit.isPending}
        />
      )}

      {tab === "consentimiento" && (
        /* el <Card> de "Consentimiento de ortodoncia" EXISTENTE, sin tocar su lógica */
      )}

      {tab === "pago" && <OrthoPaymentPlanCard salonId={salonId} customerId={customerId} />}

      {tab === "radiografias" && <OrthoImagingCard salonId={salonId} customerId={customerId} />}
    </div>
```
Mueve los bloques JSX actuales (Ficha, Tratamiento, botón guardar, Seguimiento, Consentimiento, Plan de pago) a sus ramas de pestaña correspondientes SIN alterar props/handlers. El `OrthoImagingCard` es la pestaña nueva. Mantén todo el estado/hooks al principio del componente como está.

- [ ] **Step 2: Typecheck + verificación visual**

Run: `npx tsc --noEmit` → 0 errores.
Run: `npm run dev` → `/ortodoncia`, elegir paciente: comprobar que los 5 botones conmutan las subsecciones, que "Ficha y tratamiento" guarda igual, y que "Radiografías" sube/lista imágenes y PDF.

- [ ] **Step 3: Commit**

```bash
git add src/components/dental/ortodoncia-view.tsx
git commit -m "feat(ortodoncia): /ortodoncia en subsecciones por pill-tabs"
```

---

