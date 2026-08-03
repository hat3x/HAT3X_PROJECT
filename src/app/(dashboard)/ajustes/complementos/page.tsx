import type { Metadata } from "next";

import { ComplementosView } from "@/app/(dashboard)/ajustes/complementos/complementos-view";
import { SectionPlaceholder } from "@/app/(dashboard)/ajustes/section-placeholder";
import { getActiveSalonId } from "@/lib/salon";
import { getReceptionistName, listSalonFeatures } from "@/lib/salon-features";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Complementos",
};

/**
 * Ajustes → Complementos: vista de SOLO CONSULTA de los add-ons (entitlements) que el
 * salón tiene contratados con HAT3X. Componente de servidor puro: lee la verdad de
 * `public.salon_features` con el cliente RLS de la sesión (un miembro solo ve los
 * entitlements de SU salón) y la pinta sin ningún control de activación.
 *
 * Por qué SIN escritura: la provisión de add-ons la fija HAT3X (venta/alta del plan) vía
 * service_role; la RLS de `salon_features` no concede NINGUNA política de escritura a
 * `authenticated` (deny-by-default). Ofrecer aquí un interruptor sería una mentira de UI
 * que la BD rechazaría. Ver `supabase/migrations/20260718100000_salon_features.sql`.
 */
export default async function ComplementosPage(): Promise<React.ReactElement> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return (
      <SectionPlaceholder
        title="Complementos"
        description="No tienes un salón asignado."
      />
    );
  }

  // Una sola consulta para los cinco add-ons (vs. N gates); el mapa distingue los tres
  // estados que la vista necesita (contratado / en pausa / no contratado). Aparte, el
  // nombre de la recepcionista IA (si está vinculada y activa) para verificar identidad.
  const supabase = createClient();
  const [features, receptionistName] = await Promise.all([
    listSalonFeatures(supabase, salonId),
    getReceptionistName(supabase, salonId),
  ]);

  return (
    <ComplementosView features={features} receptionistName={receptionistName} />
  );
}
