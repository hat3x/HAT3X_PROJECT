import { NextResponse, type NextRequest } from "next/server";

import { availabilityQuerySchema } from "@/lib/booking/schema";
import { BookingError, getAvailability } from "@/lib/booking/server";
import type { AvailabilityResponse } from "@/lib/booking/types";

/** La disponibilidad se calcula por request (nunca cachear). */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { slug: string };
}

/**
 * GET /api/public/booking/[slug]/availability?serviceId=&date=&professionalId=
 * Devuelve los huecos reservables. professionalId ausente o "any" = cualquiera.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = availabilityQuerySchema.safeParse({
    serviceId: searchParams.get("serviceId") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    professionalId: searchParams.get("professionalId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parámetros no válidos." },
      { status: 400 },
    );
  }

  try {
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
