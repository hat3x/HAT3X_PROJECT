# Módulo Ortodoncia — Fase 3 (radiografías/imágenes + tabs) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar `/ortodoncia` y `/ajustes/horarios` en subsecciones por botones (pill-tabs), añadir una subsección "Radiografías e imágenes" en ortodoncia reutilizando la infra de `patient_images`, y soportar PDF en la subida/galería.

**Architecture:** Reutiliza al máximo lo existente (tabla `patient_images`, bucket `patient-media`, acciones `uploadPatientImage`/`signImageUrls`/`deletePatientImage`, `ImageGallery`, hooks `use-patient-images`). Se extrae un componente reutilizable `PillTabs` y el `UploadImageForm` (hoy privado) a compartido. **Sin migración** (las modalidades `cefalometrica`/`panoramic`/`foto_intraoral` ya existen; el PDF no cambia el schema).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase Storage, TanStack Query v5, Vitest, Tailwind + shadcn/ui.

## Global Constraints

- Rama `hat3x/HAT3X-038` (repo `clients/projects/salon-os`).
- **RSC boundary** ([[reference_salonos_rsc_boundary]]): componentes cliente NUNCA importan de `@/lib/salon`; `salonId` llega por prop.
- **Sin migración** ni pasos de SQL — deploy directo.
- Subida gateada por `assertExpedienteAccess` (sector odontología + owner/manager/staff, ya existente); RLS del bucket por `{salon_id}/…` (ya existente). No se toca el gate ni la RLS.
- **UI con `ui-ux-pro-max`**: las tareas de UI marcadas DEBEN invocar la skill `ui-ux-pro-max` antes de escribir el componente (tabs + tarjeta de imágenes). Estados loading/empty/error, responsive, accesible.
- Verde: `npx tsc --noEmit` = 0 y suite Vitest completa antes de desplegar.
- Deploy a `kairosmanager.app` por `scratchpad/deploy_kairos.js` (Vercel REST).

---

### Task 1: Componente reutilizable `PillTabs`

**Files:**
- Create: `src/components/ui/pill-tabs.tsx`

**Interfaces:**
- Produces: `PillTab` (`{ id: string; label: string }`), `PillTabsProps`, componente `PillTabs`.

- [ ] **Step 1: Implementar**

```tsx
// src/components/ui/pill-tabs.tsx
"use client";

import { cn } from "@/lib/utils";

export interface PillTab {
  id: string;
  label: string;
}

export interface PillTabsProps {
  tabs: readonly PillTab[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Barra de pestañas tipo "pill" (botones redondeados). Mismo patrón visual que el
 * conmutador día/semana/mes de la agenda. Conmuta subsecciones sin cambiar de ruta.
 */
export function PillTabs({
  tabs,
  active,
  onChange,
  ariaLabel,
  className,
}: PillTabsProps): React.ReactElement {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ease-apple-out",
            active === tab.id
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → 0 errores.
- [ ] **Step 3: Commit**

```bash
git add src/components/ui/pill-tabs.tsx
git commit -m "feat(ui): componente reutilizable PillTabs"
```

---

### Task 2: Soporte PDF en la acción de subida

**Files:**
- Modify: `src/app/(dashboard)/expediente/actions.ts`

**Interfaces:**
- Produces: la acción `uploadPatientImage` acepta `application/pdf` (hasta 25 MiB) y lo guarda con extensión `.pdf`. Firmas públicas sin cambios.

- [ ] **Step 1: Ampliar allowlist, límite y extensión**

En `src/app/(dashboard)/expediente/actions.ts`:

1. Allowlist (línea ~54):
```ts
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
```
2. Límite (línea ~58):
```ts
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MiB
```
3. `imageExtensionForMime` (switch ~293): añadir el caso PDF antes del `default`:
```ts
    case "application/pdf":
      return "pdf";
```
4. Mensajes de error (dentro de `uploadPatientImage`, ~331-342): hacerlos genéricos (ya no solo "imagen"):
```ts
    return { ok: false, error: "Selecciona un archivo." };
```
```ts
      error: `Formato no admitido. Usa: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}.`,
```
```ts
    return { ok: false, error: "El archivo supera el tamaño máximo de 25 MiB." };
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → 0 errores.

- [ ] **Step 3: Verificación de aceptación (si hay test de la acción)**

