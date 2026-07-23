import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download, FileText } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { FacturacionEmpty } from "@/app/(dashboard)/facturacion/facturacion-empty";
import { InvoicesTable } from "@/app/(dashboard)/facturacion/facturas/invoices-table";
import { Button } from "@/components/ui/button";
import { fetchRecentInvoices, FACTURACION_LIST_LIMIT } from "@/lib/facturacion/queries";
import { getActiveSalonId } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Facturas",
};

/**
 * Facturación → Facturas: libro registro de facturas emitidas (`pos_invoices`).
 *
 * Server Component: resuelve el salón activo y lista las facturas más recientes,
 * ordenadas por fecha de expedición / número (desc). El acceso ya está guardado
 * en el layout (owner/manager); aquí se scopea además por `salon_id`. Sin datos,
 * un estado vacío intencional; con datos, la tabla enlaza a cada documento (F1/F2).
 *
 * La acción «Exportar libro» descarga el LIBRO COMPLETO desde el endpoint
 * existente `GET /api/facturacion/export` (por eso la tabla se acota a las más
 * recientes). Registro inmutable y encadenado Veri*factu: aquí es solo lectura.
 */
export default async function FacturasPage(): Promise<React.ReactElement> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    redirect("/login?next=/facturacion/facturas");
  }

  const invoices = await fetchRecentInvoices(salonId);

  return (
    <div>
      <SectionHeader
        icon={FileText}
        title="Facturas"
        description="Libro registro de las facturas emitidas por tu salón. Cada factura es un registro inmutable y encadenado (Veri*factu)."
        action={
          <Button asChild variant="outline" size="sm">
            <a href="/api/facturacion/export" download>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Exportar libro
            </a>
          </Button>
        }
      />

      {invoices.length === 0 ? (
        <FacturacionEmpty
          icon={FileText}
          title="Aún no hay facturas registradas"
          description="Cuando emitas facturas desde la caja aparecerán aquí, con su número de serie, fecha, importe y acceso al documento."
        />
      ) : (
        <>
          <InvoicesTable invoices={invoices} />
          {invoices.length === FACTURACION_LIST_LIMIT ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Se muestran las {FACTURACION_LIST_LIMIT} facturas más recientes. Descarga el
              libro completo con «Exportar libro».
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
