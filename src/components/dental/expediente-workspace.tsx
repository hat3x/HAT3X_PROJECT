"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronLeft,
  FolderOpen,
  Loader2,
  Pill,
  PlusCircle,
  Trash2,
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
import { Textarea } from "@/components/ui/textarea";
import { UploadImageForm } from "@/components/dental/upload-image-form";
import { useConsents, useCreateConsent } from "@/hooks/use-consents";
import { usePatientImages } from "@/hooks/use-patient-images";
import { useAddPrescriptionItem, useCreatePrescription, usePrescriptions } from "@/hooks/use-prescriptions";
import { useProfessionals } from "@/hooks/use-professionals";
import {
  CONSENT_TYPES,
  CONSENT_TYPE_LABELS,
  getConsentTemplate,
} from "@/lib/dental/consents";
import { MEDICATION_TEMPLATES, getMedicationTemplate } from "@/lib/dental/prescriptions";
import { cn } from "@/lib/utils";
import type { ConsentType } from "@/types/database";
import { ConsentList } from "./consent-list";
import { ImageGallery } from "./image-gallery";
import { PrescriptionList } from "./prescription-list";

// ---------------------------------------------------------------------------
// ExpedienteWorkspace — orquesta las tres pestañas del expediente clínico
// (Consentimientos / Imágenes / Recetas) para un paciente concreto.
// Componente CLIENTE: toda la carga de datos pasa por los hooks de React
// Query de `use-consents.ts`/`use-patient-images.ts`/`use-prescriptions.ts`.
// Mismo patrón estructural que `PlanWorkspace`/`PerioWorkspace` (header +
// secciones + formularios inline).
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

type ExpedienteTab = "consentimientos" | "imagenes" | "recetas";

const TABS: readonly { id: ExpedienteTab; label: string }[] = [
  { id: "consentimientos", label: "Consentimientos" },
  { id: "imagenes", label: "Imágenes" },
  { id: "recetas", label: "Recetas" },
];

