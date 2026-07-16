/**
 * POST /api/loyalty/verify-visit — Proxy servidor del registro de visita.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * Igual que `/api/loyalty/lookup`: mantiene la `LOYALTY_API_KEY` (`dn9_…`) en el
 * servidor. Este endpoint MUTA estado de fidelización (acumula puntos y, si se
 * indica, canjea un cupón), así que la autenticación no es opcional.
 *
 * ── Contrato ─────────────────────────────────────────────────────────────────
 *   Body:     { qr_token, service_prices: number[] (céntimos), location_id?, redeem_coupon? }
 *   200:      { points_earned, points_balance, redeemed_coupon, discount_cents }
 *   503:      { enabled: false }                (integración apagada / mal config.)
 *   400:      { error, issues? }                (cuerpo no válido)
 *   401:      { error }                          (sin sesión, o upstream rechazó la key)
 *   403/404:  { error }                          (propagados de forma controlada)
 *   4xx/5xx:  { error }                          (mensaje genérico; sin filtrar internos)
 *
 * CSRF: la sesión viaja en cookies SameSite=Lax de Supabase, que no se envían en
 * POST cross-site; por eso no se añade un token CSRF a medida (coherente con el
 * resto de mutaciones del proyecto). La API key nunca sale del servidor.
 */
import { NextResponse, type NextRequest } from "next/server";

import { isLoyaltyEnabled, verifyVisit } from "@/lib/loyalty";
import { getActiveMembership } from "@/lib/salon";
import { verifyVisitBodySchema } from "@/lib/validations/loyalty";

import { loyaltyErrorResponse } from "../_lib/error-response";

/** Proxy con secreto + mutación de estado: nunca cachear, siempre dinámico. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Kill-switch primero (ver nota en /api/loyalty/lookup).
  if (!isLoyaltyEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 503 });
  }

  // 2. AuthN/Z: cierra la visita quien atiende la caja; cualquier rol del salón
  //    autenticado vale. Sin sesión → 401 (nunca llegamos a tocar el upstream).
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

  const parsed = verifyVisitBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos no válidos.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 4. Proxy: la API key se queda dentro del cliente, en servidor. `location_id`
  //    omitido → el cliente usa `LOYALTY_LOCATION_ID`; el upstream autoriza la
  //    sede (devuelve 403 si la key no puede operar en ella).
  try {
    const result = await verifyVisit({
      qr_token: parsed.data.qr_token,
      location_id: parsed.data.location_id,
      service_prices: parsed.data.service_prices,
      redeem_coupon: parsed.data.redeem_coupon ?? null,
    });
    return NextResponse.json(result, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return loyaltyErrorResponse(error, "api/loyalty/verify-visit");
  }
}
