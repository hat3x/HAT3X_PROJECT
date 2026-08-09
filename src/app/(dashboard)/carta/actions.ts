"use server";
import { revalidatePath } from "next/cache";

import { canManageSettings, getActiveMembership, getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  categorySchema,
  comboPiecesSchema,
  menuProductSchema,
  modifierGroupIdsSchema,
  saveModifierGroupSchema,
  stationSchema,
  type CategoryInput,
  type ComboPieceInput,
  type MenuProductInput,
  type SaveModifierGroupInput,
  type StationInput,
} from "@/lib/validations/menu";
import type { MenuCategory, ModifierGroup, Product, Station } from "@/types/database";

/**
 * Server actions de la carta (restauración): categorías, estaciones,
 * productos, grupos de modificadores (con sus opciones), asignación de
 * grupos a producto y piezas de combo.
 *
 * Todas siguen el mismo patrón de confianza en servidor: `safeParse` de Zod
 * ANTES de tocar la base de datos, gate de rol vía {@link assertManager} (que
 * también resuelve el salón activo), y escritura SIEMPRE acotada por
 * `salon_id` (defensa en profundidad además de RLS). Cada mutación revalida
 * `/carta` para refrescar los Server Components que lean el catálogo.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Resuelve el salón activo SI el usuario tiene rol de gestión (owner/manager).
 * Devuelve `null` cuando no hay permiso (rol insuficiente) o no hay salón
 * asignado; en ambos casos la action responde con el mismo mensaje de
 * "sin permiso" — no se distingue el motivo al cliente.
 */
async function assertManager(): Promise<string | null> {
  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) return null;
  return getActiveSalonId();
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}

const NO_PERMISSION = "No tienes permiso para gestionar la carta";

// ─────────────────────────────────────────────────────────────────────────────
// Categorías
// ─────────────────────────────────────────────────────────────────────────────

export async function createCategory(input: CategoryInput): Promise<ActionResult<MenuCategory>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .insert({ salon_id: salonId, name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data };
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
): Promise<ActionResult<MenuCategory>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .update({ name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .eq("id", id).eq("salon_id", salonId)
    .select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data };
}

export async function deleteCategory(id: string): Promise<ActionResult<null>> {
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { error } = await supabase
    .from("menu_categories")
    .delete()
    .eq("id", id).eq("salon_id", salonId);
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Estaciones (misma forma que categorías: nombre + orden)
// ─────────────────────────────────────────────────────────────────────────────

export async function createStation(input: StationInput): Promise<ActionResult<Station>> {
  const parsed = stationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("stations")
    .insert({ salon_id: salonId, name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data };
}

export async function updateStation(
  id: string,
  input: StationInput,
): Promise<ActionResult<Station>> {
  const parsed = stationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("stations")
    .update({ name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .eq("id", id).eq("salon_id", salonId)
    .select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data };
}

export async function deleteStation(id: string): Promise<ActionResult<null>> {
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { error } = await supabase
    .from("stations")
    .delete()
    .eq("id", id).eq("salon_id", salonId);
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Productos de carta
// ─────────────────────────────────────────────────────────────────────────────

export async function createMenuProduct(input: MenuProductInput): Promise<ActionResult<Product>> {
  const parsed = menuProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      salon_id: salonId, name: parsed.data.name, price_cents: parsed.data.priceCents,
      vat_rate: parsed.data.vatRate, category_id: parsed.data.categoryId,
      station_id: parsed.data.stationId, allergens: parsed.data.allergens,
      is_combo: parsed.data.isCombo, image_url: parsed.data.imageUrl,
    })
    .select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data };
}

export async function updateMenuProduct(
  id: string,
  input: MenuProductInput,
): Promise<ActionResult<Product>> {
  const parsed = menuProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name, price_cents: parsed.data.priceCents,
      vat_rate: parsed.data.vatRate, category_id: parsed.data.categoryId,
      station_id: parsed.data.stationId, allergens: parsed.data.allergens,
      is_combo: parsed.data.isCombo, image_url: parsed.data.imageUrl,
    })
    .eq("id", id).eq("salon_id", salonId)
    .select("*").single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data };
}

