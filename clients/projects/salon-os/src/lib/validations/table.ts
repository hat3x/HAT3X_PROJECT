import { z } from "zod";

import { validCapacity } from "@/lib/restauracion/tables";

/**
 * Validaciones de las server actions de sala (restauración, Task 5):
 * apertura/estado/posición de mesa (operativas) y CRUD de zonas/mesas
 * (gestión). Espejo de `TableStatusValue` (lib/restauracion/tables.ts / enum
 * `public.table_status`) y `TableShape` (types/database.ts / enum
 * `public.table_shape`).
 */

export const tableStatusEnum = z.enum(["libre", "ocupada", "cuenta_pedida", "por_limpiar"]);
export const tableShapeEnum = z.enum(["round", "square"]);

// ─────────────────────────────────────────────────────────────────────────────
// Operativas: openTable, setTableStatus, saveTablePosition
// ─────────────────────────────────────────────────────────────────────────────

export const openTableSchema = z.object({
  tableId: z.string().uuid(),
  covers: z.number().int().min(1).max(99),
});
export type OpenTableInput = z.infer<typeof openTableSchema>;

export const setTableStatusSchema = z.object({
  tableId: z.string().uuid(),
  from: tableStatusEnum,
  to: tableStatusEnum,
});
export type SetTableStatusInput = z.infer<typeof setTableStatusSchema>;

export const saveTablePositionSchema = z.object({
  tableId: z.string().uuid(),
  posX: z.number(),
  posY: z.number(),
});
export type SaveTablePositionInput = z.infer<typeof saveTablePositionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Gestión: CRUD de zonas y mesas del plano de sala
// ─────────────────────────────────────────────────────────────────────────────

export const zoneSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  sortOrder: z.number().int().min(0).default(0),
});
export type ZoneInput = z.infer<typeof zoneSchema>;

/**
 * `capacityMin`/`capacityMax` reutilizan `validCapacity` (lib/restauracion/tables.ts,
 * Task 3) en vez de repetir la regla a mano — misma fuente única de verdad
 * que ya usa la UI del plano para pintar el rango de comensales de una mesa.
 *
 * Defaults alineados con la columna (migración
 * `20260810130000_restauracion_sala.sql`, fix de revisión Minor):
 * `capacity_min integer not null default 1`, `capacity_max integer not null
 * default 4`, `shape public.table_shape not null default 'square'` — un
 * payload que omite estos campos debe producir la misma fila que un INSERT
 * sin ellos directamente en SQL.
 */
export const tableSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
    zoneId: z.string().uuid(),
    capacityMin: z.number().int().min(1).default(1),
    capacityMax: z.number().int().min(1).default(4),
    shape: tableShapeEnum.default("square"),
    sortOrder: z.number().int().min(0).default(0),
  })
  .refine((t) => validCapacity(t.capacityMin, t.capacityMax), {
    message: "La capacidad máxima no puede ser menor que la mínima",
    path: ["capacityMax"],
  });
export type TableInput = z.infer<typeof tableSchema>;
