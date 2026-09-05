# Módulo Ortodoncia — Fase 3: radiografías/imágenes + subsecciones por tabs · Diseño

**Fecha:** 2026-08-11
**Sector:** odontología (Kairos)
**Rama:** `hat3x/HAT3X-038`
**Impulsora:** Nadia Ros (Clínica Dental Biodental)
**Depende de:** Fase 1 (sección `/ortodoncia`) y Fase 2 (plan de pago)
**Estado:** diseño aprobado, pendiente de plan de implementación

---

## 1. Contexto y objetivo

Nadia pidió, dentro de `/ortodoncia`, una carpeta para las radiografías de sus pacientes de
ortodoncia (cefalometrías, ortopantomografías). Además, la sección `/ortodoncia` ha crecido (ficha,
tratamiento, seguimiento de visitas, consentimiento, plan de pago) y es un scroll largo; Nadia quiere
**no tener que bajar hasta abajo**, así que se reorganiza en subsecciones navegables por **botones
(tabs)**.

Kairos ya tiene toda la infra de imágenes de paciente (`patient_images` + bucket privado
`patient-media` + subida/firma/borrado + galería + hooks), y el enum `image_modality` **ya incluye**
`cefalometrica`, `panoramic` (ortopantomografía) y `foto_intraoral`. Por eso esta fase es sobre todo
**reutilizar y reorganizar**, **sin migración**.

## 2. Alcance

### Dentro de Fase 3
- **A) Reestructurar `/ortodoncia` en subsecciones por botones (tabs).**
- **B) Subsección "Radiografías e imágenes"** (reutiliza la infra de `patient_images`).
- **C) Soporte de PDF** en la subida y en la galería.
- **D) Extraer `UploadImageForm`** a un componente compartido (Expediente + Ortodoncia).
- **E) Reorganizar `/ajustes/horarios` en tabs** (mismo patrón; el horario por profesional queda
  oculto debajo del de la clínica y no se descubre).

### Fuera de Fase 3 (siguientes)
- Agrupación por "estudios"/etapas como carpetas reales (inicial/progreso/final) — requiere modelo de
  agrupación nuevo.
- DICOM (binario), miniaturas de PDF, trazado/análisis cefalométrico.

## 3. A) Reestructura de `/ortodoncia` en tabs

`src/components/dental/ortodoncia-view.tsx` pasa de un `<div className="space-y-6">` con todos los
bloques apilados a un layout con **barra de botones (pills/segmented)** arriba + contenido de la
subsección activa (estado local `activeTab`, sin cambiar de ruta). Tabs (en orden):

1. **Ficha y tratamiento** (default) — la ficha ortho + el tratamiento + el botón "Guardar ficha y
   tratamiento". Van juntas porque se **guardan como una unidad** (`clinical_records.data.ortho`); el
   estado (`ficha`, `treatment`) y el `useSaveOrthoData` siguen viviendo en el nivel del view — solo
   cambia la presentación a una pestaña.
2. **Seguimiento** — el `OrthoVisitsCard` (timeline de visitas) existente.
3. **Consentimiento** — el bloque de consentimiento (reuso de `ConsentList` + crear) existente.
4. **Plan de pago** — el `OrthoPaymentPlanCard` (Fase 2) existente.
5. **Radiografías** — el nuevo `OrthoImagingCard` (sección B).

Estilo: reutilizar el patrón de botones-pill que ya existe en el repo (p. ej. el conmutador de vista
día/semana/mes de `appointments-view.tsx`). Accesible (aria-selected/rol), responsive (los botones
hacen wrap en móvil). **UI con `ui-ux-pro-max`.**

## 4. B) Subsección "Radiografías e imágenes"

Nuevo componente cliente `src/components/dental/ortho-imaging-card.tsx`, props `{ salonId: string;
customerId: string }`. Reutiliza SIN cambios de backend:
- Hooks `usePatientImages`, `useUploadPatientImage`, `useDeletePatientImage` (`@/hooks/use-patient-images`).
- Componentes `ImageGallery` (`@/components/dental/image-gallery`) y `UploadImageForm` (compartido, ver D).

Contenido: formulario de subida (tipo = `modality`, fecha opcional, nota) + galería del paciente
**filtrable por tipo** (la galería ya trae el filtro por `modality`). Nadia sube cefalometrías,
ortopantomografías y fotos intraorales (todas ya son valores de `modality`).

Gate/seguridad (reutilizado, sin tocar): la subida pasa por `uploadPatientImage`
(`assertExpedienteAccess`: sector odontología + roles owner/manager/staff); la lectura usa URLs
firmadas (`signImageUrls`, TTL 1h); la RLS del bucket acota por el primer segmento del path
(`{salon_id}/…`). **No se toca el backend de imágenes salvo lo del PDF (sección C).**

## 5. C) Soporte de PDF

Muchas cefalometrías/ortopantomografías se exportan/comparten en PDF. Hoy la subida acepta solo
`image/png|jpeg|webp` (15 MiB). Cambios:

