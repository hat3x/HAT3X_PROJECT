### Task 5: `OrthoImagingCard` (subsección Radiografías) — UI con ui-ux-pro-max

**Files:**
- Create: `src/components/dental/ortho-imaging-card.tsx`

**Interfaces:**
- Consumes: `usePatientImages` (`@/hooks/use-patient-images`); `UploadImageForm` (Task 3); `ImageGallery` (`@/components/dental/image-gallery`).
- Produces: componente `OrthoImagingCard` con props `{ salonId: string; customerId: string }`.

> **OBLIGATORIO:** invoca `ui-ux-pro-max` antes de escribir el componente. El bloque de abajo es la referencia de cableado — mantén la lógica (hooks/props) y eleva la presentación (encabezado, estados, espaciado). RSC boundary: no importes `@/lib/salon`.

- [ ] **Step 1: Implementar** (referencia — elevar con ui-ux-pro-max)

```tsx
// src/components/dental/ortho-imaging-card.tsx
"use client";

import { ImageGallery } from "@/components/dental/image-gallery";
import { UploadImageForm } from "@/components/dental/upload-image-form";
import { Skeleton } from "@/components/ui/skeleton";
import { usePatientImages } from "@/hooks/use-patient-images";

export interface OrthoImagingCardProps {
  salonId: string;
  customerId: string;
}

export function OrthoImagingCard({
  salonId,
  customerId,
}: OrthoImagingCardProps): React.ReactElement {
  const imagesQuery = usePatientImages(salonId, customerId);

  return (
    <div className="space-y-4">
      <UploadImageForm
        salonId={salonId}
        customerId={customerId}
        defaultModality="cefalometrica"
      />
      {imagesQuery.isPending ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : imagesQuery.isError ? (
        <p className="text-sm text-destructive">
          {(imagesQuery.error as Error).message}
        </p>
      ) : (
        <ImageGallery
          salonId={salonId}
          customerId={customerId}
          images={imagesQuery.data ?? []}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → 0 errores.
- [ ] **Step 3: Commit**

```bash
git add src/components/dental/ortho-imaging-card.tsx
git commit -m "feat(ortodoncia): OrthoImagingCard (radiografias, ui-ux-pro-max)"
```

---

