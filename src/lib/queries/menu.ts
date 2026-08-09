import { createClient } from "@/lib/supabase/client";
import type { MenuCategory, Product, Station } from "@/types/database";

export const menuKeys = {
  all: (salonId: string) => ["menu", salonId] as const,
  categories: (salonId: string) => [...menuKeys.all(salonId), "categories"] as const,
  stations: (salonId: string) => [...menuKeys.all(salonId), "stations"] as const,
  products: (salonId: string) => [...menuKeys.all(salonId), "products"] as const,
  modifierGroups: (salonId: string) => [...menuKeys.all(salonId), "modifierGroups"] as const,
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
