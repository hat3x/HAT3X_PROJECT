"use server";

import { revalidatePath } from "next/cache";

import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { customerSchema, type CustomerInput } from "@/lib/validations/customer";
import type { Customer, TablesInsert } from "@/types/database";

/** Resultado tipado de un Server Action de cliente. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Traduce los valores validados a un payload persistible (opcionales → null). */
function toWritePayload(
  values: ReturnType<typeof customerSchema.parse>,
): Omit<TablesInsert<"customers">, "salon_id"> {
  return {
    full_name: values.full_name,
    email: values.email ?? null,
    phone: values.phone ?? null,
    birth_date: values.birth_date ?? null,
    notes: values.notes ?? null,
    marketing_consent: values.marketing_consent,
    tax_id: values.tax_id ?? null,
    address: values.address ?? null,
  };
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/** Crea un cliente en el salón activo. */
export async function createCustomer(
  input: CustomerInput,
): Promise<ActionResult<Customer>> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ salon_id: salonId, ...toWritePayload(parsed.data) })
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/customers");
  return { ok: true, data };
}

/** Actualiza la ficha de un cliente existente. */
export async function updateCustomer(
  customerId: string,
  input: CustomerInput,
): Promise<ActionResult<Customer>> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .update(toWritePayload(parsed.data))
    .eq("id", customerId)
    .eq("salon_id", salonId)
    .select("*")
    .single();

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, data };
}

/** Elimina la ficha de un cliente. */
export async function deleteCustomer(
  customerId: string,
): Promise<ActionResult<null>> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("salon_id", salonId);

  if (error !== null) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/customers");
  return { ok: true, data: null };
}
