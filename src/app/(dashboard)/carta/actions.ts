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

/** Cliente de Supabase con el tipo `Database` (para pasar entre helpers de guarda). */
type SupabaseServerClient = ReturnType<typeof createClient>;

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
//
// El FK compuesto (product_id/group_id, salon_id) ya impide en la base que se
// asignen productos o grupos de otro salón — el aislamiento multi-tenant no
// depende de esta comprobación. `assertProductAndGroupsInSalon` es solo
// PARIDAD con la convención de `assertLocationInSalon`/`assertServicesInSalon`
// (ajustes/personal/actions.ts): devuelve un mensaje legible en español en vez
// de dejar que el insert falle con un error crudo de constraint de Postgres.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarda de tenant: confirma que el producto y TODOS los grupos de
 * modificadores pertenecen al salón activo antes de reemplazar la
 * asignación. Un solo mensaje combinado (no se distingue cuál de los dos
 * falló) porque al cliente le basta saber que algo no pertenece a su salón.
 */
async function assertProductAndGroupsInSalon(
  supabase: SupabaseServerClient,
  salonId: string,
  productId: string,
  groupIds: string[],
): Promise<string | null> {
  const MISMATCH = "El producto o alguno de los grupos no pertenece a tu salón";

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (productError !== null) return productError.message;
  if (product === null) return MISMATCH;

  if (groupIds.length === 0) return null;

  const { data: groups, error: groupsError } = await supabase
    .from("modifier_groups")
    .select("id")
    .eq("salon_id", salonId)
    .in("id", groupIds);
  if (groupsError !== null) return groupsError.message;
  if (groups.length !== groupIds.length) return MISMATCH;

  return null;
}

export async function setProductModifierGroups(
  productId: string,
  groupIds: string[],
): Promise<ActionResult<null>> {
  const parsed = modifierGroupIdsSchema.safeParse(groupIds);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();

  const membershipError = await assertProductAndGroupsInSalon(
    supabase,
    salonId,
    productId,
    parsed.data,
  );
  if (membershipError !== null) return { ok: false, error: membershipError };

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
//
// Igual que en `setProductModifierGroups`: los FK compuestos de
// `combo_components` (combo_product_id/component_product_id/station_id_override,
// salon_id) ya garantizan el aislamiento en la base. Estas comprobaciones son
// PARIDAD con la convención del repo y dan un error amable en español antes
// de intentar el insert.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarda de tenant para el combo: el producto combo y cada
 * `componentProductId` deben pertenecer al salón activo (una sola consulta a
 * `products` por lote, vía `in`).
 */
async function assertComboProductsInSalon(
  supabase: SupabaseServerClient,
  salonId: string,
  comboProductId: string,
  pieces: ComboPieceInput[],
): Promise<string | null> {
  const productIds = [...new Set([comboProductId, ...pieces.map((p) => p.componentProductId)])];

  const { data: products, error } = await supabase
    .from("products")
    .select("id")
    .eq("salon_id", salonId)
    .in("id", productIds);
  if (error !== null) return error.message;
  if (products.length !== productIds.length) {
    return "El combo o alguna de sus piezas no pertenece a tu salón";
  }
  return null;
}

/**
 * Guarda de tenant para el ruteo por pieza: cada `stationIdOverride` NO nulo
 * debe pertenecer al salón activo.
 */
async function assertComboStationOverridesInSalon(
  supabase: SupabaseServerClient,
  salonId: string,
  pieces: ComboPieceInput[],
): Promise<string | null> {
  const stationIds = [
    ...new Set(pieces.map((p) => p.stationIdOverride).filter((id): id is string => id !== null)),
  ];
  if (stationIds.length === 0) return null;

  const { data: stations, error } = await supabase
    .from("stations")
    .select("id")
    .eq("salon_id", salonId)
    .in("id", stationIds);
  if (error !== null) return error.message;
  if (stations.length !== stationIds.length) {
    return "La estación de ruteo de alguna pieza no pertenece a tu salón";
  }
  return null;
}

export async function saveCombo(
  comboProductId: string,
  pieces: ComboPieceInput[],
): Promise<ActionResult<null>> {
  const parsed = comboPiecesSchema.safeParse(pieces);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();

  const productsError = await assertComboProductsInSalon(supabase, salonId, comboProductId, parsed.data);
  if (productsError !== null) return { ok: false, error: productsError };

  const stationsError = await assertComboStationOverridesInSalon(supabase, salonId, parsed.data);
  if (stationsError !== null) return { ok: false, error: stationsError };

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
