import { NextResponse, type NextRequest } from "next/server";

import { createBookingSchema } from "@/lib/booking/schema";
import { BookingError, createBooking, getBootstrap } from "@/lib/booking/server";

/** Datos de reserva pública: no cachear (catálogo y salón cambian). */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { slug: string };
}

/** GET /api/public/booking/[slug] — salón + catálogo para arrancar el asistente. */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const bootstrap = await getBootstrap(params.slug);
    return NextResponse.json(bootstrap);
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Error inesperado." }, { status: 500 });
  }
}

/** POST /api/public/booking/[slug] — crea la reserva (cita en estado pending). */
export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos no válidos." },
      { status: 400 },
    );
  }

  try {
    const confirmation = await createBooking(params.slug, parsed.data);
    return NextResponse.json(confirmation, { status: 201 });
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Error inesperado." }, { status: 500 });
  }
}
