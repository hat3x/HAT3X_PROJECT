"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScanLine,
  Trash2,
} from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeleteImagingDevice,
  useImagingAgentSettings,
  useImagingDevices,
  useSaveImagingAgentSettings,
  useSaveImagingDevice,
} from "@/hooks/use-imaging-devices";
import { IMAGE_MODALITIES, IMAGE_MODALITY_LABELS } from "@/lib/dental/consents";
import { generatePairingToken } from "@/lib/imaging/pairing";
import { DEFAULT_AGENT_PORT } from "@/lib/queries/imaging-devices";
import {
  IMAGING_ADAPTERS,
  IMAGING_ADAPTER_HINTS,
  IMAGING_ADAPTER_LABELS,
  imagingDeviceSchema,
} from "@/lib/validations/imaging-device";
import type { ImageModality, ImagingAdapter, SalonImagingDevice } from "@/types/database";

// ---------------------------------------------------------------------------
// EquiposView — sección "Equipos de imagen" de /ajustes (solo odontología).
//
// Es la pantalla donde cada clínica declara SU aparato. El producto no se ata a
// ningún fabricante: se elige un adaptador y se rellenan sus ajustes, que
// cambian según el adaptador elegido. Lo normal es tener varios: un sensor por
// gabinete más un ortopantomógrafo compartido.
// ---------------------------------------------------------------------------

interface EquiposViewProps {
  salonId: string;
}

/** Estado del formulario: los ajustes viven como texto hasta validarse. */
interface FormState {
  name: string;
  adapter: ImagingAdapter;
  modality: ImageModality;
  active: boolean;
  path: string;
  source: string;
  aeTitle: string;
  port: string;
  vendor: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  adapter: "carpeta",
  modality: "periapical",
  active: true,
  path: "",
  source: "",
  aeTitle: "",
  port: "11112",
  vendor: "",
};

/** Reconstruye los ajustes tipados a partir del formulario, según el adaptador. */
function settingsFrom(form: FormState): Record<string, unknown> {
  switch (form.adapter) {
    case "carpeta":
      return { path: form.path.trim() };
    case "twain":
      return { source: form.source.trim() };
    case "dicom":
      return { aeTitle: form.aeTitle.trim(), port: Number(form.port) };
    case "sdk":
      return { vendor: form.vendor.trim() };
  }
}

/** Vuelca un equipo guardado al formulario para editarlo. */
function formFrom(device: SalonImagingDevice): FormState {
  const s = device.settings;
  return {
    ...EMPTY_FORM,
    name: device.name,
    adapter: device.adapter,
    modality: device.modality,
    active: device.active,
    path: typeof s.path === "string" ? s.path : "",
    source: typeof s.source === "string" ? s.source : "",
    aeTitle: typeof s.aeTitle === "string" ? s.aeTitle : "",
    port: typeof s.port === "number" ? String(s.port) : "11112",
    vendor: typeof s.vendor === "string" ? s.vendor : "",
  };
}

/** Resumen legible de la configuración, para la tabla. */
function describeSettings(device: SalonImagingDevice): string {
  const s = device.settings;
  switch (device.adapter) {
    case "carpeta":
      return String(s.path ?? "—");
    case "twain":
      return String(s.source ?? "—");
    case "dicom":
      return `${String(s.aeTitle ?? "—")}:${String(s.port ?? "—")}`;
    case "sdk":
      return String(s.vendor ?? "—");
    default:
      return "—";
  }
}

/**
 * Emparejamiento con el agente instalado en el ordenador del equipo de rayos.
 *
 * El token es lo que impide que cualquier web abierta en ese ordenador le pida
 * al agente una radiografía. Se genera aquí y se copia UNA vez al fichero de
 * configuración del agente.
 */
