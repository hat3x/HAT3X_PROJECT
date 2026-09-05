import { createClient } from "@/lib/supabase/client";
import type {
  ComboComponent,
  MenuCategory,
  Modifier,
  ModifierGroup,
  Product,
  Station,
} from "@/types/database";

export const menuKeys = {
  all: (salonId: string) => ["menu", salonId] as const,
  categories: (salonId: string) => [...menuKeys.all(salonId), "categories"] as const,
  stations: (salonId: string) => [...menuKeys.all(salonId), "stations"] as const,
  products: (salonId: string) => [...menuKeys.all(salonId), "products"] as const,
  modifierGroups: (salonId: string) => [...menuKeys.all(salonId), "modifierGroups"] as const,
  modifierOptions: (salonId: string, groupId: string) =>
    [...menuKeys.all(salonId), "modifierOptions", groupId] as const,
  comboComponents: (salonId: string, comboProductId: string) =>
    [...menuKeys.all(salonId), "comboComponents", comboProductId] as const,
  productModifierGroups: (salonId: string, productId: string) =>
    [...menuKeys.all(salonId), "productModifierGroups", productId] as const,
};

export async function fetchMenuCategories(salonId: string): Promise<MenuCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_categories").select("*")
    .eq("salon_id", salonId).order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchStations(salonId: string): Promise<Station[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stations").select("*")
    .eq("salon_id", salonId).order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchMenuProducts(salonId: string): Promise<Product[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products").select("*")
    .eq("salon_id", salonId).order("name", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

export async function fetchModifierGroups(salonId: string): Promise<ModifierGroup[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("modifier_groups").select("*")
    .eq("salon_id", salonId).order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

/** Opciones (`modifiers`) de UN grupo — para precargar el formulario al editar. */
export async function fetchModifierOptions(
  salonId: string,
  groupId: string,
): Promise<Modifier[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("modifiers").select("*")
    .eq("salon_id", salonId).eq("group_id", groupId)
    .order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

/** Piezas (`combo_components`) de UN combo — para precargar el formulario al editar. */
export async function fetchComboComponents(
  salonId: string,
  comboProductId: string,
): Promise<ComboComponent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("combo_components").select("*")
    .eq("salon_id", salonId).eq("combo_product_id", comboProductId)
    .order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}

/** Ids de los grupos de modificadores asignados a UN producto — para precargar el selector. */
export async function fetchProductModifierGroups(
  salonId: string,
  productId: string,
): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_modifier_groups").select("group_id")
    .eq("salon_id", salonId).eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data.map((row) => row.group_id);
}

/** Un enlace producto↔grupo de modificadores (fila cruda de `product_modifier_groups`). */
export interface ProductModifierGroupLink {
  product_id: string;
  group_id: string;
}

/**
 * TODAS las asignaciones producto↔grupo del salón en una sola consulta (Task 8,
 * mostrador). A diferencia de {@link fetchProductModifierGroups} (un producto,
 * para precargar su formulario de edición), esta trae el salón entero de una
 * vez: el mostrador necesita decidir, para CADA botón de la rejilla, si el
 * producto tiene grupos asignados (abre el selector de modificadores) o no
 * (se añade directo) — una consulta por producto no escalaría.
 */
export async function fetchAllProductModifierGroups(
  salonId: string,
): Promise<ProductModifierGroupLink[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_modifier_groups").select("product_id,group_id")
    .eq("salon_id", salonId);
  if (error !== null) throw new Error(error.message);
  return data;
}

/**
 * Opciones (`modifiers`) de VARIOS grupos a la vez — para el selector de
 * modificadores del mostrador (Task 8), que muestra todos los grupos
 * asignados a un producto de golpe. A diferencia de {@link fetchModifierOptions}
 * (un grupo, para precargar el formulario de edición de carta), agrupar la
 * consulta evita un hook por cada grupo del producto.
 */
export async function fetchModifierOptionsForGroups(
  salonId: string,
  groupIds: string[],
): Promise<Modifier[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("modifiers").select("*")
    .eq("salon_id", salonId).in("group_id", groupIds)
    .order("sort_order", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return data;
}