- **Subida** (`src/app/(dashboard)/expediente/actions.ts`): añadir `application/pdf` al allowlist
  (`ALLOWED_IMAGE_MIME_TYPES`), subir `MAX_IMAGE_BYTES` a **25 MiB**, y mapear la extensión en
  `imageExtensionForMime` (`application/pdf` → `"pdf"`). (El prefijo `IMAGE_` queda impreciso; se
  puede renombrar a `ALLOWED_UPLOAD_*` de forma opcional sin romper llamadas.)
- **Galería** (`src/components/dental/image-gallery.tsx`): cuando la imagen es PDF (`mime ===
  "application/pdf"`, con fallback a que el `storage_path` termine en `.pdf`), en vez del `<img>`
  (que quedaría roto) renderizar una **tarjeta con icono de documento + botón "Abrir"** que abre la
  URL firmada en **pestaña nueva** (`<a target="_blank" rel="noopener noreferrer">`). **Sin
  miniatura de PDF.** El resto de la celda (badge de modalidad, fecha, nota, borrar) igual.
- **UploadImageForm**: el `<input accept>` incluye `application/pdf`.

Esto mejora también el Expediente (usa la misma subida y galería).

## 6. D) Extraer `UploadImageForm` a componente compartido

Hoy `UploadImageForm` es un componente **privado** dentro de `expediente-workspace.tsx`. Se extrae a
`src/components/dental/upload-image-form.tsx` (exportado), con props `{ salonId: string; customerId:
string; defaultModality?: ImageModality }`. Consumidores: `expediente-workspace.tsx` (importa el
compartido en vez del privado) y `ortho-imaging-card.tsx`. DRY, sin duplicar el formulario.

## 6-E. E) Reorganizar `/ajustes/horarios` en tabs

Mismo problema de discoverability que en `/ortodoncia`: hoy `src/app/(dashboard)/ajustes/horarios/
horarios-view.tsx` pinta la card **"Horario de la clínica"** arriba (`SalonScheduleEditor`) y, DEBAJO,
el selector de profesional + **"Horario semanal"** (`ScheduleEditor`) + **"Excepciones"**
(`ExceptionsEditor`). Nadia no baja y cree que no hay horarios por profesional. Fix: misma barra de
botones (pills), **2 tabs**:

1. **Horario de la clínica** (default) — la card con `SalonScheduleEditor`.
2. **Horarios por profesional** — el selector de profesional + `ScheduleEditor` + `ExceptionsEditor`
   (todo lo que hoy está debajo). El selector y su lógica (`useProfessionals`, auto-selección del
   primero) se mueven a esta pestaña.

Estado local `activeTab`. **Sin cambios de backend.** Reutiliza el **mismo componente/patrón de tabs
que la sección A**: para no duplicar, se extrae un componente pequeño y reutilizable de barra de
pestañas-pill (p. ej. `src/components/ui/pill-tabs.tsx`, cliente, props `{ tabs: {id,label}[];
active; onChange }`) usado por `/ortodoncia` (A) y por `/ajustes/horarios` (E). Accesible
(`role="tablist"`/`aria-selected`), responsive (wrap en móvil). **UI con `ui-ux-pro-max`.**

## 7. Capas técnicas y despliegue

- **Sin migración:** las modalidades ya existen; el PDF no cambia el schema; el límite de tamaño es
  a nivel de app (el bucket no tiene `file_size_limit` por-fichero). Deploy **sin paso de SQL**.
- **Testing:** unit test de la validación de subida (acepta `application/pdf` + extensión `.pdf`;
  sigue rechazando tipos no permitidos; respeta el nuevo límite). El resto (tabs, galería con PDF) se
  valida con `tsc` 0 + comprobación visual.
- **UI con `ui-ux-pro-max`** en las tareas de UI (tabs de `/ortodoncia` + `OrthoImagingCard`).
- Rama `hat3x/HAT3X-038`. Deploy a `kairosmanager.app` por la API REST de Vercel al terminar.

## 8. Criterios de éxito

1. En `/ortodoncia`, una barra de botones conmuta entre **Ficha y tratamiento / Seguimiento /
   Consentimiento / Plan de pago / Radiografías** sin scroll largo.
2. En **Radiografías**, Nadia sube una cefalometría/ortopantomografía (imagen o PDF) y la ve en la
   galería filtrable por tipo; puede **abrir el PDF** en pestaña nueva y **borrar**.
3. La subida respeta el gate (odontología + owner/manager/staff) y la RLS del bucket (acotado a
   Biodental; sin fugas entre tenants).
4. El **Expediente sigue funcionando igual** (usa el `UploadImageForm` compartido y ahora también
   acepta PDF).
5. En `/ajustes/horarios`, un botón **"Horarios por profesional"** lleva directo al selector +
   horario semanal + excepciones (ya no queda oculto debajo del horario de la clínica).
6. `tsc` 0, suite verde, build OK.
