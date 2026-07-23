import type { Metadata } from "next";
import { ReceiptText } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { FacturacionEmpty } from "@/app/(dashboard)/facturacion/facturacion-empty";

export const metadata: Metadata = {
  title: "Tickets / Ventas",
};

/**
 * Facturación → Tickets / Ventas: histórico de ventas cerradas en caja.
 *
 * Andamiaje de la sección (sub-4): cabecera premium reutilizada de /ajustes y estado
 * vacío. El listado/histórico de `pos_sales` (con su detalle de líneas y cobros) fuera
 * del flujo del TPV lo cablea una tarea posterior.
 */
export default function TicketsPage(): React.ReactElement {
  return (
    <div>
      <SectionHeader
        icon={ReceiptText}
        title="Tickets / Ventas"
        description="Histórico de los tickets y ventas cerradas en la caja, con su detalle de líneas, cobros e importes."
      />

      <FacturacionEmpty
        icon={ReceiptText}
        title="Aún no hay ventas registradas"
        description="Cada venta que cierres en la caja se listará aquí con su fecha, cliente, forma de pago e importe total."
      />
    </div>
  );
}
