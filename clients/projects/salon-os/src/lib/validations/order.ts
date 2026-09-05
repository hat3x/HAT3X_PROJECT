import { z } from "zod";

import { paymentMethodEnum } from "@/lib/validations/sale";

/**
 * Validaciones de las server actions de pedido de mostrador (restauración,
 * Task 4). Los nombres de campo replican `OrderItemDraft`
 * (lib/restauracion/order.ts, lógica pura de Task 2) para que el payload que
 * construye el cliente pase directo por `safeParse` sin mapeo intermedio.
 */

export const orderItemDraftSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().min(0),
  vatRate: z.number().min(0).max(100).default(10),
  stationId: z.string().uuid().nullable(),
  comboGroup: z.string().nullable(),
  modifiersSnapshot: z.array(z.object({ name: z.string(), priceDeltaCents: z.number().int() })).default([]),
});
export type OrderItemDraftInput = z.infer<typeof orderItemDraftSchema>;

export const createOrderSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().max(120).nullable(),
  idempotencyKey: z.string().max(200).nullable(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const addOrderItemsSchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(orderItemDraftSchema).min(1),
});
export type AddOrderItemsInput = z.infer<typeof addOrderItemsSchema>;

export const voidOrderItemSchema = z.object({
  orderId: z.string().uuid(),
  itemId: z.string().uuid(),
  reason: z.string().trim().min(1).max(200),
});
export type VoidOrderItemInput = z.infer<typeof voidOrderItemSchema>;

/** Espejo de `OrderItemStatus` (types/database.ts / enum public.order_item_status). */
export const orderItemStatusEnum = z.enum([
  "pendiente",
  "enviado",
  "preparando",
  "listo",
  "entregado",
  "anulado",
]);

export const sendOrderToStationsSchema = z.object({
  orderId: z.string().uuid(),
});
export type SendOrderToStationsInput = z.infer<typeof sendOrderToStationsSchema>;

/**
 * `from`/`to` acotan la transición que la UI espera aplicar; la action
 * (`setOrderItemStatus`) es quien la hace SEGURA de verdad al condicionar el
 * UPDATE por `status = from` en la propia query (ver `mostrador/actions.ts`).
 */
export const setOrderItemStatusSchema = z.object({
  itemId: z.string().uuid(),
  from: orderItemStatusEnum,
  to: orderItemStatusEnum,
});
export type SetOrderItemStatusInput = z.infer<typeof setOrderItemStatusSchema>;

/**
 * Un medio de pago aplicado al cobro del pedido (Task 6, `settleOrder`).
 * A diferencia de `tenderSchema` (lib/validations/sale.ts, TPV: `amount` llega
 * como texto en euros desde un `<input>`), aquí `amountCents` ya llega como
 * entero — el importe lo calcula el propio flujo de cobro de mostrador a
 * partir de `settleTotals`, no lo teclea el cajero línea a línea. `method`
 * reutiliza el mismo enum (`paymentMethodEnum`) que el TPV: es el mismo
 * catálogo `pos_payment_method` de la BD, no tiene sentido duplicarlo.
 */
export const settleTenderSchema = z.object({
  method: paymentMethodEnum,
  /** Un tender de 0 no tiene sentido (no es un medio de pago real); debe ser > 0. */
  amountCents: z.number().int().positive(),
  /** Método concreto del catálogo del salón (opcional, para informes); `null` si no se eligió uno. */
  paymentMethodId: z.string().uuid().nullable(),
  reference: z.string().trim().max(120).optional(),
});
export type SettleTenderInput = z.infer<typeof settleTenderSchema>;

/**
 * Payload de `settleOrder` (Task 6): liquida un pedido de mostrador,
 * materializando un `pos_sale` (ver `mostrador/actions.ts`). `sendPending`
 * cubre el flujo "pagar primero, comanda después" — si es `true`, las líneas
 * `pendiente` del pedido se mandan a cocina/barra tras cobrar (mismo efecto
 * que `sendOrderToStations`, pero encadenado al cobro).
 */
export const settleOrderSchema = z.object({
  orderId: z.string().uuid(),
  tenders: z.array(settleTenderSchema).min(1, "Selecciona al menos un medio de pago"),
  sendPending: z.boolean(),
});
export type SettleOrderInput = z.infer<typeof settleOrderSchema>;
