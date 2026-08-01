"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, ShieldPlus, Trash2 } from "lucide-react";

import type { InsurerFormInput } from "@/app/(dashboard)/ajustes/mutuas/actions";
import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateInsurer,
  useDeleteInsurer,
  useInsurers,
  useInsurerTariff,
  useRemoveInsurerServicePrice,
  useSetInsurerServicePrice,
  useUpdateInsurer,
} from "@/hooks/use-insurers";
import { useServices } from "@/hooks/use-services";
import type { InsurerServicePriceWithService } from "@/lib/queries/insurers";
import type { Insurer } from "@/types/database";

// ---------------------------------------------------------------------------
// MutuasView — sección "Mutuas y seguros" de /ajustes (solo odontología):
// catálogo de aseguradoras (CRUD) y, al seleccionar una, su baremo de precios
// por servicio. Mismo molde que `services-view.tsx` (tabla + diálogos de
// alta/edición/borrado); el baremo reutiliza el patrón de edición inline de
// `ServiceMaterialSection`/`MaterialRow` (service-form.tsx).
// ---------------------------------------------------------------------------

interface MutuasViewProps {
  salonId: string;
}

const EMPTY_FORM: InsurerFormInput = {
  name: "",
  phone: "",
  email: "",
  notes: "",
  active: true,
};

/** Deriva los valores por defecto del formulario a partir de una fila. */
function toFormDefaults(insurer: Insurer): InsurerFormInput {
  return {
    name: insurer.name,
    phone: insurer.phone ?? "",
    email: insurer.email ?? "",
    notes: insurer.notes ?? "",
    active: insurer.active,
  };
}

