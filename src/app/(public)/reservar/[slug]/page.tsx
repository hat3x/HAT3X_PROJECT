import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookingError, getBootstrap } from "@/lib/booking/server";

import { BookingWizard } from "./booking-wizard";

/** La reserva pública se sirve dinámica (catálogo y disponibilidad cambian). */
export const dynamic = "force-dynamic";

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const { salon } = await getBootstrap(params.slug);
    return {
      title: `Reservar cita · ${salon.name}`,
      description: `Reserva tu cita en ${salon.name} en línea, elige servicio, profesional y hora.`,
    };
  } catch {
    return { title: "Reservar cita" };
  }
}

export default async function BookingPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  try {
    const bootstrap = await getBootstrap(params.slug);
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
        <BookingWizard slug={params.slug} bootstrap={bootstrap} />
      </main>
    );
  } catch (error) {
    if (error instanceof BookingError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
