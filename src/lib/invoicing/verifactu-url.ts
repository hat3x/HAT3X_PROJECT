/**
 * URL de cotejo de la AEAT que se codifica en el código QR de la factura.
 *
 * ── Qué es ───────────────────────────────────────────────────────────────────
 * La Orden HAC/1177/2024 obliga a que cada factura de un SIF lleve un código QR
 * que apunte al servicio de cotejo de la Sede electrónica de la AEAT, con los
 * datos identificativos del registro en la query string, en ESTE orden:
 *
 *   nif       NIF/CIF del emisor
 *   numserie  número de factura (serie-número)
 *   fecha     fecha de expedición, dd-mm-yyyy
 *   importe   importe total, euros con 2 decimales y punto decimal
 *
 * `fecha` e `importe` se formatean con los MISMOS formateadores que firman la
 * huella (`spec-format.ts`), de modo que lo impreso y lo firmado cuadran.
 *
 * ── Modo NO VERI*FACTU ───────────────────────────────────────────────────────
 * Este SIF opera en modo **NO VERI*FACTU**: conserva los registros de forma
 * inalterable pero NO los remite a la AEAT en tiempo real. El QR se genera igual
 * (mismo endpoint de cotejo), pero el documento debe rotularse "NO VERI*FACTU"
 * en lugar de "VERI*FACTU" para no inducir a error sobre el envío automático.
 * De ahí {@link VERIFACTU_MODE} y {@link VERIFACTU_LEGEND}.
 */
import { centsToSpecAmount, formatSpecDate } from "./spec-format";

/** Entorno del servicio de cotejo de la AEAT. */
export type VerifactuEnvironment = "production" | "test";

/**
 * Base del servicio de cotejo (ValidarQR) por entorno.
 *   · production → Sede electrónica real de la AEAT.
 *   · test       → preproducción de la AEAT (pruebas).
 */
const VALIDATION_BASE_URL: Record<VerifactuEnvironment, string> = {
  production: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
  test: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
};

/**
 * Modo de operación del SIF. Constante porque este sistema conserva pero NO
 * remite: el documento y el QR se marcan siempre como NO VERI*FACTU.
 */
export const VERIFACTU_MODE = "NO_VERIFACTU" as const;

/** Leyenda que debe acompañar al QR y figurar visible en el documento. */
export const VERIFACTU_LEGEND = "NO VERI*FACTU" as const;

/** Datos identificativos del registro que viajan en la URL de cotejo. */
export interface VerifactuQrParams {
  /** NIF/CIF del emisor. */
  issuerTaxId: string;
  /** Número visible de factura (serie-número). */
  invoiceNumber: string;
  /** Fecha de expedición. */
  issuedAt: Date;
  /** Importe total en céntimos enteros. */
  totalCents: number;
  /** Entorno del servicio de cotejo. Por defecto, producción. */
  environment?: VerifactuEnvironment;
}

/**
 * Construye la URL de cotejo de la AEAT para el QR.
 *
 * Los parámetros se añaden en el orden fijado por la especificación y se
 * codifican con `URLSearchParams` (percent-encoding estándar). El `nif` y el
 * `numserie` se codifican tal cual; `fecha` e `importe` con los formateadores
 * canónicos compartidos con la huella.
 */
export function buildVerifactuUrl(params: VerifactuQrParams): string {
  const base = VALIDATION_BASE_URL[params.environment ?? "production"];

  // Orden fijo: nif, numserie, fecha, importe (parte del contrato de cotejo).
  const query = new URLSearchParams();
  query.set("nif", params.issuerTaxId);
  query.set("numserie", params.invoiceNumber);
  query.set("fecha", formatSpecDate(params.issuedAt));
  query.set("importe", centsToSpecAmount(params.totalCents));

  return `${base}?${query.toString()}`;
}