Buscar un test existente de `uploadPatientImage`: `git ls-files "src/tests/**" | xargs grep -l "uploadPatientImage" 2>/dev/null`. Si existe, añadir un caso que compruebe que `application/pdf` YA no es rechazado por el allowlist (mock del File con `type:"application/pdf"`, tamaño < 25 MiB) y que un tipo no admitido (`image/gif`) sigue rechazándose. Si NO existe test de esa acción (validación interna no exportable desde un fichero `"use server"`), NO crear andamiaje: basta `tsc` + la verificación manual de la Task 8. Anotarlo en el commit/report.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/expediente/actions.ts"
git commit -m "feat(imagenes): aceptar PDF en la subida (25 MiB)"
```

---

### Task 3: Extraer `UploadImageForm` a componente compartido (con PDF)

**Files:**
- Create: `src/components/dental/upload-image-form.tsx`
- Modify: `src/components/dental/expediente-workspace.tsx` (borrar el `UploadImageForm` privado y su `IMAGE_ACCEPT`; importar el compartido)

**Interfaces:**
- Consumes: `useUploadPatientImage` (`@/hooks/use-patient-images`); `IMAGE_MODALITIES`, `IMAGE_MODALITY_LABELS` (`@/lib/dental/consents`); `ImageModality` (`@/types/database`).
- Produces: componente `UploadImageForm` con props `{ salonId: string; customerId: string; defaultModality?: ImageModality }`.

- [ ] **Step 1: Crear el componente compartido** (copia del privado actual + `application/pdf` en accept + prop `defaultModality`)

```tsx
// src/components/dental/upload-image-form.tsx
"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUploadPatientImage } from "@/hooks/use-patient-images";
import { IMAGE_MODALITIES, IMAGE_MODALITY_LABELS } from "@/lib/dental/consents";
import type { ImageModality } from "@/types/database";

export interface UploadImageFormProps {
  salonId: string;
  customerId: string;
  /** Modalidad preseleccionada (p. ej. "cefalometrica" en la sección de ortodoncia). */
  defaultModality?: ImageModality;
}

const UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