function AgentPairingCard({ salonId }: { salonId: string }): React.ReactElement {
  const { data: agent, isLoading } = useImagingAgentSettings(salonId);
  const saveMutation = useSaveImagingAgentSettings(salonId);

  const [visible, setVisible] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puerto = agent?.port ?? DEFAULT_AGENT_PORT;

  function generar(): void {
    setError(null);
    saveMutation.mutate(
      { port: puerto, token: generatePairingToken() },
      {
        onSuccess: () => setVisible(true),
        onError: (err: unknown) =>
          setError(err instanceof Error ? err.message : "No se pudo guardar el emparejamiento."),
      },
    );
  }

  async function copiar(): Promise<void> {
    if (agent === null || agent === undefined) return;
    try {
      await navigator.clipboard.writeText(agent.pairingToken);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles queda el botón de ver, que permite
      // seleccionarlo a mano. No es un fallo que merezca una alerta.
      setVisible(true);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Agente de captura</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              El programa que se instala en el ordenador del equipo de rayos. Este código es lo
              que hace que solo tu clínica pueda pedirle radiografías.
            </p>
          </div>
        </div>

        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : agent === null || agent === undefined ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={generar} disabled={saveMutation.isPending}>
              {saveMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              Generar código
            </Button>
            <span className="text-sm text-muted-foreground">Todavía no hay ningún agente emparejado.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 text-xs">
                {visible ? agent.pairingToken : "•".repeat(24)}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Ocultar el código" : "Ver el código"}
              >
                {visible ? (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void copiar()}>
                {copiado ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Escucha en el puerto {puerto}. Si generas uno nuevo,{" "}
              <strong>los agentes ya instalados dejan de funcionar</strong> hasta que se les pegue
              el código nuevo.
            </p>

            <div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={generar}
                disabled={saveMutation.isPending}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Generar uno nuevo
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EquiposView({ salonId }: EquiposViewProps): React.ReactElement {
  const { data: devices, isLoading } = useImagingDevices(salonId);
  const saveMutation = useSaveImagingDevice(salonId);
  const deleteMutation = useDeleteImagingDevice(salonId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  function openNew(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(device: SalonImagingDevice): void {
    setEditingId(device.id);
    setForm(formFrom(device));
    setError(null);
    setDialogOpen(true);
  }

  function handleSave(): void {
    setError(null);
    const candidate = {
      name: form.name.trim(),
      adapter: form.adapter,
      settings: settingsFrom(form),
      modality: form.modality,
      active: form.active,
    };

    // Se valida con el MISMO esquema que usa el servidor, así que lo que aquí
    // pasa allí también pasa: no hay dos criterios que puedan divergir.
    const parsed = imagingDeviceSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa la configuración.");
      return;
    }

    saveMutation.mutate(
      { input: parsed.data, deviceId: editingId ?? undefined },
      {
        onSuccess: () => setDialogOpen(false),
        onError: (err: unknown) =>
          setError(err instanceof Error ? err.message : "No se pudo guardar el equipo."),
      },
    );
  }

  function handleDelete(deviceId: string): void {
    setError(null);
    deleteMutation.mutate(deviceId, {
      onError: (err: unknown) =>
        setError(err instanceof Error ? err.message : "No se pudo borrar el equipo."),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        icon={ScanLine}
        title="Equipos de imagen"
        description="Los aparatos con los que esta clínica captura radiografías y fotos. Puedes tener varios: un sensor por gabinete y el ortopantomógrafo."
        action={
          <Button type="button" onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo equipo
          </Button>
        }
      />

      {/* El error de la LISTA (p. ej. un borrado que falla). El del formulario
          se pinta dentro del diálogo: si se quedara aquí, el modal lo taparía y
          quien pulsa Guardar vería que no pasa nada, sin saber por qué. */}
      {error !== null && !dialogOpen && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <AgentPairingCard salonId={salonId} />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : devices === undefined || devices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ScanLine className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Todavía no has añadido ningún equipo</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Mientras no haya equipos, las radiografías hay que subirlas a mano desde la ficha
              del paciente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Cómo captura</TableHead>
                  <TableHead>Configuración</TableHead>
                  <TableHead>Modalidad</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {device.name}
                        {!device.active && <Badge variant="secondary">Desactivado</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>{IMAGING_ADAPTER_LABELS[device.adapter]}</TableCell>
                    <TableCell className="max-w-[22ch] truncate font-mono text-xs text-muted-foreground">
                      {describeSettings(device)}
                    </TableCell>
                    <TableCell>{IMAGE_MODALITY_LABELS[device.modality]}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(device)}
                          aria-label={`Editar ${device.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(device.id)}
                          aria-label={`Borrar ${device.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId === null ? "Nuevo equipo" : "Editar equipo"}</DialogTitle>
            <DialogDescription>{IMAGING_ADAPTER_HINTS[form.adapter]}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="equipo-nombre">Nombre</Label>
              <Input
                id="equipo-nombre"
                placeholder="Sensor del gabinete 2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="equipo-adaptador">Cómo captura</Label>
              <Select
                value={form.adapter}
                onValueChange={(value) => setForm({ ...form, adapter: value as ImagingAdapter })}
              >
                <SelectTrigger id="equipo-adaptador">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGING_ADAPTERS.map((adapter) => (
                    <SelectItem key={adapter} value={adapter}>
                      {IMAGING_ADAPTER_LABELS[adapter]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.adapter === "carpeta" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="equipo-path">Carpeta que se vigila</Label>
                <Input
                  id="equipo-path"
                  placeholder="C:\Radiografias\salida"
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                />
              </div>
            )}

            {form.adapter === "twain" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="equipo-source">Nombre de la fuente TWAIN</Label>
                <Input
                  id="equipo-source"
                  placeholder="CS 1500 TWAIN"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                />
              </div>
            )}

            {form.adapter === "dicom" && (
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="equipo-ae">AE title</Label>
                  <Input
                    id="equipo-ae"
                    placeholder="KAIROS_SCP"
                    value={form.aeTitle}
                    onChange={(e) => setForm({ ...form, aeTitle: e.target.value })}
                  />
                </div>
                <div className="flex w-28 flex-col gap-1.5">
                  <Label htmlFor="equipo-port">Puerto</Label>
                  <Input
                    id="equipo-port"
                    inputMode="numeric"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: e.target.value })}
                  />
                </div>
              </div>
            )}

            {form.adapter === "sdk" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="equipo-vendor">Fabricante</Label>
                <Input
                  id="equipo-vendor"
                  placeholder="Carestream"
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="equipo-modalidad">Qué captura normalmente</Label>
              <Select
                value={form.modality}
                onValueChange={(value) => setForm({ ...form, modality: value as ImageModality })}
              >
                <SelectTrigger id="equipo-modalidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODALITIES.map((modality) => (
                    <SelectItem key={modality} value={modality}>
                      {IMAGE_MODALITY_LABELS[modality]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="equipo-activo">Disponible para capturar</Label>
                <p className="text-xs text-muted-foreground">
                  Si lo desactivas, deja de ofrecerse en la ficha pero conserva su configuración.
                </p>
              </div>
              <Switch
                id="equipo-activo"
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: checked })}
              />
            </div>
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="gap-1.5"
            >
              {saveMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
