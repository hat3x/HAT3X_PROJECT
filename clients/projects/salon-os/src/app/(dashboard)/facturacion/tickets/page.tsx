import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { FacturacionEmpty } from "@/app/(dashboard)/facturacion/facturacion-empty";
import { SalesTable } from "@/app/(dashboard)/facturacion/tickets/sales-table";
import { fetchRecentSales, FACTURACION_LIST_LIMIT } from "@/lib/facturacion/queries";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Tickets / Ventas",
};

/**
 * Facturación → Tickets / Ventas: histórico de ventas cerradas en caja (`pos_sales`).
 *
 * Server Component: resuelve el salón activo y lista las ventas más recientes
 * (`sold_at` desc), con la sede (vía sesión de caja), el profesional, el cliente y
 * los métodos de pago embebidos en una sola consulta. El acceso ya está guardado en
 * el layout (owner/manager); aquí se scopea además por `salon_id`. Solo lectura.
 */
export default async function TicketsPage(): Promise<React.ReactElement> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    redirect("/login?next=/facturacion/tickets");
  }

  const sales = await fetchRecentSales(salonId);

  return (
    <div>
      <SectionHeader
        icon={ReceiptText}
        title="Tickets / Ventas"
        description="Histórico de los tickets y ventas cerradas en la caja, con su detalle de líneas, cobros e importes."
      />

      {sales.length === 0 ? (
        <FacturacionEmpty
          icon={ReceiptText}
          title="Aún no hay ventas registradas"
          description="Cada venta que cierres en la caja se listará aquí con su fecha, cliente, forma de pago e importe total."
        />
      ) : (
        <>
          <SalesTable sales={sales} />
          {sales.length === FACTURACION_LIST_LIMIT ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Se muestran las {FACTURACION_LIST_LIMIT} ventas más recientes.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
