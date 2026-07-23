import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FacturacionTabs } from "@/app/(dashboard)/facturacion/facturacion-tabs";
import { canManageSettings, getActiveMembership } from "@/lib/salon";
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

  return (
    <main className="container py-8 md:py-10">
      <div className="mb-6 animate-fade-up">
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="mt-1.5 max-w-prose text-muted-foreground">
          Consulta el libro de facturas y el histórico de tickets y ventas de tu salón.
        </p>
      </div>

      <FacturacionTabs />

      <div className="min-w-0">{children}</div>
    </main>
  );
}
