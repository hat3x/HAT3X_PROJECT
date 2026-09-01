import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TpvView } from "@/app/(dashboard)/tpv/tpv-view";
import { activeSalonHasFeature, getActiveSalon } from "@/lib/salon";
import type { OpenSaleSeed } from "@/app/(dashboard)/tpv/tpv-view";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Caja",
};

export default async function TpvPage({
  searchParams,
}: {
  searchParams: { appointment?: string; sale?: string };
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

  // Ticket ABIERTO que se viene a terminar de cobrar (`/tpv?sale=<id>`). Es el
  // camino del presupuesto: "Pasar a caja" dejó la venta creada y sin cobrar, y
  // aquí se recupera con sus líneas para que la caja la cierre.
  //
  // Se lee en el servidor y no con un hook para que la caja abra YA con el
  // ticket puesto: si llegara después, el cajero vería un instante de carrito
  // vacío sobre el que podría empezar a teclear.
  let openSale: OpenSaleSeed | null = null;
  if (typeof searchParams.sale === "string") {
    const { data } = await supabase
      .from("pos_sales")
      .select(
        "id, status, customer_id, professional_id, notes, customers(full_name), pos_sale_lines(service_id, product_id, description, quantity, unit_price_cents, vat_rate)",
      )
      .eq("id", searchParams.sale)
      .eq("salon_id", salon.id)
      .eq("status", "open")
      .maybeSingle();

    if (data !== null) {
      openSale = {
        id: data.id,
        customerId: data.customer_id,
        professionalId: data.professional_id,
        label: data.customers?.full_name ?? "Ticket pendiente",
        notes: data.notes ?? "",
        lines: (data.pos_sale_lines ?? []).map((l) => ({
          kind: l.service_id !== null ? "service" : l.product_id !== null ? "product" : "manual",
          refId: l.service_id ?? l.product_id,
          description: l.description,
          quantity: String(l.quantity),
          unitPriceCents: l.unit_price_cents,
          vatRate: String(l.vat_rate),
        })),
      };
    }
  }

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
      initialOpenSale={openSale}
    />
  );
}
