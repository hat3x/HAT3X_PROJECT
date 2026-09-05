import type { Metadata } from "next";

import { ListaEsperaView } from "@/app/(dashboard)/appointments/lista-espera/lista-espera-view";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Lista de espera",
};

/**
 * Lista de espera — quién quiere adelantar su cita.
 *
 * SIN guard de sector, a diferencia de las secciones clínicas: un hueco que se
 * pierde se pierde igual en una peluquería o en un restaurante. Limitarla a
 * odontología sería regalarle la función al resto de sectores por descuido.
 *
 * El layout del panel ya cubre sesión y pertenencia al salón; las escrituras
 * pasan además por el gate de `waitlist-actions.ts` y por RLS.
 */
export default async function ListaEsperaPage(): Promise<React.ReactElement> {
  const salonId = await getActiveSalonId();

  if (salonId === null) {
    return (
      <main className="container py-10">
        <p className="text-sm text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  return (
    <main className="container py-6">
      <ListaEsperaView salonId={salonId} />
    </main>
  );
}
