"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ImageOff, Loader2, Trash2 } from "lucide-react";

import { signImageUrls } from "@/app/(dashboard)/expediente/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDeletePatientImage } from "@/hooks/use-patient-images";
import { IMAGE_MODALITIES, IMAGE_MODALITY_LABELS } from "@/lib/dental/consents";
import type { ImageModality, PatientImage } from "@/types/database";

// ---------------------------------------------------------------------------
// ImageGallery — galería de imágenes/radiografías de un paciente. Componente
// CLIENTE: resuelve las URLs firmadas (`signImageUrls`) con un `useQuery`
// keyed por los paths a pintar, y llama a `useDeletePatientImage` (cada
// miniatura tiene su propio botón, mismo patrón que `PlanDetail`).
//
// El filtro de modalidad usa un `<select>` NATIVO (no el `Select` de shadcn/
// Radix): Radix Select depende de `scrollIntoView`/`hasPointerCapture`, que
// jsdom no implementa, así que un `<select>` nativo es el único control fiable
// de testear con Testing Library sin depender de polyfills adicionales.
// ---------------------------------------------------------------------------

export interface ImageGalleryProps {
  salonId: string;
  customerId: string;
  images: readonly PatientImage[];
}

const ALL_MODALITIES = "all" as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Path que se pinta para una imagen: preferentemente la miniatura, si existe. */
function displayPath(image: PatientImage): string {
  return image.thumbnail_path ?? image.storage_path;
}

export function ImageGallery({
  salonId,
  customerId,
  images,
}: ImageGalleryProps): React.ReactElement {
  const [modalityFilter, setModalityFilter] = useState<ImageModality | typeof ALL_MODALITIES>(
    ALL_MODALITIES,
  );
  const deleteMutation = useDeletePatientImage(salonId, customerId);
  const [actionError, setActionError] = useState<string | null>(null);

  const paths = useMemo(() => Array.from(new Set(images.map(displayPath))), [images]);

  const urlsQuery = useQuery({
    queryKey: ["patient-images", "signed-urls", salonId, customerId, paths],
    queryFn: async () => {
      const result = await signImageUrls(paths);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: paths.length > 0,
  });

  const urlByPath = urlsQuery.data ?? {};

  const filtered =
    modalityFilter === ALL_MODALITIES
      ? images
      : images.filter((img) => img.modality === modalityFilter);

  function handleDelete(imageId: string) {
    setActionError(null);
    deleteMutation.mutate(imageId, {
      onError: (err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Error al borrar la imagen.");
      },
    });
  }

  if (images.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <span
            aria-hidden="true"
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10"
          >
            <ImageOff className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium">Sin imágenes todavía</p>
          <p className="mt-1 max-w-[32ch] text-xs text-muted-foreground">
            Sube la primera radiografía o fotografía clínica de este paciente con «Subir imagen».
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="image-modality-filter" className="text-xs text-muted-foreground">
          Filtrar por modalidad
        </label>
        <select
          id="image-modality-filter"
          value={modalityFilter}
          onChange={(e) =>
            setModalityFilter(e.target.value as ImageModality | typeof ALL_MODALITIES)
          }
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm shadow-xs transition-[color,box-shadow,border-color] duration-150 ease-apple-out hover:border-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value={ALL_MODALITIES}>Todas las modalidades</option>
          {IMAGE_MODALITIES.map((modality) => (
            <option key={modality} value={modality}>
              {IMAGE_MODALITY_LABELS[modality]}
            </option>
          ))}
        </select>
      </div>

      {actionError !== null && (
        <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Ninguna imagen coincide con el filtro.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((image) => {
            const url = urlByPath[displayPath(image)];
            const modalityLabel = IMAGE_MODALITY_LABELS[image.modality];

            return (
              <Card key={image.id} className="overflow-hidden">
                <div className="flex aspect-square items-center justify-center bg-muted/30">
                  {url !== undefined ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL de Supabase Storage (bucket privado); next/image exigiría configurar remotePatterns dinámicos.
                    <img
                      src={url}
                      alt={modalityLabel}
                      className="h-full w-full object-cover"
                    />
                  ) : urlsQuery.isLoading ? (
                    <Loader2
                      className="h-5 w-5 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <ImageOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <CardContent className="space-y-1.5 p-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {modalityLabel}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Borrar imagen"
                      disabled={deleteMutation.isPending}
                      onClick={() => handleDelete(image.id)}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                    {image.fdi_code !== null && <span>Diente {image.fdi_code}</span>}
                    <span>{formatDate(image.created_at)}</span>
                  </div>
                  {image.note !== null && image.note !== "" && (
                    <p className="truncate text-[10px] text-muted-foreground" title={image.note}>
                      {image.note}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