export function ExpedienteWorkspace({
  salonId,
  customerId,
}: ExpedienteWorkspaceProps): React.ReactElement {
  const [tab, setTab] = useState<ExpedienteTab>("consentimientos");

  const consentsQuery = useConsents(salonId, customerId);
  const imagesQuery = usePatientImages(salonId, customerId);
  const prescriptionsQuery = usePrescriptions(salonId, customerId);

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

      {tab === "consentimientos" && (
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
      )}

      {tab === "imagenes" && (
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

      {tab === "recetas" && (
        <div className="space-y-4">
          {prescriptionsQuery.isLoading ? (
            <p className="px-1 text-xs text-muted-foreground">Cargando recetas…</p>
          ) : prescriptionsQuery.isError ? (
            <p className="px-1 text-xs text-destructive">Error al cargar las recetas.</p>
          ) : (
            <PrescriptionList
              salonId={salonId}
              customerId={customerId}
              prescriptions={prescriptionsQuery.data ?? []}
            />
          )}
          <NewPrescriptionForm salonId={salonId} customerId={customerId} />
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
// NewPrescriptionForm — crea la cabecera de una receta (borrador) y sus
// renglones de medicación en un único envío. Los renglones se construyen
// primero en estado LOCAL (añadir/quitar antes de guardar, cada uno
// autorrellenable desde `MEDICATION_TEMPLATES` o libre); al enviar el
// formulario se crea la cabecera (`useCreatePrescription`) y después se
// persiste cada renglón (`useAddPrescriptionItem`) con el id ya asignado —
// igual que `plan_item` se añade uno a uno a un `treatment_plan` ya creado.
// ---------------------------------------------------------------------------

interface NewPrescriptionFormProps {
  salonId: string;
  customerId: string;
}

interface PendingMedicationRow {
  key: string;
  medication: string;
  dose: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
}

/** Valor especial del selector de plantilla que indica "medicación libre" (sin autorrelleno). */
const CUSTOM_MEDICATION_OPTION = "__custom__";

function NewPrescriptionForm({ salonId, customerId }: NewPrescriptionFormProps): React.ReactElement {
  const createMutation = useCreatePrescription(salonId, customerId);
  const addItemMutation = useAddPrescriptionItem(salonId, "");
  const professionalsQuery = useProfessionals(salonId, "");
  const rowKeyRef = useRef(0);

  const [prescriberName, setPrescriberName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");

  const [rows, setRows] = useState<PendingMedicationRow[]>([]);
  const [templateChoice, setTemplateChoice] = useState<string>(CUSTOM_MEDICATION_OPTION);
  const [medication, setMedication] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [quantity, setQuantity] = useState("");
  const [instructions, setInstructions] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function handleTemplateChange(value: string) {
    setTemplateChoice(value);
    if (value === CUSTOM_MEDICATION_OPTION) return;
    const template = getMedicationTemplate(value);
    if (template === undefined) return;
    setMedication(template.name);
    setDose(template.dose);
    setFrequency(template.frequency);
    setDuration(template.duration);
  }

  function resetRowDraft() {
    setTemplateChoice(CUSTOM_MEDICATION_OPTION);
    setMedication("");
    setDose("");
    setFrequency("");
    setDuration("");
    setQuantity("");
    setInstructions("");
  }

  function handleAddRow() {
    const trimmedMedication = medication.trim();
    if (trimmedMedication === "") {
      setError("Escribe o elige un medicamento para el renglón.");
      return;
    }
    setError(null);
    rowKeyRef.current += 1;
    setRows((prev) => [
      ...prev,
      {
        key: `row-${rowKeyRef.current}`,
        medication: trimmedMedication,
        dose: dose.trim(),
        frequency: frequency.trim(),
        duration: duration.trim(),
        quantity: quantity.trim(),
        instructions: instructions.trim(),
      },
    ]);
    resetRowDraft();
  }

  function handleRemoveRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (rows.length === 0) {
      setError("Añade al menos un renglón de medicación a la receta.");
      return;
    }

    setIsSaving(true);
    try {
      const trimmedPrescriber = prescriberName.trim();
      const trimmedDiagnosis = diagnosis.trim();
      const trimmedNotes = notes.trim();

      const created = await createMutation.mutateAsync({
        customerId,
        prescriberName: trimmedPrescriber === "" ? undefined : trimmedPrescriber,
        diagnosis: trimmedDiagnosis === "" ? undefined : trimmedDiagnosis,
        notes: trimmedNotes === "" ? undefined : trimmedNotes,
      });

      for (const row of rows) {
        await addItemMutation.mutateAsync({
          prescriptionId: created.id,
          medication: row.medication,
          dose: row.dose === "" ? undefined : row.dose,
          frequency: row.frequency === "" ? undefined : row.frequency,
          duration: row.duration === "" ? undefined : row.duration,
          quantity: row.quantity === "" ? undefined : row.quantity,
          instructions: row.instructions === "" ? undefined : row.instructions,
        });
      }

      setPrescriberName("");
      setDiagnosis("");
      setNotes("");
      setRows([]);
      resetRowDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la receta.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Nueva receta</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="prescription-professional">Prescriptor (elegir de la lista, opcional)</Label>
              <Select
                value=""
                onValueChange={(id) => {
                  const professional = (professionalsQuery.data ?? []).find((p) => p.id === id);
                  if (professional !== undefined) setPrescriberName(professional.full_name);
                }}
              >
                <SelectTrigger id="prescription-professional">
                  <SelectValue placeholder="Elegir profesional" />
                </SelectTrigger>
                <SelectContent>
                  {(professionalsQuery.data ?? []).map((professional) => (
                    <SelectItem key={professional.id} value={professional.id}>
                      {professional.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="prescription-prescriber-name">Nombre del prescriptor</Label>
              <Input
                id="prescription-prescriber-name"
                value={prescriberName}
                onChange={(e) => setPrescriberName(e.target.value)}
                placeholder="Ej. Dra. Ana Ruiz"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="prescription-diagnosis">Diagnóstico</Label>
            <Input
              id="prescription-diagnosis"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Ej. Pulpitis irreversible 26"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="prescription-notes">Notas (opcional)</Label>
            <Textarea
              id="prescription-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. alergia a penicilina"
              rows={2}
            />
          </div>

          {/* Renglones ya añadidos (localmente, pendientes de guardar) */}
          {rows.length > 0 && (
            <ul className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5">
              {rows.map((row) => {
                const meta = [row.dose, row.frequency, row.duration, row.quantity].filter(
                  (value) => value !== "",
                );
                return (
                  <li
                    key={row.key}
                    className="flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{row.medication}</span>
                      {meta.length > 0 && (
                        <span className="text-muted-foreground"> — {meta.join(" · ")}</span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar renglón ${row.medication}`}
                      className="h-6 w-6 shrink-0"
                      onClick={() => handleRemoveRow(row.key)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Constructor de un nuevo renglón (local, no persiste hasta enviar el formulario) */}
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <div className="space-y-1">
              <Label htmlFor="prescription-item-template">Medicamento</Label>
              <Select value={templateChoice} onValueChange={handleTemplateChange}>
                <SelectTrigger id="prescription-item-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CUSTOM_MEDICATION_OPTION}>Personalizado (texto libre)</SelectItem>
                  {MEDICATION_TEMPLATES.map((template) => (
                    <SelectItem key={template.name} value={template.name}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Nombre del medicamento"
                value={medication}
                onChange={(e) => setMedication(e.target.value)}
                placeholder="Ej. Amoxicilina 500 mg"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="Dosis"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="Dosis (ej. 1 comprimido)"
              />
              <Input
                aria-label="Pauta"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="Pauta (ej. cada 8 h)"
              />
              <Input
                aria-label="Duración"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Duración (ej. 7 días)"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="Cantidad"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Cantidad (opcional)"
              />
              <Input
                aria-label="Instrucciones"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Instrucciones (opcional)"
              />
            </div>

            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handleAddRow}>
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Añadir renglón
            </Button>
          </div>

          {error !== null && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Pill className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Crear receta
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