export function MutuasView({ salonId }: MutuasViewProps): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Insurer | null>(null);
  const [deleting, setDeleting] = useState<Insurer | null>(null);
  const [selected, setSelected] = useState<Insurer | null>(null);

  const insurersQuery = useInsurers(salonId);
  const createMutation = useCreateInsurer(salonId);

  const insurers = insurersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={ShieldPlus}
        title="Mutuas y seguros"
        description="Aseguradoras con las que trabaja tu clínica y el baremo de precios por servicio."
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva aseguradora
            </Button>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva aseguradora</DialogTitle>
                <DialogDescription>
                  Añade una mutua o aseguradora al catálogo del salón.
                </DialogDescription>
              </DialogHeader>
              <InsurerForm
                submitLabel="Crear aseguradora"
                pending={createMutation.isPending}
                error={
                  createMutation.error instanceof Error
                    ? createMutation.error.message
                    : null
                }
                onCancel={() => setCreateOpen(false)}
                onSubmit={(input) => {
                  createMutation.mutate(input, {
                    onSuccess: () => setCreateOpen(false),
                  });
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="animate-fade-up [animation-delay:60ms]">
        <div className="overflow-hidden rounded-xl border border-border/70 shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden sm:table-cell">Contacto</TableHead>
                <TableHead className="hidden sm:table-cell">Estado</TableHead>
                <TableHead className="w-[1%]">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {insurersQuery.isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : insurersQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-destructive">
                    {insurersQuery.error instanceof Error
                      ? insurersQuery.error.message
                      : "Error al cargar"}
                  </TableCell>
                </TableRow>
              ) : insurers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <ShieldPlus className="h-6 w-6" />
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Aún no hay aseguradoras. Crea la primera.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                insurers.map((insurer) => (
                  <TableRow
                    key={insurer.id}
                    className="cursor-pointer"
                    aria-selected={selected?.id === insurer.id}
                    onClick={() => setSelected(insurer)}
                  >
                    <TableCell className="font-medium">{insurer.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {insurer.phone ?? insurer.email ?? "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={insurer.active ? "secondary" : "outline"}>
                        {insurer.active ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${insurer.name}`}
                          onClick={() => setEditing(insurer)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar ${insurer.name}`}
                          onClick={() => setDeleting(insurer)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selected !== null ? (
        <InsurerTariffCard salonId={salonId} insurer={selected} />
      ) : null}

      {editing !== null ? (
        <EditInsurerDialog
          salonId={salonId}
          insurer={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting !== null ? (
        <DeleteInsurerDialog
          salonId={salonId}
          insurer={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InsurerForm — formulario reutilizable (crear/editar)
// ---------------------------------------------------------------------------

interface InsurerFormProps {
  defaultValues?: InsurerFormInput;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: InsurerFormInput) => void;
  onCancel: () => void;
}

function InsurerForm({
  defaultValues = EMPTY_FORM,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: InsurerFormProps): React.ReactElement {
  const [values, setValues] = useState<InsurerFormInput>(defaultValues);

  function update<K extends keyof InsurerFormInput>(
    key: K,
    value: InsurerFormInput[K],
  ): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 pt-1">
      <div className="grid gap-2">
        <Label htmlFor="insurer-name">Nombre *</Label>
        <Input
          id="insurer-name"
          required
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Sanitas, Adeslas, DKV…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="insurer-phone">Teléfono</Label>
          <Input
            id="insurer-phone"
            value={values.phone ?? ""}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="insurer-email">Email</Label>
          <Input
            id="insurer-email"
            type="email"
            value={values.email ?? ""}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="insurer-notes">Notas</Label>
        <Textarea
          id="insurer-notes"
          value={values.notes ?? ""}
          onChange={(e) => update("notes", e.target.value)}
          rows={3}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-sm transition-colors duration-150 ease-apple-out hover:bg-accent/40">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary"
          checked={values.active ?? true}
          onChange={(e) => update("active", e.target.checked)}
        />
        Aseguradora activa
      </label>

      {error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// EditInsurerDialog / DeleteInsurerDialog
// ---------------------------------------------------------------------------

interface EditInsurerDialogProps {
  salonId: string;
  insurer: Insurer;
  onClose: () => void;
}

function EditInsurerDialog({
  salonId,
  insurer,
  onClose,
}: EditInsurerDialogProps): React.ReactElement {
  const updateMutation = useUpdateInsurer(salonId, insurer.id);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar aseguradora</DialogTitle>
          <DialogDescription>Actualiza los datos de «{insurer.name}».</DialogDescription>
        </DialogHeader>
        <InsurerForm
          defaultValues={toFormDefaults(insurer)}
          submitLabel="Guardar cambios"
          pending={updateMutation.isPending}
          error={
            updateMutation.error instanceof Error ? updateMutation.error.message : null
          }
          onCancel={onClose}
          onSubmit={(input) => {
            updateMutation.mutate(input, { onSuccess: onClose });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface DeleteInsurerDialogProps {
  salonId: string;
  insurer: Insurer;
  onClose: () => void;
  /** Se llama en éxito, ADEMÁS de `onClose` — para deseleccionar si era la aseguradora activa del baremo. */
  onDeleted: () => void;
}

function DeleteInsurerDialog({
  salonId,
  insurer,
  onClose,
  onDeleted,
}: DeleteInsurerDialogProps): React.ReactElement {
  const deleteMutation = useDeleteInsurer(salonId);
  const errorMessage =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar aseguradora</DialogTitle>
          <DialogDescription>
            ¿Seguro que quieres eliminar «{insurer.name}»? Se eliminarán también su
            baremo y las pólizas de pacientes asociadas. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {errorMessage !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              deleteMutation.mutate(insurer.id, {
                onSuccess: () => {
                  onDeleted();
                  onClose();
                },
              });
            }}
          >
            {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// InsurerTariffCard — baremo de precios por servicio de una aseguradora
// ---------------------------------------------------------------------------

interface InsurerTariffCardProps {
  salonId: string;
  insurer: Insurer;
}

function InsurerTariffCard({
  salonId,
  insurer,
}: InsurerTariffCardProps): React.ReactElement {
  const servicesQuery = useServices(salonId, "");
  const tariffQuery = useInsurerTariff(salonId, insurer.id);
  const setPriceMutation = useSetInsurerServicePrice(salonId, insurer.id);
  const removePriceMutation = useRemoveInsurerServicePrice(salonId, insurer.id);

  const services = servicesQuery.data ?? [];
  const tariffByService = new Map(
    (tariffQuery.data ?? []).map((row) => [row.service_id, row] as const),
  );

  return (
    <Card className="animate-fade-up">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Baremo de «{insurer.name}»
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {servicesQuery.isPending || tariffQuery.isPending ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Cargando…
          </p>
        ) : servicesQuery.isError || tariffQuery.isError ? (
          <p className="px-4 py-6 text-center text-sm text-destructive">
            Error al cargar el baremo.
          </p>
        ) : services.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Aún no hay servicios en el catálogo.
          </p>
        ) : (
          <ul className="divide-y">
            {services.map((service) => {
              const entry = tariffByService.get(service.id) ?? null;
              return (
                <TariffRow
                  key={service.id}
                  serviceName={service.name}
                  tariffEntry={entry}
                  onSave={(priceCents) =>
                    setPriceMutation.mutate({
                      insurerId: insurer.id,
                      serviceId: service.id,
                      priceCents,
                    })
                  }
                  onRemove={
                    entry !== null
                      ? () => removePriceMutation.mutate(entry.id)
                      : undefined
                  }
                  saving={setPriceMutation.isPending}
                  removing={removePriceMutation.isPending}
                />
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TariffRow — precio (editable) de un servicio para la aseguradora seleccionada.
// Mismo patrón de edición inline que `MaterialRow` (service-form.tsx): estado
// local inicializado desde el precio actual, se confirma con un botón "Guardar"
// (en vez de onBlur, porque aquí SÍ hay validación con mensaje visible por fila).
// ---------------------------------------------------------------------------

interface TariffRowProps {
  serviceName: string;
  tariffEntry: InsurerServicePriceWithService | null;
  onSave: (priceCents: number) => void;
  onRemove: (() => void) | undefined;
  saving: boolean;
  removing: boolean;
}

function TariffRow({
  serviceName,
  tariffEntry,
  onSave,
  onRemove,
  saving,
  removing,
}: TariffRowProps): React.ReactElement {
  const [priceEuros, setPriceEuros] = useState(
    tariffEntry !== null ? (tariffEntry.price_cents / 100).toFixed(2) : "",
  );
  const [rowError, setRowError] = useState<string | null>(null);

  function handleSave(): void {
    setRowError(null);
    const normalized = priceEuros.trim().replace(",", ".");
    if (normalized === "") {
      setRowError("Introduce un precio.");
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setRowError("Precio no válido.");
      return;
    }
    onSave(Math.round(parsed * 100));
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm">{serviceName}</span>
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          inputMode="decimal"
          className="w-24"
          aria-label={`Precio de ${serviceName} para esta aseguradora`}
          value={priceEuros}
          disabled={saving}
          onChange={(e) => setPriceEuros(e.target.value)}
          placeholder="0,00"
        />
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Guardar"}
        </Button>
        {onRemove !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quitar precio de ${serviceName}`}
            disabled={removing}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}
      </div>
      {rowError !== null ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {rowError}
        </p>
      ) : null}
    </li>
  );
}
