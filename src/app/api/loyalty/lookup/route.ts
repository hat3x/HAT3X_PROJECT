/**
 * POST /api/loyalty/lookup — Proxy servidor de la consulta de fidelización.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * El cliente `@/lib/loyalty` usa `LOYALTY_API_KEY` (una clave de servicio
 * `dn9_…`). Esa clave JAMÁS puede llegar al navegador. Por eso el TPV nunca llama
 * a denueveanueve directamente: llama a este handler, que corre solo en servidor,
 * añade la cabecera `x-api-key` puertas adentro y devuelve al navegador únicamente
 * los datos de fidelización del cliente escaneado.
 *
 * ── Contrato ─────────────────────────────────────────────────────────────────
 *   Body:     { qr_token: string }
 *   200:      { member, coupons }               (estado de fidelización)
 *   503:      { enabled: false }                (integración apagada / mal config.)
 *   400:      { error, issues? }                (cuerpo no válido)
 *   401:      { error }                          (sin sesión, o upstream rechazó la key)
 *   403/404:  { error }                          (propagados de forma controlada)
 *   4xx/5xx:  { error }                          (mensaje genérico; sin filtrar internos)
 *
 * Nunca se devuelven ni la API key, ni la URL del upstream, ni su cuerpo de error.
 */
import { NextResponse, type NextRequest } from "next/server";

import { isLoyaltyEnabled, loyaltyLookup } from "@/lib/loyalty";
import { getActiveMembership } from "@/lib/salon";
import { loyaltyLookupBodySchema } from "@/lib/validations/loyalty";

import { loyaltyErrorResponse } from "../_lib/error-response";

/** Proxy con secreto + datos de cliente: nunca cachear, siempre dinámico. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Kill-switch primero: si la integración está apagada no hay nada que
  //    proteger ni a quién llamar. Es el check más barato (sin ir a la BD) y su
  //    resultado (feature on/off) no es información sensible.
  if (!isLoyaltyEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 503 });
  }

  // 2. AuthN/Z: este proxy consume una API de pago y lee datos de clientes.
  //    Solo miembros autenticados de un salón pueden usarlo (evita agotar cuota,
  //    enumerar QRs y fugas de PII). Cualquier rol del salón vale: es una
  //    operación de TPV que también realiza el personal de caja (`staff`).
  const membership = await getActiveMembership();
  if (membership === null) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 3. Validación del cuerpo como entrada no confiable.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const parsed = loyaltyLookupBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos no válidos.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 4. Proxy: la API key se queda dentro del cliente, en servidor.
  try {
    const result = await loyaltyLookup(parsed.data.qr_token);
    return NextResponse.json(result, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return loyaltyErrorResponse(error, "api/loyalty/lookup");
  }
}
