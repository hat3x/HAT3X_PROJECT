import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FacturacionTabs } from "@/app/(dashboard)/facturacion/facturacion-tabs";
import { FeatureGateNotice } from "@/components/feature-gate-notice";
import {
  activeSalonHasFeature,
  canManageSettings,
  getActiveMembership,
} from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: {
    default: "Facturación",
    template: "%s · Facturación",
  },
};

/**
 * Layout del área de facturación.
 *
 * Guard de ruta (defensa en profundidad, como el resto del panel):
 * - Sin sesión → redirige a /login conservando el destino.
 * - Rol distinto de owner/manager (p. ej. staff) → redirige al panel. La facturación
 *   es materia fiscal/administrativa: mismo criterio que /ajustes y que el export del
 *   libro registro (`GET /api/facturacion/export`, que exige `canManageSettings`).
 *
 * A diferencia de /ajustes (barra lateral), la navegación entre secciones es una fila
 * de PESTAÑAS horizontal en cabecera: Facturas y Tickets / Ventas son vistas de tabla
 * anchas (número, fecha, cliente, base, IVA, total…) y necesitan todo el ancho útil.
 *
 * Gating por add-on `pos` (TPV) — defensa en profundidad del ocultamiento del nav
 * (`buildDashboardNavItems`): las facturas y tickets NACEN del TPV, así que sin `pos`
 * no hay libro que mostrar. Si un usuario fuerza la URL, en vez de un 404 o una
 * redirección abrupta se explica CON GRACIA con {@link FeatureGateNotice}. La agenda,
 * los clientes y la analítica de gestión siguen disponibles fuera de esta sección.
 */
export default async function FacturacionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect("/login?next=/facturacion");
  }

  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) {
    redirect("/dashboard");
  }

  const hasPos = await activeSalonHasFeature("pos");

  return (
    <main className="container py-8 md:py-10">
      <div className="mb-6 animate-fade-up">
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="mt-1.5 max-w-prose text-muted-foreground">
          Consulta el libro de facturas y el histórico de tickets y ventas de tu salón.
        </p>
      </div>

      {hasPos ? (
        <>
          <FacturacionTabs />
          <div className="min-w-0">{children}</div>
        </>
      ) : (
        <FeatureGateNotice
          title="La facturación necesita el TPV"
          description="El libro de facturas y el histórico de tickets se generan desde la caja (TPV). Activa el módulo de TPV para emitirlos y consultarlos aquí. Mientras tanto, la agenda, los clientes y la analítica de gestión siguen disponibles."
        />
      )}
    </main>
  );
}
