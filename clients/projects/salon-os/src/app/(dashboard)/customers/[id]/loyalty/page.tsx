import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CustomerLoyaltyView } from "@/app/(dashboard)/customers/[id]/loyalty/loyalty-view";
import { lookupByQr, LoyaltyActionError } from "@/lib/loyalty/server";
import type { LoyaltyLookupResult } from "@/lib/loyalty/types";
import { activeSalonHasFeature, getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

interface CustomerLoyaltyPageProps {
  params: { id: string };
}

export const metadata: Metadata = {
  title: "Fidelización",
};

/**
 * Ficha de fidelización de un cliente (puntos, cupones, recompensas y carné QR).
 *
 * GATING DE UI: la fidelización es un add-on contratable. Si el salón no lo tiene
 * activo devolvemos al usuario a la ficha del cliente en lugar de renderizar una
 * pantalla vacía o filtrar el estado del add-on. Es la contraparte del enlace
 * oculto en la ficha (`activeSalonHasFeature`), no un sustituto del gate de datos:
 * `lookupByQr` vuelve a comprobar el entitlement y responde 403 si alguien fuerza
 * la URL, así que aquí el chequeo es sobre todo cortesía (evita el trabajo y el
 * error feo). Reutilizamos `lookupByQr` —ya probado y feature-gated— resolviendo
 * el `qr_token` del cliente, y la vista nativa `CustomerLoyaltyView`.
 */
export default async function CustomerLoyaltyPage({
  params,
}: CustomerLoyaltyPageProps): Promise<React.ReactElement> {
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

  // Sin el add-on, la fidelización no existe para este salón: de vuelta a la ficha.
  const loyaltyEnabled = await activeSalonHasFeature("loyalty");
  if (!loyaltyEnabled) {
    redirect(`/customers/${params.id}`);
  }

  // `lookupByQr` trabaja por token QR; resolvemos el del cliente (acotado al salón,
  // aislamiento multi-tenant) para reaprovechar esa lectura sin duplicar consultas.
  const { data: customer, error } = await supabase
    .from("customers")
    .select("qr_token")
    .eq("salon_id", salonId)
    .eq("id", params.id)
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  if (customer === null) {
    notFound();
  }

  let lookup: LoyaltyLookupResult;
  try {
    lookup = await lookupByQr(customer.qr_token);
  } catch (caught) {
    // Defensa en profundidad: si el gate del servidor rechaza (add-on desactivado
    // entre la comprobación y aquí), volvemos a la ficha; un QR inexistente = 404.
    if (caught instanceof LoyaltyActionError) {
      if (caught.code === "feature_not_enabled") {
        redirect(`/customers/${params.id}`);
      }
      if (caught.code === "not_found") {
        notFound();
      }
    }
    throw caught;
  }

  return <CustomerLoyaltyView customerId={params.id} lookup={lookup} />;
}
