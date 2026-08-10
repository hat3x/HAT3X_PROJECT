import { z } from "zod";

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