export async function deleteMenuProduct(id: string): Promise<ActionResult<null>> {
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id).eq("salon_id", salonId);
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/carta");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Grupos de modificadores: guarda el grupo (inserta si `id` es null, si no
// actualiza) y SIEMPRE reemplaza sus opciones (`modifiers`): borra las
// existentes del grupo y reinserta las del payload. Ver decisión de diseño
// en `saveModifierGroupSchema` (validations/menu.ts).
// ─────────────────────────────────────────────────────────────────────────────

export async function saveModifierGroup(
  input: SaveModifierGroupInput,
): Promise<ActionResult<ModifierGroup>> {
  const parsed = saveModifierGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const groupPayload = {
    salon_id: salonId,
    name: parsed.data.name,
    min_select: parsed.data.minSelect,
    max_select: parsed.data.maxSelect,
    required: parsed.data.required,
  };
  const groupId = parsed.data.id;

  const { data: group, error: groupError } =
    groupId === null
      ? await supabase.from("modifier_groups").insert(groupPayload).select("*").single()
      : await supabase
          .from("modifier_groups")
          .update(groupPayload)
          .eq("id", groupId).eq("salon_id", salonId)
          .select("*").single();
  if (groupError !== null) return { ok: false, error: groupError.message };

  const { error: deleteError } = await supabase
    .from("modifiers")
    .delete()
    .eq("group_id", group.id).eq("salon_id", salonId);
  if (deleteError !== null) return { ok: false, error: deleteError.message };

  if (parsed.data.modifiers.length > 0) {
    const { error: insertError } = await supabase.from("modifiers").insert(
      parsed.data.modifiers.map((m) => ({
        salon_id: salonId,
        group_id: group.id,
        name: m.name,
        price_delta_cents: m.priceDeltaCents,
      })),
    );
    if (insertError !== null) return { ok: false, error: insertError.message };
  }

  revalidatePath("/carta");
  return { ok: true, data: group };
}

// ─────────────────────────────────────────────────────────────────────────────
// Asignación de grupos de modificadores a un producto: reemplaza por
// completo las filas de `product_modifier_groups` del producto (borra e
// inserta), acotado por `salon_id`.
// ─────────────────────────────────────────────────────────────────────────────

export async function setProductModifierGroups(
  productId: string,
  groupIds: string[],
): Promise<ActionResult<null>> {
  const parsed = modifierGroupIdsSchema.safeParse(groupIds);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { error: deleteError } = await supabase
    .from("product_modifier_groups")
    .delete()
    .eq("product_id", productId).eq("salon_id", salonId);
  if (deleteError !== null) return { ok: false, error: deleteError.message };

  if (parsed.data.length > 0) {
    const { error: insertError } = await supabase.from("product_modifier_groups").insert(
      parsed.data.map((groupId, index) => ({
        salon_id: salonId,
        product_id: productId,
        group_id: groupId,
        sort_order: index,
      })),
    );
    if (insertError !== null) return { ok: false, error: insertError.message };
  }

  revalidatePath("/carta");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de un combo: reemplaza por completo `combo_components` del combo
// (borra e inserta), acotado por `salon_id`.
// ─────────────────────────────────────────────────────────────────────────────

export async function saveCombo(
  comboProductId: string,
  pieces: ComboPieceInput[],
): Promise<ActionResult<null>> {
  const parsed = comboPiecesSchema.safeParse(pieces);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { error: deleteError } = await supabase
    .from("combo_components")
    .delete()
    .eq("combo_product_id", comboProductId).eq("salon_id", salonId);
  if (deleteError !== null) return { ok: false, error: deleteError.message };

  if (parsed.data.length > 0) {
    const { error: insertError } = await supabase.from("combo_components").insert(
      parsed.data.map((piece, index) => ({
        salon_id: salonId,
        combo_product_id: comboProductId,
        component_product_id: piece.componentProductId,
        qty: piece.qty,
        station_id_override: piece.stationIdOverride,
        sort_order: index,
      })),
    );
    if (insertError !== null) return { ok: false, error: insertError.message };
  }

  revalidatePath("/carta");
  return { ok: true, data: null };
}
