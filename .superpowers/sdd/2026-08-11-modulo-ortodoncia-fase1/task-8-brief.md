### Task 8: Layout + página server `/ortodoncia`

**Files:**
- Create: `src/app/(dashboard)/ortodoncia/layout.tsx`
- Create: `src/app/(dashboard)/ortodoncia/page.tsx`
- Create: `src/components/dental/ortodoncia-view.tsx` (STUB — lo completa Task 9)

**Interfaces:**
- Consumes: `SectorGate` (`@/components/guards/sector-gate`), `getActiveSalonId` (`@/lib/salon`), `PatientSelector` (`@/components/dental/patient-selector`).
- Produces: la ruta `/ortodoncia`; export `OrtodonciaView` (stub) con props `{ salonId: string; customerId: string }`.

- [ ] **Step 1: Crear el stub de la vista** (lo completa Task 9)

```tsx
// src/components/dental/ortodoncia-view.tsx
"use client";

export interface OrtodonciaViewProps {
  salonId: string;
  customerId: string;
}

export function OrtodonciaView(_props: OrtodonciaViewProps): React.ReactElement | null {
  return null;
}
```

- [ ] **Step 2: Crear el layout** (gate de sector, copia exacta del de odontograma)

```tsx
// src/app/(dashboard)/ortodoncia/layout.tsx
import { SectorGate } from "@/components/guards/sector-gate";

export default function OrtodonciaLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <SectorGate required="odontologia">{children}</SectorGate>;
}
```

- [ ] **Step 3: Crear la página** (mismo patrón que expediente/odontograma)

```tsx
// src/app/(dashboard)/ortodoncia/page.tsx
import type { Metadata } from "next";

import { OrtodonciaView } from "@/components/dental/ortodoncia-view";
import { PatientSelector } from "@/components/dental/patient-selector";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = { title: "Ortodoncia" };

export default async function OrtodonciaPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}): Promise<React.ReactElement> {
  const [salonId, params] = await Promise.all([getActiveSalonId(), searchParams]);

  const customerId = params.paciente ?? "";
  const hasPatient = customerId.length > 0;

  return (
    <main className="container max-w-4xl py-10 sm:py-12">
      <div className="mb-8 space-y-1">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Ortodoncia</h1>
        <p className="text-muted-foreground">Ficha, tratamiento, visitas y consentimiento</p>
      </div>

      {salonId === null ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tienes una clínica asignada.
          </CardContent>
        </Card>
      ) : !hasPatient ? (
        <PatientSelector
          salonId={salonId}
          hrefBase="/ortodoncia"
          purposeLabel="ver su ortodoncia"
        />
      ) : (
        <OrtodonciaView salonId={salonId} customerId={customerId} />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores. (Verificación visual real en Task 9.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ortodoncia/layout.tsx" "src/app/(dashboard)/ortodoncia/page.tsx" src/components/dental/ortodoncia-view.tsx
git commit -m "feat(ortodoncia): ruta /ortodoncia (layout + page + stub vista)"
```

---

