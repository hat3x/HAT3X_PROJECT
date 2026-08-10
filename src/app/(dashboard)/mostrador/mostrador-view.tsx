"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ModifierPickerDialog } from "@/app/(dashboard)/mostrador/modifier-picker-dialog";
import { OpenOrdersBar } from "@/app/(dashboard)/mostrador/open-orders-bar";
import { OrderPanel, type OrderPanelItem } from "@/app/(dashboard)/mostrador/order-panel";
import { ProductGrid } from "@/app/(dashboard)/mostrador/product-grid";
import {
  useAllProductModifierGroups,
  useMenuProducts,
  useModifierGroups,
  useStations,
} from "@/hooks/use-menu";
import { useOrderItems } from "@/hooks/use-orders";
import { useSalePaymentMethods } from "@/hooks/use-tpv";
import { buildOrderItemDrafts, type MenuSelection } from "@/lib/restauracion/order";
import type { Order, OrderItem, Product } from "@/types/database";

interface MostradorViewProps {
  salonId: string;
  /** Nombre comercial del salón; cabecera del ticket impreso. */
  salonName: string;
}

/** `order_items.modifiers_snapshot` es `Json` en la BD; en la práctica siempre
 * tiene esta forma (la escribe `addOrderItems`, ver `mostrador/actions.ts`). */
function asModifiersSnapshot(value: unknown): Array<{ name: string; priceDeltaCents: number }> {
  return Array.isArray(value) ? (value as Array<{ name: string; priceDeltaCents: number }>) : [];
}

/** Una línea persistida cuenta para el pedido si no es una anulación ni está
 * anulada — mismo criterio que `settleOrder` al cargar líneas a cobrar. */
function isActiveOrderItem(row: OrderItem): boolean {
  return row.void_of_item_id === null && row.status !== "anulado";
}

/**
 * Pantalla de mostrador (restauración): rejilla de carta a la izquierda,
 * panel de pedido a la derecha, con la barra de cuentas abiertas arriba.
 * Mantiene en estado LOCAL las líneas del pedido en curso (drafts con
 * `crypto.randomUUID()`, patrón de `tpv-view.tsx`); es `OrderPanel` quien
 * decide CUÁNDO persistirlas (Mandar/Cobrar). Al reabrir una cuenta desde
 * `OpenOrdersBar`, las líneas ya persistidas se cargan una única vez con
 * `useOrderItems`.
 */
export function MostradorView({ salonId, salonName }: MostradorViewProps): React.ReactElement {
  const products = useMenuProducts(salonId);
  const stations = useStations(salonId);
  const modifierGroups = useModifierGroups(salonId);
  const productModifierGroups = useAllProductModifierGroups(salonId);
  const paymentMethods = useSalePaymentMethods(salonId);

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderPanelItem[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);

  const orderItemsQuery = useOrderItems(salonId, order?.id ?? null);
  // Evita recargar las líneas del mismo pedido dos veces: solo se leen de BD
  // al REABRIR una cuenta desde `OpenOrdersBar`; cuando `OrderPanel` crea el
  // pedido en el primer Mandar/Cobrar, las líneas ya están en `items` (son la
  // fuente de verdad que se está empujando HACIA el servidor, no al revés).
  const loadedOrderIdRef = useRef<string | null>(null);

  const productsById = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p])),
    [products.data],
  );
  const groupsByProduct = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of productModifierGroups.data ?? []) {
      const list = map.get(link.product_id) ?? [];
      list.push(link.group_id);
      map.set(link.product_id, list);
    }
    return map;
  }, [productModifierGroups.data]);

  useEffect(() => {
    if (order === null || orderItemsQuery.data === undefined) return;
    if (loadedOrderIdRef.current === order.id) return;
    loadedOrderIdRef.current = order.id;
    const loaded: OrderPanelItem[] = orderItemsQuery.data.filter(isActiveOrderItem).map((row) => ({
      id: row.id,
      productId: row.product_id,
      qty: row.qty,
      unitPriceCents: row.unit_price_cents,
      vatRate: row.vat_rate,
      stationId: row.station_id,
      comboGroup: row.combo_group,
      modifiersSnapshot: asModifiersSnapshot(row.modifiers_snapshot),
      name: productsById.get(row.product_id)?.name ?? "Producto",
    }));
    setItems(loaded);
    setPendingIds(new Set());
  }, [order, orderItemsQuery.data, productsById]);

  function addSelection(selection: MenuSelection): void {
    const drafts = buildOrderItemDrafts(selection, () => crypto.randomUUID());
    const withNames: OrderPanelItem[] = drafts.map((draft) => ({
      ...draft,
      name: productsById.get(draft.productId)?.name ?? selection.name,
    }));
    setItems((prev) => [...prev, ...withNames]);
    setPendingIds((prev) => {
      const next = new Set(prev);
      for (const draft of withNames) next.add(draft.id);
      return next;
    });
  }

  function handleAddDirect(product: Product): void {
    addSelection({
      productId: product.id,
      name: product.name,
      basePriceCents: product.price_cents,
      vatRate: product.vat_rate,
      stationId: product.station_id,
      isCombo: false,
      qty: 1,
      modifiers: [],
      comboPieces: [],
    });
  }

  function handleSelectOrder(selected: Order): void {
    // Fuerza la recarga de líneas de la cuenta elegida (distinta a la actual).
    loadedOrderIdRef.current = null;
    setOrder(selected);
  }

  function handleNewOrder(): void {
    loadedOrderIdRef.current = null;
    setOrder(null);
    setItems([]);
    setPendingIds(new Set());
    setPickerProduct(null);
  }

  const assignedGroupIds = pickerProduct !== null
    ? groupsByProduct.get(pickerProduct.id) ?? []
    : [];
  const assignedGroups = (modifierGroups.data ?? []).filter((g) =>
    assignedGroupIds.includes(g.id),
  );

  return (
    <main className="container py-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Mostrador</h1>
          <p className="text-sm text-muted-foreground">
            Toma pedidos, manda la comanda a cocina/barra y cobra.
          </p>
        </div>
      </div>

      <div className="mb-5">
        <OpenOrdersBar
          salonId={salonId}
          activeOrderId={order?.id ?? null}
          onSelect={handleSelectOrder}
          onNew={handleNewOrder}
        />
      </div>

      <div className="grid animate-fade-up gap-5 lg:grid-cols-[1fr_26rem] lg:gap-6">
        <ProductGrid
          salonId={salonId}
          productModifierGroupsByProduct={groupsByProduct}
          onAddDirect={handleAddDirect}
          onOpenPicker={setPickerProduct}
        />

        <OrderPanel
          salonId={salonId}
          salonName={salonName}
          order={order}
          items={items}
          pendingIds={pendingIds}
          stations={stations.data ?? []}
          paymentMethods={paymentMethods.data ?? []}
          onOrderPersisted={(created) => {
            // Ya tenemos las líneas en local state (son las que se están
            // mandando AL servidor); no dispares la recarga de arriba.
            loadedOrderIdRef.current = created.id;
            setOrder(created);
          }}
          onItemsSent={() => setPendingIds(new Set())}
          onSettled={handleNewOrder}
        />
      </div>

      <ModifierPickerDialog
        salonId={salonId}
        product={pickerProduct}
        groups={assignedGroups}
        productsById={productsById}
        onClose={() => setPickerProduct(null)}
        onConfirm={(selection) => {
          addSelection(selection);
          setPickerProduct(null);
        }}
      />
    </main>
  );
}
