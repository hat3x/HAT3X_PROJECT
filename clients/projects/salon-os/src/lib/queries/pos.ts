import { createClient } from "@/lib/supabase/client";
import { zonedWallTimeToUtc } from "@/lib/booking/timezone";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { PosPaymentMethodRow, Product, Service } from "@/types/database";

/**
 * Consultas de lectura de la caja (TPV), scopeadas por `salonId` para aislar
 * tenants en la caché de TanStack Query. La ESCRITURA de la venta vive en el
 * Server Action (`app/(dashboard)/tpv/actions.ts`), no aquí.
 */
export const posKeys = {
  all: (salonId: string) => ["pos", salonId] as const,
  services: (salonId: string, search: string) =>
    [...posKeys.all(salonId), "services", { search }] as const,
  products: (salonId: string, search: string) =>
    [...posKeys.all(salonId), "products", { search }] as const,
  paymentMethods: (salonId: string) =>
    [...posKeys.all(salonId), "payment-methods"] as const,
  appointments: (salonId: string, date: string) =>
    [...posKeys.all(salonId), "appointments", date] as const,
};

/** Servicios activos del salón (catálogo para añadir líneas), con búsqueda. */
export async function fetchSaleServices(
  salonId: string,
  search: string,
): Promise<Service[]> {
  const supabase = createClient();
  let query = supabase
    .from("services")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .order("name", { ascending: true });

  const term = search.trim();
  if (term !== "") {
    const pattern = `%${term}%`;
    query = query.or(`name.ilike.${pattern},category.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/** Productos activos del salón (catálogo para añadir líneas), con búsqueda. */
export async function fetchSaleProducts(
  salonId: string,
  search: string,
): Promise<Product[]> {
  const supabase = createClient();
  let query = supabase
    .from("products")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .order("name", { ascending: true });

  const term = search.trim();
  if (term !== "") {
    const pattern = `%${term}%`;
    query = query.or(`name.ilike.${pattern},description.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/**
 * Métodos de pago activos del catálogo del salón (`pos_payment_methods`),
 * ordenados por `sort_order`. Sirven para etiquetar y clasificar los tenders.
 */
export async function fetchSalePaymentMethods(
  salonId: string,
): Promise<PosPaymentMethodRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_payment_methods")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/**
 * Citas de un día local (convertido a UTC) para arrancar una venta "desde cita".
 * Reutiliza el enriquecido de {@link AppointmentWithDetails}: la venta prellena
 * cliente, profesional y el servicio como primera línea.
 */
export async function fetchOpenAppointments(
  salonId: string,
  date: string,
  timezone: string,
): Promise<AppointmentWithDetails[]> {
  const supabase = createClient();

  const start = zonedWallTimeToUtc(date, "00:00", timezone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "*, customer:customers(full_name, phone, email), professional:professionals(full_name, color), service:services(name, duration_minutes)",
    )
    .eq("salon_id", salonId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return (data ?? []) as AppointmentWithDetails[];
}
