"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTable, useCreateZone } from "@/hooks/use-tables";
import type { DiningZone } from "@/types/database";

interface FloorEditorProps {
  salonId: string;
  zones: DiningZone[];
  /** Zona activa en el lienzo — sugerida por defecto al crear una mesa nueva. */
  activeZoneId: string | null;
  editMode: boolean;
  onToggleEditMode: () => void;
}

/**
 * Controles del modo edición del plano de sala (Task 7): el toggle de
 * edición SIEMPRE está visible (`sala-view.tsx` solo monta este componente
 * si `canManageSettings(role)`, así que aquí no hace falta repetir el gate);
 * "Nueva zona"/"Nueva mesa" solo aparecen CON el modo edición activo, mismo
 * patrón alta-en-diálogo que `carta-view.tsx` (`CategoriesSection`/
 * `StationsSection`): botón que abre un `Dialog`, formulario mínimo, mutación
 * de `use-tables.ts` (Task 5) y cierre al éxito.
 *
 * El arrastre de mesas (`TableNode`/`onDragEnd` → `useSaveTablePosition`) vive
 * en `sala-view.tsx`, no aquí — este fichero solo cubre alta de zona/mesa y el
 * propio toggle.
 */
export function FloorEditor({
  salonId,
  zones,
  activeZoneId,
  editMode,
  onToggleEditMode,
}: FloorEditorProps): React.ReactElement {
  const createZone = useCreateZone(salonId);
  const createTable = useCreateTable(salonId);

  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [zoneName, setZoneName] = useState("");

  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [tableName, setTableName] = useState("");
  const [tableZoneId, setTableZoneId] = useState<string | null>(null);

  function openZoneDialog(): void {
    createZone.reset();
    setZoneName("");
    setZoneDialogOpen(true);
  }

  function openTableDialog(): void {
    createTable.reset();
    setTableName("");
    setTableZoneId(activeZoneId ?? zones[0]?.id ?? null);
    setTableDialogOpen(true);
  }

  function handleCreateZone(): void {
    const name = zoneName.trim();
    if (name === "") return;
    createZone.mutate(
      { name, sortOrder: zones.length },
      { onSuccess: () => setZoneDialogOpen(false) },
    );
  }

  function handleCreateTable(): void {
    const name = tableName.trim();
    if (name === "" || tableZoneId === null) return;
    createTable.mutate(
      {
        name,
        zoneId: tableZoneId,
        capacityMin: 1,
        capacityMax: 4,
        shape: "square",
        sortOrder: 0,
      },
      { onSuccess: () => setTableDialogOpen(false) },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={editMode ? "default" : "outline"}
        size="sm"
        onClick={onToggleEditMode}
      >
        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
        {editMode ? "Salir de edición" : "Modo edición"}
      </Button>

      {editMode ? (
        <>
          <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
            <Button type="button" variant="outline" size="sm" onClick={openZoneDialog}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nueva zona
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva zona</DialogTitle>
                <DialogDescription>Añade una zona al plano de sala.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="sala-zone-name">Nombre</Label>
                <Input
                  id="sala-zone-name"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="Terraza"
                />
              </div>
              {createZone.error instanceof Error ? (
                <p role="alert" className="text-sm text-destructive">
                  {createZone.error.message}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setZoneDialogOpen(false)}
                  disabled={createZone.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateZone}
                  disabled={createZone.isPending || zoneName.trim() === ""}
                >
                  {createZone.isPending ? "Creando…" : "Crear zona"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={tableDialogOpen} onOpenChange={setTableDialogOpen}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openTableDialog}
              disabled={zones.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nueva mesa
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva mesa</DialogTitle>
                <DialogDescription>Añade una mesa a la zona seleccionada.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="sala-table-name">Nombre</Label>
                  <Input
                    id="sala-table-name"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="Mesa 5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sala-table-zone">Zona</Label>
                  <Select
                    value={tableZoneId ?? undefined}
                    onValueChange={(value) => setTableZoneId(value)}
                  >
                    <SelectTrigger id="sala-table-zone">
                      <SelectValue placeholder="Elige una zona" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {createTable.error instanceof Error ? (
                <p role="alert" className="text-sm text-destructive">
                  {createTable.error.message}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTableDialogOpen(false)}
                  disabled={createTable.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateTable}
                  disabled={createTable.isPending || tableName.trim() === "" || tableZoneId === null}
                >
                  {createTable.isPending ? "Creando…" : "Crear mesa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
