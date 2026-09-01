### Task 8: Aviso de morosidad en la agenda

**Files:**
- Modify: `src/app/(dashboard)/appointments/page.tsx` (pasar `sector`)
- Modify: `src/app/(dashboard)/appointments/appointments-view.tsx` (badge de morosidad en la tarjeta)

**Interfaces:**
- Consumes: `useOverdueOrtho` (Task 6).
- Produces: aviso "⚠ N cuota(s) vencida(s)" en las citas de pacientes morosos, solo sector odontología.

- [ ] **Step 1: Pasar `sector` desde la página**

En `src/app/(dashboard)/appointments/page.tsx`, añadir `sector={salon.sector}` al render de `<AppointmentsView>`:

```tsx
  return (
    <AppointmentsView
      salonId={salon.id}
      salonSlug={salon.slug}
      timezone={salon.timezone}
      sector={salon.sector}
    />
  );
```

- [ ] **Step 2: Recibir `sector` y calcular morosos en la vista**

En `appointments-view.tsx`:
1. Añadir `sector` a `AppointmentsViewProps` (tipo `SalonSector` desde `@/types/database`) y a la desestructuración del componente.
2. Importar el hook y, tras `appointmentsQuery`, calcular los `customerId` del día y consultar morosidad solo si es dental:

```tsx
import type { AppointmentStatus, SalonSector } from "@/types/database";
import { useOverdueOrtho } from "@/hooks/use-ortho-payments";
// ... en props: sector: SalonSector;   y en la desestructuración: sector,

const dayCustomerIds = Array.from(
  new Set(
    (appointmentsQuery.data ?? [])
      .map((a) => a.customer_id)
      .filter((v): v is string => v !== null),
  ),
);
const overdueQuery = useOverdueOrtho(salonId, dayCustomerIds, date, sector === "odontologia");
const overdueMap = overdueQuery.data ?? {};
```

3. Pasar el contador a cada `AppointmentCard` en el `.map`:

```tsx
<AppointmentCard
  /* ...props existentes... */
  overdueCount={overdueMap[appt.customer_id ?? ""] ?? 0}
/>
```

- [ ] **Step 3: Pintar el badge en `AppointmentCard`**

Añadir `overdueCount: number` a `AppointmentCardProps` y a la desestructuración; renderizar el aviso junto al nombre del paciente cuando `overdueCount > 0` (dentro de la zona de datos del paciente):

```tsx
{overdueCount > 0 && (
  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
    ⚠ {overdueCount} cuota{overdueCount === 1 ? "" : "s"} vencida{overdueCount === 1 ? "" : "s"}
  </span>
)}
```

- [ ] **Step 4: Typecheck + verificación**

Run: `npx tsc --noEmit` → 0 errores.
Verificar en dev: un paciente con una cuota vencida y cita hoy muestra el aviso en su tarjeta; en un salón no dental no aparece nada (ni se consulta, por `enabled: sector === "odontologia"`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/appointments/page.tsx" "src/app/(dashboard)/appointments/appointments-view.tsx"
git commit -m "feat(ortodoncia): aviso de morosidad en la agenda (solo dental)"
```

---

