"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import {
  ProfessionalForm,
  type ProfessionalFormDefaults,
} from "@/app/(dashboard)/ajustes/personal/professional-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocations } from "@/hooks/use-locations";
import {
  useCreateProfessional,
  useDeleteProfessional,
  useProfessionals,
  useUpdateProfessional,
} from "@/hooks/use-professionals";
import { useServices } from "@/hooks/use-services";
import type { ProfessionalWithServices } from "@/lib/queries/professionals";
import type { Location, Service } from "@/types/database";

interface ProfessionalsViewProps {
  salonId: string;
}

/** Deriva los valores por defecto del formulario a partir de una fila. */
function toFormDefaults(
  professional: ProfessionalWithServices,
): ProfessionalFormDefaults {
  return {
    full_name: professional.full_name,
    email: professional.email ?? "",
    phone: professional.phone ?? "",
    location_id: professional.location_id,
    color: professional.color ?? "#6366f1",
    specialties: professional.specialties.join(", "),
    service_ids: professional.service_ids,
    active: professional.active,
  };
}

export function ProfessionalsView({
  salonId,
}: ProfessionalsViewProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProfessionalWithServices | null>(null);
  const [deleting, setDeleting] = useState<ProfessionalWithServices | null>(
    null,
  );

  const { data: professionals, isPending, isError, error } = useProfessionals(
    salonId,
    search,
  );
  const { data: locations } = useLocations(salonId);
  const { data: services } = useServices(salonId, "");
  const createMutation = useCreateProfessional(salonId);

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const location of locations ?? []) {
      map.set(location.id, location.name);
    }
    return map;
  }, [locations]);

  const locationList: Location[] = locations ?? [];
  const serviceList: Service[] = services ?? [];

  return (
    <div>
      <SectionHeader
        icon={Users}
        title="Personal"
        description="Profesionales del salón, su sede, color de agenda y los servicios que prestan."
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo profesional
            </Button>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nuevo profesional</DialogTitle>
                <DialogDescription>
                  Da de alta a un miembro del personal y asígnale su sede y
                  servicios.
                </DialogDescription>
              </DialogHeader>
              <ProfessionalForm
                locations={locationList}
                services={serviceList}
                submitLabel="Crear profesional"
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
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar profesionales"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 shadow-xs">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden sm:table-cell">Sede</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Servicios
              </TableHead>
              <TableHead className="hidden sm:table-cell">Estado</TableHead>
              <TableHead className="w-[1%]">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive">
                  {error instanceof Error ? error.message : "Error al cargar"}
                </TableCell>
              </TableRow>
            ) : !professionals || professionals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Users className="h-6 w-6" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {search.trim() === ""
                      ? "Aún no hay personal. Da de alta al primero."
                      : "Ningún profesional coincide con la búsqueda."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              professionals.map((professional) => (
                <TableRow key={professional.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full border"
                        style={{
                          backgroundColor: professional.color ?? "transparent",
                        }}
                        aria-hidden="true"
                      />
                      <div className="flex flex-col">
                        <span>{professional.full_name}</span>
                        {professional.email !== null ? (
                          <span className="text-xs text-muted-foreground">
                            {professional.email}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {locationNameById.get(professional.location_id) ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                    {professional.service_ids.length}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant={professional.active ? "secondary" : "outline"}
                    >
                      {professional.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${professional.full_name}`}
                        onClick={() => setEditing(professional)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar ${professional.full_name}`}
                        onClick={() => setDeleting(professional)}
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

      {editing !== null ? (
        <EditProfessionalDialog
          salonId={salonId}
          professional={editing}
          locations={locationList}
          services={serviceList}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting !== null ? (
        <DeleteProfessionalDialog
          salonId={salonId}
          professional={deleting}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

interface EditProfessionalDialogProps {
  salonId: string;
  professional: ProfessionalWithServices;
  locations: Location[];
  services: Service[];
  onClose: () => void;
}

/** Diálogo de edición; aísla el hook de mutación por `professionalId`. */
function EditProfessionalDialog({
  salonId,
  professional,
  locations,
  services,
  onClose,
}: EditProfessionalDialogProps): React.ReactElement {
  const updateMutation = useUpdateProfessional(salonId, professional.id);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar profesional</DialogTitle>
          <DialogDescription>
            Actualiza los datos de «{professional.full_name}».
          </DialogDescription>
        </DialogHeader>
        <ProfessionalForm
          defaultValues={toFormDefaults(professional)}
          locations={locations}
          services={services}
          submitLabel="Guardar cambios"
          pending={updateMutation.isPending}
          error={
            updateMutation.error instanceof Error
              ? updateMutation.error.message
              : null
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

interface DeleteProfessionalDialogProps {
  salonId: string;
  professional: ProfessionalWithServices;
  onClose: () => void;
}

/** Confirmación de borrado de un profesional. */
function DeleteProfessionalDialog({
  salonId,
  professional,
  onClose,
}: DeleteProfessionalDialogProps): React.ReactElement {
  const deleteMutation = useDeleteProfessional(salonId);
  const errorMessage =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar profesional</DialogTitle>
          <DialogDescription>
            ¿Seguro que quieres eliminar a «{professional.full_name}»? Se
            quitarán también sus servicios asignados. Esta acción no se puede
            deshacer.
          </DialogDescription>
        </DialogHeader>

        {errorMessage !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={deleteMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              deleteMutation.mutate(professional.id, { onSuccess: onClose });
            }}
          >
            {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
