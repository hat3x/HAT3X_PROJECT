import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download, FileText, SearchX } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { FacturacionEmpty } from "@/app/(dashboard)/facturacion/facturacion-empty";
import { ImmutabilityNote } from "@/app/(dashboard)/facturacion/immutability-note";
import {
  InvoicesFilters,
  type LocationOption,
} from "@/app/(dashboard)/facturacion/facturas/invoices-filters";
import { InvoicesTable } from "@/app/(dashboard)/facturacion/facturas/invoices-table";
import { Button } from "@/components/ui/button";
import {
  hasActiveInvoiceFilters,
  parseInvoiceFilters,
  type RawSearchParams,
} from "@/lib/facturacion/filters";
import {
  fetchFilteredInvoices,
  fetchInvoiceTotals,
  FACTURACION_LIST_LIMIT,
} from "@/lib/facturacion/queries";
import { localTodayIso } from "@/lib/metrics/range";
import { getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Facturas",
};

/** Moneda del salón (España / Veri*factu → EUR por ahora). */
const CURRENCY = "EUR";

interface FacturasPageProps {
  searchParams: RawSearchParams;
}

/**
 * Facturación → Facturas: libro registro de facturas emitidas (`pos_invoices`) con
 * FILTROS resueltos en servidor y una fila de TOTALES del periodo filtrado.
 *
 * Server Component: resuelve el salón activo, lee las sedes (para el selector y para
 * validar el filtro de sede) y traduce los `searchParams` de la URL a filtros
 * canónicos. Con esos filtros consulta EN PARALELO la lista (RPC
 * `salon_invoices_filtered`, acotada a las más recientes) y los totales del periodo
 * (RPC `salon_invoices_totals`, sobre todo el conjunto) — nunca trae facturas en
 * crudo para sumarlas. El acceso ya está guardado en el layout (owner/manager); aquí
 * se scopea además por `salon_id`.
 *
 * Estados: carga (`loading.tsx`), error (`error.tsx`) y dos vacíos — sin facturas en
 * absoluto (estado inicial) vs sin resultados para los filtros (con acción de
 * limpiar). Registro inmutable y encadenado Veri*factu: aquí es solo lectura. La
 * acción «Exportar libro» descarga el LIBRO COMPLETO desde `GET /api/facturacion/export`.
 */
export default async function FacturasPage({
  searchParams,
}: FacturasPageProps): Promise<React.ReactElement> {
  const salon = await getActiveSalon();
  if (salon === null) {
    redirect("/login?next=/facturacion/facturas");
  }

  // Sedes del salón (activas e inactivas: una sede desactivada aún conserva su
  // histórico de facturas y debe poder filtrarse). Sirven al selector y validan el
  // filtro de sede de la URL.
  const supabase = createClient();
  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, active")
    .eq("salon_id", salon.id)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  const locations: LocationOption[] = (locationRows ?? []).map((loc) => ({
    id: loc.id,
    name: loc.name,
  }));

  const filters = parseInvoiceFilters(
    searchParams,
    locations.map((loc) => loc.id),
  );
  const filtersActive = hasActiveInvoiceFilters(filters);

  const [invoices, totals] = await Promise.all([
    fetchFilteredInvoices(salon.id, filters),
    fetchInvoiceTotals(salon.id, filters),
  ]);

  // Sin ningún filtro y sin facturas → el salón aún no tiene libro: estado vacío
  // «pristino», sin barra de filtros (no hay nada que filtrar).
  const isPristineEmpty = invoices.length === 0 && !filtersActive;
  const truncated = totals.invoiceCount > invoices.length;

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

      <ImmutabilityNote variant="invoice" className="mb-6" />

      {isPristineEmpty ? (
        <FacturacionEmpty
          icon={FileText}
          title="Aún no hay facturas registradas"
          description="Cuando emitas facturas desde la caja aparecerán aquí, con su número de serie, fecha, importe y acceso al documento."
        />
      ) : (
        <>
          <InvoicesFilters
            filters={filters}
            locations={locations}
            maxDate={localTodayIso(salon.timezone)}
          />

          {invoices.length === 0 ? (
            <FacturacionEmpty
              icon={SearchX}
              title="Sin resultados para estos filtros"
              description="Ninguna factura coincide con los filtros aplicados. Prueba a ampliar el rango de fechas o a quitar algún criterio con «Limpiar»."
            />
          ) : (
            <>
              <InvoicesTable invoices={invoices} totals={totals} currency={CURRENCY} />
              {truncated ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Se muestran las {Math.min(invoices.length, FACTURACION_LIST_LIMIT)}{" "}
                  facturas más recientes de las {totals.invoiceCount} del periodo
                  filtrado; los TOTALES corresponden a las {totals.invoiceCount}.
                  Descarga el libro completo con «Exportar libro».
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
