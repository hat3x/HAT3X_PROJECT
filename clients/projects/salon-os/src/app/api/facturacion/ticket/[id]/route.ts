import { NextResponse, type NextRequest } from "next/server";

import { fetchSaleDetail } from "@/lib/facturacion/queries";
import { buildSaleTicketData, formatSaleRef } from "@/lib/facturacion/sale-ticket";
import { getActiveSalon } from "@/lib/salon";
import { buildTicketDocumentHtml, type TicketRollWidth } from "@/lib/tpv/ticket-document";

/**
 * Ticket de compra imprimible (HTML) de una venta cerrada — REIMPRESIÓN.
 *
 * `GET /api/facturacion/ticket/[id]` devuelve el MISMO documento térmico que emite
 * el TPV al cobrar, reconstruido desde el registro de la venta (`pos_sales` + sus
 * líneas y cobros) y aislado por `salon_id`. Reutiliza el generador puro del TPV
 * (`@/lib/tpv/ticket-document`): no se duplica ni se reescribe la maquetación del
 * ticket. El navegador lo imprime o lo guarda como PDF (botón «Imprimir ticket» o
 * Ctrl+P). El ancho de rollo es configurable por query (`?ancho=58|80`, por defecto 80).
 *
 * Es la contraparte del documento fiscal `GET /api/facturacion/documento/[id]`: el
 * ticket NO es una factura (así lo rotula el propio documento). No se cachea: el
 * contenido depende del salón/sesión y del registro.
 */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

/** Respuesta HTML mínima para errores (mismo Content-Type que el documento). */
function htmlError(message: string, status: number): NextResponse {
  const body = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title></head><body style="font-family:system-ui;padding:2rem;color:#0f172a"><p>${message}</p></body></html>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Ancho de rollo desde la query (`?ancho=58|80`); por defecto 80. */
function resolveRollWidth(request: NextRequest): TicketRollWidth {
  return request.nextUrl.searchParams.get("ancho") === "58" ? 58 : 80;
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return htmlError("No tienes un salón asignado o la sesión ha caducado.", 403);
  }

  let detail;
  try {
    detail = await fetchSaleDetail(salon.id, params.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return htmlError(`No se pudo cargar la venta: ${message}`, 500);
  }
  if (detail === null) {
    return htmlError("La venta no existe o no es accesible.", 404);
  }

  const data = buildSaleTicketData(detail, { salonName: salon.name });
  const html = buildTicketDocumentHtml(data, {
    rollWidthMm: resolveRollWidth(request),
    timezone: salon.timezone,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="ticket-${formatSaleRef(detail.id)}.html"`,
      "Cache-Control": "no-store",
    },
  });
}
