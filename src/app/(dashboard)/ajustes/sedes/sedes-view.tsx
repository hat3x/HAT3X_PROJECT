"use client";

import { useState } from "react";
import { MapPin, Plus } from "lucide-react";

import {
  LocationForm,
  type LocationFormDefaults,
} from "@/app/(dashboard)/ajustes/sedes/location-form";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useCreateLocation,
  useLocations,
  useSetLocationActive,
  useUpdateLocation,
} from "@/hooks/use-locations";
import type { Location } from "@/types/database";

interface SedesViewProps {
  salonId: string;
}

/** Diálogo de edición aislado para scopear `useUpdateLocation` a una sede. */
function EditLocationDialog({
  salonId,
  location,
  onClose,
}: {
  salonId: string;
  location: Location;
  onClose: () => void;
}): React.ReactElement {
  const updateMutation = useUpdateLocation(salonId, location.id);

  const defaults: LocationFormDefaults = {
    name: location.name,
    slug: location.slug,
    address: location.address ?? "",
    phone: location.phone ?? "",
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar sede</DialogTitle>
          <DialogDescription>
            Actualiza los datos de «{location.name}».
          </DialogDescription>
        </DialogHeader>
        <LocationForm
          defaultValues={defaults}
          autoSlug={false}
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

export function SedesView({ salonId }: SedesViewProps): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  const { data: locations, isPending, isError, error } = useLocations(salonId);
  const createMutation = useCreateLocation(salonId);
  const activeMutation = useSetLocationActive(salonId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Sedes</CardTitle>
          <CardDescription>
            Gestiona las ubicaciones físicas de tu salón.
          </CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva sede
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva sede</DialogTitle>
              <DialogDescription>
                Añade una ubicación física al salón.
              </DialogDescription>
            </DialogHeader>
            <LocationForm
              submitLabel="Crear sede"
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
      </CardHeader>

      <CardContent>
        {activeMutation.error instanceof Error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {activeMutation.error.message}
          </p>
        ) : null}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Identificador</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
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
              ) : !locations || locations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Aún no hay sedes. Crea la primera.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                locations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">{location.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {location.slug}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {location.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      {location.active ? (
                        <Badge variant="secondary">Activa</Badge>
                      ) : (
                        <Badge variant="outline">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(location)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant={location.active ? "ghost" : "outline"}
                          size="sm"
                          disabled={
                            activeMutation.isPending &&
                            activeMutation.variables?.locationId === location.id
                          }
                          onClick={() =>
                            activeMutation.mutate({
                              locationId: location.id,
                              active: !location.active,
                            })
                          }
                        >
                          {location.active ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {editing !== null ? (
        <EditLocationDialog
          salonId={salonId}
          location={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}
