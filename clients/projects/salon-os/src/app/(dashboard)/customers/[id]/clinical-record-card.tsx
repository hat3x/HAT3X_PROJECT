"use client";

import { useState, type KeyboardEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPlus,
  Pencil,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useClinicalRecord,
  useSaveClinicalRecord,
} from "@/hooks/use-clinical-record";
import { formatDate } from "@/lib/format";
import type { ClinicalRecord } from "@/types/database";

// ---------------------------------------------------------------------------
// Tag input
// ---------------------------------------------------------------------------

interface TagInputProps {
  id: string;
  tags: string[];
  placeholder: string;
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

function TagInput({ id, tags, placeholder, onChange, disabled }: TagInputProps) {
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (value !== "" && !tags.includes(value)) {
      onChange([...tags, value]);
    }
    setDraft("");
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
        >
          {tag}
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="ml-0.5 rounded-full hover:text-destructive"
              aria-label={`Eliminar ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
      {!disabled ? (
        <input
          id={id}
          className="min-w-[140px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          placeholder={tags.length === 0 ? placeholder : ""}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only tag list
// ---------------------------------------------------------------------------

function TagList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <span className="text-sm text-muted-foreground">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="secondary">
          {item}
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit form values
// ---------------------------------------------------------------------------

interface FormValues {
  allergies: string[];
  contraindications: string[];
  medications: string[];
  skin_hair_type: string;
  medical_notes: string;
}

function toFormValues(record: ClinicalRecord | null): FormValues {
  return {
    allergies: record?.allergies ?? [],
    contraindications: record?.contraindications ?? [],
    medications: record?.medications ?? [],
    skin_hair_type: record?.skin_hair_type ?? "",
    medical_notes: record?.medical_notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Edit form component
// ---------------------------------------------------------------------------

interface ClinicalRecordFormProps {
  defaultValues: FormValues;
  pending: boolean;
  error: string | null;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
}

function ClinicalRecordForm({
  defaultValues,
  pending,
  error,
  onSubmit,
  onCancel,
}: ClinicalRecordFormProps) {
  const [values, setValues] = useState<FormValues>(defaultValues);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="grid gap-5"
    >
      <div className="grid gap-2">
        <Label htmlFor="allergies">Alergias conocidas</Label>
        <TagInput
          id="allergies"
          tags={values.allergies}
          placeholder="Ej. penicilina — Enter para añadir"
          onChange={(tags) => update("allergies", tags)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Escribe cada ítem y pulsa Enter o coma.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contraindications">Contraindicaciones</Label>
        <TagInput
          id="contraindications"
          tags={values.contraindications}
          placeholder="Ej. implantes metálicos — Enter para añadir"
          onChange={(tags) => update("contraindications", tags)}
          disabled={pending}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="medications">Medicación actual</Label>
        <TagInput
          id="medications"
          tags={values.medications}
          placeholder="Ej. ibuprofeno 400 mg — Enter para añadir"
          onChange={(tags) => update("medications", tags)}
          disabled={pending}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="skin_hair_type">Tipo de piel / cabello</Label>
        <Input
          id="skin_hair_type"
          value={values.skin_hair_type}
          onChange={(e) => update("skin_hair_type", e.target.value)}
          placeholder="Ej. sensible, graso, mixto…"
          disabled={pending}
          maxLength={200}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="medical_notes">Notas médicas</Label>
        <Textarea
          id="medical_notes"
          value={values.medical_notes}
          onChange={(e) => update("medical_notes", e.target.value)}
          placeholder="Antecedentes relevantes, observaciones clínicas…"
          disabled={pending}
          rows={4}
          maxLength={4000}
        />
      </div>

      {error !== null ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ficha"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Public card component
// ---------------------------------------------------------------------------

interface ClinicalRecordCardProps {
  salonId: string;
  customerId: string;
}

export function ClinicalRecordCard({
  salonId,
  customerId,
}: ClinicalRecordCardProps) {
  const [editOpen, setEditOpen] = useState(false);

  const query = useClinicalRecord(salonId, customerId);
  const mutation = useSaveClinicalRecord(salonId, customerId);

  const record = query.data ?? null;

  function handleSubmit(values: FormValues) {
    mutation.mutate(values, { onSuccess: () => setEditOpen(false) });
  }

  return (
    <>
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ClipboardPlus className="h-4 w-4 text-muted-foreground" />
              Ficha clínica
            </CardTitle>
            <CardDescription>
              Datos de salud del paciente (categoría especial RGPD Art. 9).
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={query.isPending}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            {record === null ? "Crear ficha" : "Editar"}
          </Button>
        </CardHeader>

        <CardContent>
          {query.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid gap-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          ) : query.isError ? (
            <p className="py-4 text-center text-sm text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "Error al cargar la ficha clínica"}
            </p>
          ) : record === null ? (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
                <ClipboardPlus className="h-5 w-5" />
              </span>
              <p className="font-medium">Sin ficha clínica todavía</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Crea la ficha del paciente para registrar alergias,
                contraindicaciones y medicación.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Consentimiento RGPD */}
              <div className="sm:col-span-2">
                {record.consent_signed_at !== null ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Consentimiento firmado el{" "}
                    {formatDate(record.consent_signed_at)}
                    {record.consent_version !== null
                      ? ` · versión ${record.consent_version}`
                      : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Consentimiento Art. 9 RGPD pendiente de firma
                  </span>
                )}
              </div>

              {/* Alergias */}
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Alergias
                </p>
                <TagList
                  items={record.allergies}
                  empty="Sin alergias registradas"
                />
              </div>

              {/* Contraindicaciones */}
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contraindicaciones
                </p>
                <TagList
                  items={record.contraindications}
                  empty="Sin contraindicaciones"
                />
              </div>

              {/* Medicación */}
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Medicación actual
                </p>
                <TagList
                  items={record.medications}
                  empty="Sin medicación registrada"
                />
              </div>

              {/* Tipo de piel/cabello */}
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tipo de piel / cabello
                </p>
                {record.skin_hair_type !== null ? (
                  <p className="text-sm">{record.skin_hair_type}</p>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No especificado
                  </span>
                )}
              </div>

              {/* Notas médicas */}
              {record.medical_notes !== null && record.medical_notes !== "" ? (
                <div className="grid gap-2 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Notas médicas
                  </p>
                  <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
                    {record.medical_notes}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {record === null ? "Nueva ficha clínica" : "Editar ficha clínica"}
            </DialogTitle>
            <DialogDescription>
              Datos de salud del paciente. Actualiza en cada visita relevante.
            </DialogDescription>
          </DialogHeader>
          <ClinicalRecordForm
            defaultValues={toFormValues(record)}
            pending={mutation.isPending}
            error={
              mutation.error instanceof Error ? mutation.error.message : null
            }
            onSubmit={handleSubmit}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
