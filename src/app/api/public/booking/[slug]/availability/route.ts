import { NextResponse, type NextRequest } from "next/server";

import { publicAvailabilityQuerySchema } from "@/lib/booking/schema";
import { BookingError, getAvailability, getDayAvailability } from "@/lib/booking/server";
import type { AvailabilityResponse, DayAvailabilityResponse } from "@/lib/booking/types";

/** La disponibilidad se calcula por request (nunca cachear). */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { slug: string };
}

/**
 * GET /api/public/booking/[slug]/availability?serviceId=&date=&professionalId=&view=
 *
 * Dos vistas, elegidas por el parámetro opt-in `view` (aditivo, no versiona la URL):
 *
 *   · `view` ausente o `free` → `{ slots }`: los huecos LIBRES. professionalId ausente o
 *     "any" = cualquiera. Es el CONTRATO que consumen la app de cliente y el panel; NO
 *     cambia.
 *   · `view=day` → `{ daySlots }`: la jornada COMPLETA de un profesional CONCRETO
 *     (`available` + `reason` por slot) para pintar su agenda. Un consumidor que solo
 *     quiera libres usa la vista por defecto o filtra `daySlots` por `available === true`.
 *
 * La validación de entrada es única ({@link publicAvailabilityQuerySchema}) y ya exige un
 * `professionalId` concreto cuando `view=day` (la rejilla es per-profesional).
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = publicAvailabilityQuerySchema.safeParse({
    serviceId: searchParams.get("serviceId") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    professionalId: searchParams.get("professionalId") ?? undefined,
    view: searchParams.get("view") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parámetros no válidos." },
      { status: 400 },
    );
  }

  try {
    // Vista de REJILLA (opt-in): jornada completa de un profesional concreto. El schema
    // garantiza `professionalId` presente cuando `view === "day"`; lo re-estrechamos aquí
    // para no depender de un non-null assertion y mantener TS strict.
    if (parsed.data.view === "day") {
      const { serviceId, date, professionalId } = parsed.data;
      if (professionalId === undefined) {
        return NextResponse.json(
          { error: "La rejilla diaria (view=day) requiere un profesional concreto." },
          { status: 400 },
        );
      }
      const daySlots = await getDayAvailability(params.slug, serviceId, date, professionalId);
      const body: DayAvailabilityResponse = { daySlots };
      return NextResponse.json(body);
    }

    // Vista por defecto: huecos LIBRES (contrato intacto para app de cliente y panel).
    const slots = await getAvailability(
      params.slug,
      parsed.data.serviceId,
      parsed.data.date,
      parsed.data.professionalId,
    );
    const body: AvailabilityResponse = { slots };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Error inesperado." }, { status: 500 });
  }
}
