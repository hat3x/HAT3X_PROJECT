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
