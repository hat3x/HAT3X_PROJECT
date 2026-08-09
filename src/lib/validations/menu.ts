import { z } from "zod";

const ALLERGENS = [
  "gluten","crustaceos","huevos","pescado","cacahuetes","soja","lacteos",
  "frutos_cascara","apio","mostaza","sesamo","sulfitos","altramuces","moluscos",
] as const;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  sortOrder: z.number().int().min(0).default(0),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const stationSchema = categorySchema; // misma forma
export type StationInput = z.infer<typeof stationSchema>;

export const menuProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  priceCents: z.number().int().min(0, "El precio no puede ser negativo"),
  vatRate: z.number().min(0).max(100).default(10),
  categoryId: z.string().uuid().nullable(),
  stationId: z.string().uuid().nullable(),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  isCombo: z.boolean().default(false),
  imageUrl: z.string().url().nullable().default(null),
});
export type MenuProductInput = z.infer<typeof menuProductSchema>;

export const modifierGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  required: z.boolean().default(false),
  modifiers: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    priceDeltaCents: z.number().int().default(0),
  })).default([]),
}).refine((g) => g.minSelect <= g.maxSelect, { message: "min no puede superar a max", path: ["minSelect"] });
export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Esquemas adicionales (no dados verbatim en el brief) requeridos por las
// server actions `saveModifierGroup`, `setProductModifierGroups` y `saveCombo`
// del Produces del Task 6. Documentados en el informe de la tarea.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entrada de `saveModifierGroup`: misma forma que `modifierGroupSchema` más un
 * `id` opcional que decide inserción (id `null`) vs actualización (id con
 * valor) del grupo. `modifierGroupSchema` se deja verbatim/reusable (p. ej.
 * para tipar valores por defecto de un formulario de alta); esta variante es
 * la que valida el payload real de la Server Action, que necesita distinguir
 * "guardar nuevo" de "guardar existente" en una sola función de guardado.
 */
export const saveModifierGroupSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(120),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  required: z.boolean().default(false),
  modifiers: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    priceDeltaCents: z.number().int().default(0),
  })).default([]),
}).refine((g) => g.minSelect <= g.maxSelect, { message: "min no puede superar a max", path: ["minSelect"] });
export type SaveModifierGroupInput = z.infer<typeof saveModifierGroupSchema>;

/** Entrada de `setProductModifierGroups`: ids de grupo a asignar al producto. */
export const modifierGroupIdsSchema = z.array(z.string().uuid());

/** Una pieza de combo para `saveCombo` (fila destino de `combo_components`). */
export const comboPieceSchema = z.object({
  componentProductId: z.string().uuid(),
  qty: z.number().int().min(1).default(1),
  stationIdOverride: z.string().uuid().nullable().default(null),
});
export type ComboPieceInput = z.infer<typeof comboPieceSchema>;

/** Entrada de `saveCombo`: lista completa de piezas del combo. */
export const comboPiecesSchema = z.array(comboPieceSchema);
