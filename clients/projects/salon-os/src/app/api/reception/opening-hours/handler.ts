/**
 * Lógica de `GET /api/reception/opening-hours`, en un módulo HERMANO del `route.ts`
 * (un `route.ts` de Next App Router solo puede exportar métodos HTTP y config de ruta;
 * el handler se aísla aquí para ser importable por los tests).
 *
 * Devuelve el HORARIO DE APERTURA del salón (tabla `salon_opening_hours`), acotado por
 * el `salonId` que el guard resuelve de la `x-api-key`. Lo usa la recepcionista de voz
 * (vía n8n) para anunciar el horario REAL sin hardcodearlo en su prompt: cuando el
 * propietario cambia el horario en el panel, la recepcionista lo refleja sola.
 */
import type { NextResponse } from "next/server";

import { getOpeningHoursForSalon } from "@/lib/booking/server";
import { ReceptionError, receptionJson } from "@/lib/reception";

export async function handleReceptionOpeningHours(
  salonId: string,
): Promise<NextResponse> {
  let hours: Array<{ weekday: number; start_time: string; end_time: string }>;
  try {
    hours = await getOpeningHoursForSalon(salonId);
  } catch (error) {
    throw ReceptionError.internal(error);
  }

  return receptionJson({ hours });
}
