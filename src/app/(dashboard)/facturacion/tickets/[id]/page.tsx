import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Printer, ReceiptText } from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { TicketDetailView } from "@/app/(dashboard)/facturacion/tickets/[id]/ticket-detail-view";
import { EmitInvoiceDialog } from "@/components/facturacion/emit-invoice-dialog";
import { buttonVariants } from "@/components/ui/button";
import { fetchSaleDetail } from "@/lib/facturacion/queries";
import { formatSaleRef } from "@/lib/facturacion/sale-ticket";
import { formatDateTime } from "@/lib/format";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

interface TicketDetailPageProps {
  params: { id: string };
}

export async function generateMetadata({
  params,
}: TicketDetailPageProps): Promise<Metadata> {
  return { title: `Venta ${formatSaleRef(params.id)}` };
}

/**
 * Facturación → Tickets / Ventas → Detalle de una venta (`pos_sales`).
 *
 * Server Component: resuelve el salón activo y carga la venta con sus LÍNEAS y
 * COBROS (scopeada por `salon_id`). El acceso ya está guardado en el layout
 * (owner/manager). Muestra el detalle en el lenguaje del panel y ofrece REIMPRIMIR
 * el ticket térmico reutilizando el generador del TPV vía
 * `GET /api/facturacion/ticket/[id]`. Solo lectura (con nota de inmutabilidad).
 */
export default async function TicketDetailPage({
  params,
}: TicketDetailPageProps): Promise<React.ReactElement> {
  const salonId = await getActiveSalonId();
  if (salonId === null) {
    redirect(`/login?next=/facturacion/tickets/${params.id}`);
  }

  const supabase = createClient();
  const [detail, salonRow, saleRow] = await Promise.all([
    fetchSaleDetail(salonId, params.id),
    supabase
      .from("salons")
      .select("tax_id, legal_name, fiscal_address")
      .eq("id", salonId)
      .maybeSingle(),
    supabase
      .from("pos_sales")
      .select("migrated_from, customer:customers(full_name, tax_id, address)")
      .eq("id", params.id)
      .eq("salon_id", salonId)
      .maybeSingle(),
  ]);
  if (detail === null) {
    notFound();
  }

  const ref = formatSaleRef(detail.id);

  // Emisor (datos fiscales del salón) y receptor sugerido (cliente de la venta),
  // para el diálogo de emisión de factura.
  const issuer = {
    taxId: salonRow.data?.tax_id ?? null,
    legalName: salonRow.data?.legal_name ?? null,
    fiscalAddress: salonRow.data?.fiscal_address ?? null,
  };
  const saleCustomer = saleRow.data?.customer ?? null;
  const invoiceCustomer = saleCustomer
    ? {
        name: saleCustomer.full_name ?? null,
        taxId: saleCustomer.tax_id ?? null,
        address: saleCustomer.address ?? null,
      }
    : null;

  return (
    <div>
      <Link
        href="/facturacion/tickets"
        className="mb-4 inline-flex animate-fade-up items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-apple-out hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tickets / Ventas
      </Link>

      <SectionHeader
        icon={ReceiptText}
        title={`Venta ${ref}`}
        description={`Detalle de líneas y cobros de la venta cerrada el ${formatDateTime(detail.soldAt)}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <EmitInvoiceDialog
              saleId={detail.id}
              issuer={issuer}
              customer={invoiceCustomer}
              migratedFrom={saleRow.data?.migrated_from ?? null}
            />
            <a
              href={`/api/facturacion/ticket/${detail.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
              Reimprimir ticket
            </a>
            <a
              href={`/api/facturacion/ticket/${detail.id}?ancho=58`}
              target="_blank"
              rel="noopener noreferrer"
              title="Reimprimir en rollo de 58 mm"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground",
              )}
            >
              58 mm
            </a>
          </div>
        }
      />

      <TicketDetailView detail={detail} />
    </div>
  );
}
