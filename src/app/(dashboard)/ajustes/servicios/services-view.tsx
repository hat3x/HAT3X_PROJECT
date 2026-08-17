"use client";

import { useState } from "react";
import { ClipboardList, Pencil, Plus, Scissors, Search, Trash2 } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import {
  ServiceForm,
  type ServiceFormDefaults,
} from "@/app/(dashboard)/ajustes/servicios/service-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSector, useTerms } from "@/components/providers/sector-provider";
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
import {
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateService,
} from "@/hooks/use-services";
import { formatMoney } from "@/lib/format";
import type { Service } from "@/types/database";

interface ServicesViewProps {
  salonId: string;
}

/** Convierte céntimos a una cadena de euros apta para el input (p. ej. "25.5"). */
function centsToEuros(cents: number): string {
  return (cents / 100).toString();
}

/** Deriva los valores por defecto del formulario a partir de una fila. */
function toFormDefaults(service: Service): ServiceFormDefaults {
  return {
    name: service.name,
    category: service.category ?? "",
    description: service.description ?? "",
    application_min: service.application_min.toString(),
    exposure_min: service.exposure_min.toString(),
    post_exposure_min: service.post_exposure_min.toString(),
    price: centsToEuros(service.price_cents),
    active: service.active,
  };
}

export function ServicesView({ salonId }: ServicesViewProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);

  const sector = useSector();
  const terms = useTerms();
  // Peluquería conserva el icono de tijeras (identidad byte a byte); el resto
  // de sectores usa un icono neutro (no tiene sentido en odontología/restauración).
  const headerIcon = sector === "peluqueria" ? Scissors : ClipboardList;

  const { data: services, isPending, isError, error } = useServices(
    salonId,
    search,
  );
  const createMutation = useCreateService(salonId);

  return (
    <div>
      <SectionHeader
        icon={headerIcon}
        title={terms.servicePlural}
        description={`Catálogo, duración por fases y precios de tu ${terms.business}.`}
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo servicio
            </Button>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nuevo servicio</DialogTitle>
                <DialogDescription>
                  {sector === "peluqueria"
                    ? "Añade un servicio al catálogo del salón."
                    : `Añade un servicio al catálogo de la ${terms.business}.`}
                </DialogDescription>
              </DialogHeader>
              <ServiceForm
                submitLabel="Crear servicio"
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
            placeholder="Buscar por nombre o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar servicios"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70 bg-[var(--glass-bg-dense)] backdrop-blur-xl shadow-xs">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden sm:table-cell">Categoría</TableHead>
              <TableHead className="text-right">Duración</TableHead>
              <TableHead className="text-right">Precio</TableHead>
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
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  {error instanceof Error ? error.message : "Error al cargar"}
                </TableCell>
              </TableRow>
            ) : !services || services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Scissors className="h-6 w-6" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {search.trim() === ""
                      ? "Aún no hay servicios. Crea el primero."
                      : "Ningún servicio coincide con la búsqueda."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {service.category ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {service.duration_minutes_total} min
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(service.price_cents, service.currency)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={service.active ? "secondary" : "outline"}>
                      {service.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${service.name}`}
                        onClick={() => setEditing(service)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar ${service.name}`}
                        onClick={() => setDeleting(service)}
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
        <EditServiceDialog
          salonId={salonId}
          service={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting !== null ? (
        <DeleteServiceDialog
          salonId={salonId}
          service={deleting}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

interface EditServiceDialogProps {
  salonId: string;
  service: Service;
  onClose: () => void;
}

/** Diálogo de edición; aísla el hook de mutación por `serviceId`. */
function EditServiceDialog({
  salonId,
  service,
  onClose,
}: EditServiceDialogProps): React.ReactElement {
  const updateMutation = useUpdateService(salonId, service.id);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar servicio</DialogTitle>
          <DialogDescription>
            Actualiza los datos de «{service.name}».
          </DialogDescription>
        </DialogHeader>
        <ServiceForm
          defaultValues={toFormDefaults(service)}
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
          salonId={salonId}
          serviceId={service.id}
        />
      </DialogContent>
    </Dialog>
  );
}

interface DeleteServiceDialogProps {
  salonId: string;
  service: Service;
  onClose: () => void;
}

/** Confirmación de borrado de un servicio. */
function DeleteServiceDialog({
  salonId,
  service,
  onClose,
}: DeleteServiceDialogProps): React.ReactElement {
  const deleteMutation = useDeleteService(salonId);
  const errorMessage =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar servicio</DialogTitle>
          <DialogDescription>
            ¿Seguro que quieres eliminar «{service.name}»? Esta acción no se
            puede deshacer.
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
              deleteMutation.mutate(service.id, { onSuccess: onClose });
            }}
          >
            {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