export function UploadImageForm({
  salonId,
  customerId,
  defaultModality = "periapical",
}: UploadImageFormProps): React.ReactElement {
  const uploadMutation = useUploadPatientImage(salonId, customerId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modality, setModality] = useState<ImageModality>(defaultModality);
  const [fdiCode, setFdiCode] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (file === null) {
      setError("Selecciona un archivo.");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    formData.set("customerId", customerId);
    formData.set("modality", modality);
    const trimmedFdi = fdiCode.trim();
    if (trimmedFdi !== "") formData.set("fdiCode", trimmedFdi);
    const trimmedNote = note.trim();
    if (trimmedNote !== "") formData.set("note", trimmedNote);

    uploadMutation.mutate(formData, {
      onSuccess: () => {
        setFile(null);
        setFdiCode("");
        setNote("");
        if (fileInputRef.current !== null) fileInputRef.current.value = "";
      },
      onError: (err: unknown) => {
        setError(err instanceof Error ? err.message : "Error al subir el archivo.");
      },
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Subir archivo</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor="image-file">Archivo (imagen o PDF)</Label>
            <input
              ref={fileInputRef}
              id="image-file"
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-foreground hover:file:bg-accent/80"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="image-modality">Modalidad</Label>
              <Select value={modality} onValueChange={(v) => setModality(v as ImageModality)}>
                <SelectTrigger id="image-modality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODALITIES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {IMAGE_MODALITY_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="image-fdi">Diente (FDI, opcional)</Label>
              <Input
                id="image-fdi"
                inputMode="numeric"
                value={fdiCode}
                onChange={(e) => setFdiCode(e.target.value)}
                placeholder="Ej. 11"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="image-note">Nota (opcional)</Label>
            <Input
              id="image-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. registro inicial de ortodoncia"
            />
          </div>

          {error !== null && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <Button type="submit" size="sm" disabled={uploadMutation.isPending} className="gap-1.5">
            {uploadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Subir archivo
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Actualizar `expediente-workspace.tsx`**

Borrar el `UploadImageForm` privado (bloque `function UploadImageForm(...) { … }`, ~líneas 322-466), su `interface UploadImageFormProps`, la constante `const IMAGE_ACCEPT = …`, y los imports que dejen de usarse EN ESE FICHERO (p. ej. `Upload`, `useRef`, `ChangeEvent`, `FormEvent`, `Select*` si ya no se usan — comprobar; `useUploadPatientImage` deja de usarse aquí). Añadir el import del compartido:
```ts
import { UploadImageForm } from "@/components/dental/upload-image-form";
```
El uso de `<UploadImageForm salonId={salonId} customerId={customerId} />` en la pestaña "Imágenes" queda igual.

- [ ] **Step 3: Typecheck** — Run: `npx tsc --noEmit` → 0 errores. (Vigila imports huérfanos: TS strict + el lint del repo fallan con imports sin usar.)
- [ ] **Step 4: Commit**

```bash
git add src/components/dental/upload-image-form.tsx src/components/dental/expediente-workspace.tsx
git commit -m "refactor(imagenes): UploadImageForm compartido (+PDF, defaultModality)"
```

---

### Task 4: Render de PDF en `ImageGallery`

**Files:**
- Modify: `src/components/dental/image-gallery.tsx`

**Interfaces:**
- Produces: la galería muestra los PDF como tarjeta con botón "Abrir" (pestaña nueva) en vez de `<img>` roto. Props sin cambios.

- [ ] **Step 1: Añadir detección + celda de PDF**

En `src/components/dental/image-gallery.tsx`:

1. Import del icono (junto a los otros de `lucide-react`): añadir `FileText` y `ExternalLink`.
2. Helper (junto a `displayPath`, ~línea 46):
```ts
function isPdf(image: PatientImage): boolean {
  return image.mime === "application/pdf" || image.storage_path.toLowerCase().endsWith(".pdf");
}
```
3. En el `.map` de `filtered` (~línea 142), reemplazar SOLO el contenedor del thumbnail (`<div className="flex aspect-square …">…</div>`, ~líneas 148-164) por una rama que distingue PDF:
```tsx
                <div className="flex aspect-square items-center justify-center bg-muted/30">
                  {isPdf(image) ? (
                    url !== undefined ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <FileText className="h-8 w-8" aria-hidden="true" />
                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                          Abrir PDF <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </a>
                    ) : urlsQuery.isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    )
                  ) : url !== undefined ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL de Supabase Storage (bucket privado); next/image exigiría configurar remotePatterns dinámicos.
                    <img src={url} alt={modalityLabel} className="h-full w-full object-cover" />
                  ) : urlsQuery.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ImageOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → 0 errores.
- [ ] **Step 3: Comprobar tests existentes de la galería**

Si hay test de `ImageGallery` (`git ls-files "src/tests/**" | xargs grep -l "ImageGallery" 2>/dev/null`), ejecutarlo (`npx vitest run <ruta>`) y confirmar que sigue verde (el cambio es aditivo para no-PDF). Si un test asume que siempre hay `<img>`, ajustarlo solo si el cambio lo rompe.

- [ ] **Step 4: Commit**

```bash
git add src/components/dental/image-gallery.tsx
git commit -m "feat(imagenes): galeria muestra PDF como 'Abrir' (pestana nueva)"
```

---

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

### Task 8: Verificación integral + despliegue

- [ ] **Step 1: Typecheck** — Run: `npx tsc --noEmit` → 0 errores.
- [ ] **Step 2: Suite completa** — Run: `npx vitest run` → todo verde (sin regresiones; especialmente expediente/galería).
- [ ] **Step 3: Build** — Run: `npm run build` → exit 0; `/ortodoncia`, `/expediente`, `/ajustes` presentes.
- [ ] **Step 4: Deploy** — `node scratchpad/deploy_kairos.js` (Vercel REST) → esperar READY → verificar en `https://kairosmanager.app`: tabs de ortodoncia y horarios, subir una radiografía (imagen y PDF) y abrir el PDF.

---

## Self-Review (cobertura del spec)

- **A) Tabs en `/ortodoncia`** (spec §3) → Task 1 (PillTabs) + Task 6. ✔
- **B) Subsección Radiografías** (spec §4) → Task 5 (OrthoImagingCard, reusa hooks/galería/form) + montaje en Task 6. ✔
- **C) Soporte PDF** (spec §5) → Task 2 (acción) + Task 3 (accept del form) + Task 4 (galería). ✔
- **D) Extraer `UploadImageForm`** (spec §6) → Task 3. ✔
- **E) Tabs en `/ajustes/horarios`** (spec §6-E) → Task 1 (PillTabs) + Task 7. ✔
- **Sin migración** (spec §7) → ninguna tarea toca la BD. ✔
- **UI con ui-ux-pro-max** (spec §7) → Tasks 5,6,7 (invocación obligatoria). ✔
- **Reutiliza gate + RLS del bucket** → no se tocan (Task 2 solo amplía el allowlist/límite). ✔
- **tsc 0 + suite verde + deploy** (spec §8) → Task 8. ✔

**Consistencia de tipos:** `PillTab`/`PillTabs` (Task 1) usados en Tasks 6,7; `UploadImageForm` con prop `defaultModality` (Task 3) usado en Task 5 y en expediente-workspace; `OrthoImagingCard` (Task 5) montado en Task 6; `isPdf`/`FileText`/`ExternalLink` locales a Task 4.
