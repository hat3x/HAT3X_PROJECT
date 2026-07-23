import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { FacturacionEmpty } from "@/app/(dashboard)/facturacion/facturacion-empty";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Facturas",
};

/**
 * Facturación → Facturas: libro registro de facturas emitidas.
 *
 * Andamiaje de la sección (sub-4): cabecera premium reutilizada de /ajustes y estado
 * vacío. El listado de `pos_invoices` (registro inmutable y encadenado Veri*factu) lo
 * cablea una tarea posterior. La acción «Exportar libro» ya funciona: enlaza al endpoint
 * existente `GET /api/facturacion/export`, protegido en servidor para owner/manager
 * (mismo criterio que el guard de este layout).
 */
export default function FacturasPage(): React.ReactElement {
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

      <FacturacionEmpty
        icon={FileText}
        title="Aún no hay facturas registradas"
        description="Cuando emitas facturas desde la caja aparecerán aquí, con su número de serie, fecha, importe y acceso al documento."
      />
    </div>
  );
}
