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

