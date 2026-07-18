import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CustomerDetailView } from "@/app/(dashboard)/customers/[id]/customer-detail-view";
import { activeSalonHasFeature, getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

interface CustomerDetailPageProps {
  params: { id: string };
}

export async function generateMetadata({
  params,
}: CustomerDetailPageProps): Promise<Metadata> {
  const salonId = await getActiveSalonId();
  if (salonId === null) return { title: "Ficha de cliente" };

  const supabase = createClient();
  const { data } = await supabase
    .from("customers")
    .select("full_name")
    .eq("salon_id", salonId)
    .eq("id", params.id)
    .maybeSingle();

  return { title: data?.full_name ?? "Ficha de cliente" };
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect("/login");
  }

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    notFound();
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("salon_id", salonId)
    .eq("id", params.id)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }

  if (customer === null) {
    notFound();
  }

  // Gating BARATO de UI: solo mostramos el acceso a fidelización si el salón tiene
  // contratado el add-on. El gate real de datos ya vive en el servidor (la ruta y
  // `lookupByQr` devuelven 403 si no), esto solo evita ofrecer un enlace inútil.
  const loyaltyEnabled = await activeSalonHasFeature("loyalty");

  return (
    <CustomerDetailView
      salonId={salonId}
      customerId={params.id}
      initialCustomer={customer}
      loyaltyEnabled={loyaltyEnabled}
    />
  );
}
