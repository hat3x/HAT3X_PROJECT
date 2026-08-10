"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, WifiOff } from "lucide-react";

import { FloorEditor } from "@/app/(dashboard)/sala/floor-editor";
import { TableNode } from "@/app/(dashboard)/sala/table-node";
import { TablePanel } from "@/app/(dashboard)/sala/table-panel";
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
import { useMenuProducts } from "@/hooks/use-menu";
import {
  useOpenTable,
  useSaveTablePosition,
  useTableOrders,
  useTables,
  useTablesRealtime,
  useZones,
} from "@/hooks/use-tables";
import { useSalePaymentMethods } from "@/hooks/use-tpv";
import { canManageSettings } from "@/lib/salon";
import { tableTone } from "@/lib/restauracion/tables";
import type { DiningTable, MemberRole } from "@/types/database";

interface SalaViewProps {
  salonId: string;
  /** `null` si el usuario no tiene una pertenencia resuelta (no debería
   * ocurrir tras `SectorGate`, pero se trata como "sin permiso de gestión"). */
  role: MemberRole | null;
}

/**
 * Indicador "En directo" del estado de `useTablesRealtime` — mismo patrón
 * visual que `LiveIndicator` de `cocina-view.tsx` (punto pulsante en
 * verde/conectado, icono de sin-conexión en error, spinner conectando),
 * adaptado al copy de sala.
 */
function LiveIndicator({
  status,
}: {
  status: "connecting" | "connected" | "error";
}): React.ReactElement {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-apple-out";

  if (status === "connected") {
    return (
      <span
        className={`${base} border-success/25 bg-success/10 text-success`}
        title="Los cambios se reflejan al instante"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
        En directo
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={`${base} border-destructive/25 bg-destructive/10 text-destructive`}>
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
        Sin conexión en tiempo real
      </span>
    );
  }
  return (
    <span className={`${base} border-border bg-muted text-muted-foreground`}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      Conectando…
    </span>
  );
}

