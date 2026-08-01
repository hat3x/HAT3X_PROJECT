"use server";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { productSchema, type ProductInput } from "@/lib/validations/product";
import type { Product, TablesInsert } from "@/types/database";

/** Resultado tipado de un Server Action de producto. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Traduce los valores validados a un payload persistible (opcionales → null). */
function toWritePayload(
  values: ReturnType<typeof productSchema.parse>,
): Omit<TablesInsert<"products">, "salon_id"> {
  return {
    name: values.name,
    description: values.description ?? null,
    price_cents: values.price,
    vat_rate: values.vat_rate,
    stock: values.stock,
    min_stock: values.min_stock,
    unit: values.unit,
    active: values.active,
  };
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/** Crea un producto en el catálogo del salón activo. */
export async function createProduct(
  input: ProductInput,
): Promise<ActionResult<Product>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ salon_id: salonId, ...toWritePayload(parsed.data) })
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/products");
  return { ok: true, data };
}

/** Actualiza un producto existente del catálogo. */
export async function updateProduct(
  productId: string,
  input: ProductInput,
): Promise<ActionResult<Product>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .update(toWritePayload(parsed.data))
    .eq("id", productId)
    .eq("salon_id", salonId)
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/products");
  return { ok: true, data };
}

/** Elimina un producto del catálogo. */
export async function deleteProduct(
  productId: string,
): Promise<ActionResult<null>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("salon_id", salonId);

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/products");
  return { ok: true, data: null };
}
