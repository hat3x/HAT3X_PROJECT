"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronLeft,
  FolderOpen,
  Loader2,
  PlusCircle,
  Upload,
} from "lucide-react";

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
import { useConsents, useCreateConsent } from "@/hooks/use-consents";
import { usePatientImages, useUploadPatientImage } from "@/hooks/use-patient-images";
import {
  CONSENT_TYPES,
  CONSENT_TYPE_LABELS,
  IMAGE_MODALITIES,
  IMAGE_MODALITY_LABELS,
  getConsentTemplate,
} from "@/lib/dental/consents";
import { cn } from "@/lib/utils";
import type { ConsentType, ImageModality } from "@/types/database";
import { ConsentList } from "./consent-list";
import { ImageGallery } from "./image-gallery";

// ---------------------------------------------------------------------------
// ExpedienteWorkspace — orquesta las dos pestañas del expediente clínico
// (Consentimientos / Imágenes) para un paciente concreto. Componente CLIENTE:
// toda la carga de datos pasa por los hooks de React Query de
// `use-consents.ts`/`use-patient-images.ts`. Mismo patrón estructural que
// `PlanWorkspace`/`PerioWorkspace` (header + secciones + formularios inline).
//
// Pestañas: la app no tiene instalado `@radix-ui/react-tabs` (no aparece en
// package.json ni existe `@/components/ui/tabs`), así que se implementan como
// un toggle simple de botones con `role="tablist"`/`role="tab"`, sin depender
// de una librería nueva.
// ---------------------------------------------------------------------------

export interface ExpedienteWorkspaceProps {
  salonId: string;
  customerId: string;
}

type ExpedienteTab = "consentimientos" | "imagenes";

const TABS: readonly { id: ExpedienteTab; label: string }[] = [
  { id: "consentimientos", label: "Consentimientos" },
  { id: "imagenes", label: "Imágenes" },
];

export function ExpedienteWorkspace({
  salonId,
  customerId,
}: ExpedienteWorkspaceProps): React.ReactElement {
  const [tab, setTab] = useState<ExpedienteTab>("consentimientos");

  const consentsQuery = useConsents(salonId, customerId);
  const imagesQuery = usePatientImages(salonId, customerId);

  return (
    <div className="space-y-4">
      {/* Header: icono + enlace para cambiar de paciente */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground"
          >
            <FolderOpen className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-medium text-muted-foreground">Expediente clínico</h2>
        </div>
        <Link
          href="/expediente"
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Cambiar paciente
        </Link>
      </div>

      {/* Pestañas */}
      <div
        role="tablist"
        aria-label="Secciones del expediente"
        className="inline-flex rounded-lg border border-border/70 bg-muted/30 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-apple-out",
              tab === t.id
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "consentimientos" ? (
        <div className="space-y-4">
          {consentsQuery.isLoading ? (
            <p className="px-1 text-xs text-muted-foreground">Cargando consentimientos…</p>
          ) : consentsQuery.isError ? (
            <p className="px-1 text-xs text-destructive">Error al cargar los consentimientos.</p>
          ) : (
            <ConsentList
              salonId={salonId}
              customerId={customerId}
              consents={consentsQuery.data ?? []}
            />
          )}
          <NewConsentForm salonId={salonId} customerId={customerId} />
        </div>
      ) : (
        <div className="space-y-4">
          {imagesQuery.isLoading ? (
            <p className="px-1 text-xs text-muted-foreground">Cargando imágenes…</p>
          ) : imagesQuery.isError ? (
            <p className="px-1 text-xs text-destructive">Error al cargar las imágenes.</p>
          ) : (
            <ImageGallery
              salonId={salonId}
              customerId={customerId}
              images={imagesQuery.data ?? []}
            />
          )}
          <UploadImageForm salonId={salonId} customerId={customerId} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewConsentForm — crea un consentimiento a partir de la plantilla del tipo
// elegido. El título es editable; el cuerpo se muestra (vista previa de la
// plantilla) pero no se edita aquí, así que no se envía y el servidor usa el
// texto por defecto de `getConsentTemplate(type)` (misma fuente que la vista previa).
// ---------------------------------------------------------------------------

interface NewConsentFormProps {
  salonId: string;
  customerId: string;
}

function NewConsentForm({ salonId, customerId }: NewConsentFormProps): React.ReactElement {
  const createMutation = useCreateConsent(salonId, customerId);

  const [type, setType] = useState<ConsentType>("general");
  const [title, setTitle] = useState<string>(getConsentTemplate("general").title);
  const [fdiCode, setFdiCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const template = getConsentTemplate(type);

  function handleTypeChange(value: string) {
    const nextType = value as ConsentType;
    setType(nextType);
    setTitle(getConsentTemplate(nextType).title);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedFdi = fdiCode.trim();
    let parsedFdi: number | null = null;
    if (trimmedFdi !== "") {
      parsedFdi = Number(trimmedFdi);
      if (!Number.isFinite(parsedFdi)) {
        setError("El código FDI del diente no es válido.");
        return;
      }
    }

    const trimmedTitle = title.trim();

    createMutation.mutate(
      {
        customerId,
        type,
        title: trimmedTitle === "" ? undefined : trimmedTitle,
        fdiCode: parsedFdi,
      },
      {
        onSuccess: () => {
          setFdiCode("");
        },
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : "Error al crear el consentimiento.");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Nuevo consentimiento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="consent-type">Tipo</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger id="consent-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSENT_TYPES.map((consentType) => (
                    <SelectItem key={consentType} value={consentType}>
                      {CONSENT_TYPE_LABELS[consentType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="consent-fdi">Diente (FDI, opcional)</Label>
              <Input
                id="consent-fdi"
                inputMode="numeric"
                value={fdiCode}
                onChange={(e) => setFdiCode(e.target.value)}
                placeholder="Ej. 11"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="consent-title">Título</Label>
            <Input id="consent-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Texto (plantilla del tipo elegido)</Label>
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/20 p-2 text-xs text-muted-foreground">
              {template.body}
            </p>
          </div>

          {error !== null && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={createMutation.isPending}
            className="gap-1.5"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Crear consentimiento
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// UploadImageForm — construye el FormData que espera `uploadPatientImage`
// (vía `useUploadPatientImage`), mismo patrón de manejo de archivo que
// `SalonMarcaForm` (`ajustes/marca/salon-marca-form.tsx`), pero aquí el hook
// recibe el FormData completo, no un `File` suelto.
// ---------------------------------------------------------------------------

interface UploadImageFormProps {
  salonId: string;
  customerId: string;
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

function UploadImageForm({ salonId, customerId }: UploadImageFormProps): React.ReactElement {
  const uploadMutation = useUploadPatientImage(salonId, customerId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modality, setModality] = useState<ImageModality>("periapical");
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
      setError("Selecciona un archivo de imagen.");
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
        setError(err instanceof Error ? err.message : "Error al subir la imagen.");
      },
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Subir imagen</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor="image-file">Archivo</Label>
            <input
              ref={fileInputRef}
              id="image-file"
              type="file"
              accept={IMAGE_ACCEPT}
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-foreground hover:file:bg-accent/80"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="image-modality">Modalidad</Label>
              <Select
                value={modality}
                onValueChange={(v) => setModality(v as ImageModality)}
              >
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
              placeholder="Ej. control post-endodoncia"
            />
          </div>

          {error !== null && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={uploadMutation.isPending}
            className="gap-1.5"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Subir imagen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