/** Diálogo "Abrir mesa": pide el número de comensales antes de crear la cuenta. */
function OpenTableDialog({
  table,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  table: DiningTable | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (covers: number) => void;
}): React.ReactElement {
  const [covers, setCovers] = useState(2);

  // Reinicia el número de comensales cada vez que se abre para OTRA mesa.
  useEffect(() => {
    setCovers(2);
  }, [table?.id]);

  return (
    <Dialog
      open={table !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir {table?.name}</DialogTitle>
          <DialogDescription>Indica cuántos comensales van a sentarse.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="sala-open-covers">Comensales</Label>
          <Input
            id="sala-open-covers"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={covers}
            onChange={(e) => setCovers(Number(e.target.value))}
          />
        </div>
        {error !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(covers)}
            disabled={pending || !Number.isInteger(covers) || covers < 1}
          >
            {pending ? "Abriendo…" : "Abrir mesa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Plano de sala (Task 7): lienzo con las mesas de la zona activa en tiempo
 * real, abrir mesa (libre → diálogo de comensales → `useOpenTable`), panel de
 * mesa (ocupada/cuenta_pedida/por_limpiar → `TablePanel`, Task 6) y modo
 * edición (solo `canManageSettings(role)`: arrastrar mesas + alta de
 * zona/mesa vía `FloorEditor`).
 *
 * Cronómetro `now` — mismo patrón que `CocinaView`: `useState(() => new
 * Date())` + `setInterval(30s)`, NUNCA `Date.now()` fuera de este efecto;
 * se pasa a `TablePanel` para su propio cronómetro de tiempo sentados.
 *
 * Dos cableados cross-task heredados de la Task 6 (ver brief de Task 7):
 * `productNames` (mapa `product_id → nombre`, resuelto aquí con
 * `useMenuProducts` — mismo hook que usa el mostrador) y `paymentMethods`
 * (`useSalePaymentMethods`, también compartido con el mostrador), ambos
 * reenviados a `TablePanel`.
 */
export function SalaView({ salonId, role }: SalaViewProps): React.ReactElement {
  const router = useRouter();
  const canEdit = canManageSettings(role);

  const realtimeStatus = useTablesRealtime(salonId);
  const zonesQuery = useZones(salonId);
  const tablesQuery = useTables(salonId);
  const ordersQuery = useTableOrders(salonId);
  const productsQuery = useMenuProducts(salonId);
  const paymentMethodsQuery = useSalePaymentMethods(salonId);

  const openTableMutation = useOpenTable(salonId);
  const savePosition = useSaveTablePosition(salonId);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [openDialogTable, setOpenDialogTable] = useState<DiningTable | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  const zones = zonesQuery.data ?? [];
  const tables = tablesQuery.data ?? [];
  const orders = ordersQuery.data ?? [];

  const ordersByTable = useMemo(() => {
    const map = new Map<string, (typeof orders)[number]>();
    for (const order of orders) {
      if (order.dining_table_id !== null) map.set(order.dining_table_id, order);
    }
    return map;
  }, [orders]);

  const productNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const product of productsQuery.data ?? []) map[product.id] = product.name;
    return map;
  }, [productsQuery.data]);

  const currentZoneId = activeZoneId ?? zones[0]?.id ?? null;
  const visibleTables = tables.filter((t) => t.zone_id === currentZoneId);

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedOrder = selectedTable !== null ? ordersByTable.get(selectedTable.id) ?? null : null;

  function toggleEditMode(): void {
    setEditMode((prev) => !prev);
  }

  function handleTableSelect(table: DiningTable): void {
    if (editMode) return;
    if (table.status === "libre") {
      setOpenError(null);
      setOpenDialogTable(table);
      return;
    }
    setSelectedTableId(table.id);
  }

  function handleConfirmOpen(covers: number): void {
    if (openDialogTable === null) return;
    setOpenError(null);
    openTableMutation.mutate(
      { tableId: openDialogTable.id, covers },
      {
        onSuccess: () => {
          setSelectedTableId(openDialogTable.id);
          setOpenDialogTable(null);
        },
        onError: (e) => setOpenError(e instanceof Error ? e.message : "No se pudo abrir la mesa"),
      },
    );
  }

  function handleDragEnd(table: DiningTable, pos: { posX: number; posY: number }): void {
    setDragError(null);
    savePosition.mutate(
      { tableId: table.id, posX: pos.posX, posY: pos.posY },
      {
        onError: (e) => setDragError(e instanceof Error ? e.message : "No se pudo mover la mesa"),
      },
    );
  }

  return (
    <main className="container py-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Sala</h1>
          <p className="text-sm text-muted-foreground">
            Plano de mesas: toca una mesa libre para abrirla o una ocupada para ver su cuenta.
          </p>
        </div>
        <LiveIndicator status={realtimeStatus} />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {zones.map((zone) => (
            <Button
              key={zone.id}
              type="button"
              size="sm"
              variant={zone.id === currentZoneId ? "default" : "outline"}
              onClick={() => setActiveZoneId(zone.id)}
            >
              {zone.name}
            </Button>
          ))}
        </div>

        {canEdit ? (
          <FloorEditor
            salonId={salonId}
            zones={zones}
            activeZoneId={currentZoneId}
            editMode={editMode}
            onToggleEditMode={toggleEditMode}
          />
        ) : null}
      </div>

      {dragError !== null ? (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {dragError}
        </p>
      ) : null}

      <div className="grid animate-fade-up gap-5 lg:grid-cols-[1fr_26rem] lg:gap-6">
        <div className="relative min-h-[34rem] w-full overflow-hidden rounded-2xl border border-dashed border-border bg-muted/20">
          {tablesQuery.isPending || zonesQuery.isPending ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Cargando plano…
            </p>
          ) : zones.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Todavía no hay zonas en el plano.
              {canEdit ? " Crea una desde el modo edición." : ""}
            </p>
          ) : visibleTables.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No hay mesas en esta zona.
              {canEdit ? " Crea una desde el modo edición." : ""}
            </p>
          ) : (
            visibleTables.map((table) => (
              <TableNode
                key={table.id}
                table={table}
                tone={tableTone(table.status)}
                editable={editMode}
                onSelect={() => handleTableSelect(table)}
                onDragEnd={editMode ? (pos) => handleDragEnd(table, pos) : undefined}
              />
            ))
          )}
        </div>

        {selectedTable !== null ? (
          <TablePanel
            table={selectedTable}
            order={selectedOrder}
            salonId={salonId}
            now={now}
            productNames={productNames}
            paymentMethods={paymentMethodsQuery.data ?? []}
            onClose={() => setSelectedTableId(null)}
            onAdd={() => {
              if (selectedOrder !== null) router.push(`/mostrador?order=${selectedOrder.id}`);
            }}
          />
        ) : null}
      </div>

      <OpenTableDialog
        table={openDialogTable}
        pending={openTableMutation.isPending}
        error={openError}
        onClose={() => setOpenDialogTable(null)}
        onConfirm={handleConfirmOpen}
      />
    </main>
  );
}
