import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TpvView } from "@/app/(dashboard)/tpv/tpv-view";
import { activeSalonHasFeature, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Caja",
};

export default async function TpvPage({
  searchParams,
}: {
  searchParams: { appointment?: string };
}): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect("/login");
  }

  const salon = await getActiveSalon();

  if (salon === null) {
    return (
      <main className="container py-10">
        <h1 className="text-3xl font-bold tracking-tight">Caja</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  // Gating BARATO de UI: la tarjeta de escaneo de fidelización del TPV solo se
  // muestra si el salón tiene el add-on. Sin él, `lookupByQr` daría 403 en cada
  // escaneo, así que ni siquiera ofrecemos el campo.
  const loyaltyEnabled = await activeSalonHasFeature("loyalty");

  // Datos fiscales del salón (emisor de facturas), para emitir factura desde el
  // recibo del cobro. Si faltan, el propio diálogo los pide y los guarda.
  const { data: fiscalRow } = await supabase
    .from("salons")
    .select("tax_id, legal_name, fiscal_address")
    .eq("id", salon.id)
    .maybeSingle();

  return (
    <TpvView
      salonId={salon.id}
      salonName={salon.name}
      timezone={salon.timezone}
      loyaltyEnabled={loyaltyEnabled}
      issuer={{
        taxId: fiscalRow?.tax_id ?? null,
        legalName: fiscalRow?.legal_name ?? null,
        fiscalAddress: fiscalRow?.fiscal_address ?? null,
      }}
      initialAppointmentId={
        typeof searchParams.appointment === "string"
          ? searchParams.appointment
          : undefined
      }
    />
  );
}
