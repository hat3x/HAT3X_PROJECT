### Task 7: `/ajustes/horarios` en tabs (clínica / por profesional) — UI con ui-ux-pro-max

**Files:**
- Modify: `src/app/(dashboard)/ajustes/horarios/horarios-view.tsx`

**Interfaces:**
- Consumes: `PillTabs` (Task 1); el resto (`SalonScheduleEditor`, `ScheduleEditor`, `ExceptionsEditor`, `useProfessionals`, selector) ya está en el fichero.

> **OBLIGATORIO:** invoca `ui-ux-pro-max` antes de reestructurar. No cambies la lógica (auto-selección del primer profesional, editores): solo reparte en 2 pestañas.

- [ ] **Step 1: Reestructurar en 2 pestañas**

En `horarios-view.tsx`:
1. Importar `import { PillTabs } from "@/components/ui/pill-tabs";`.
2. Estado: `const [tab, setTab] = useState<string>("clinica");`.
3. Pestañas (constante a nivel de módulo):
```tsx
const HORARIO_TABS = [
  { id: "clinica", label: "Horario de la clínica" },
  { id: "profesional", label: "Horarios por profesional" },
] as const;
```
4. Tras el `<SectionHeader … />`, insertar la barra:
```tsx
      <PillTabs tabs={HORARIO_TABS} active={tab} onChange={setTab} ariaLabel="Tipos de horario" className="mb-6" />
```
5. La `<Card>` "Horario de la clínica" (con `SalonScheduleEditor`) se renderiza solo si `tab === "clinica"`.
6. Todo el bloque inferior (el `isPending ? … : isError ? … : !professionals ? … : (<selector + "Horario semanal" + "Excepciones">)`) se renderiza solo si `tab === "profesional"`. Mantén su lógica intacta (incluida la auto-selección en el `useEffect`, que sigue corriendo aunque la pestaña no esté visible — no pasa nada).

- [ ] **Step 2: Typecheck + verificación visual**

Run: `npx tsc --noEmit` → 0 errores.
Run: `npm run dev` → `/ajustes/horarios`: el botón "Horarios por profesional" muestra directo el selector + horario semanal + excepciones (ya no oculto abajo).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ajustes/horarios/horarios-view.tsx"
git commit -m "feat(horarios): /ajustes/horarios en tabs (clinica / por profesional)"
```

---

