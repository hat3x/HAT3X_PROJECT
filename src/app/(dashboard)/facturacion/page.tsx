import { redirect } from "next/navigation";

/**
 * `/facturacion` no tiene contenido propio: redirige a la primera pestaña.
 * El guard de acceso vive en el layout de facturación.
 */
export default function FacturacionIndexPage(): never {
  redirect("/facturacion/facturas");
}
