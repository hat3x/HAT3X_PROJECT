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

