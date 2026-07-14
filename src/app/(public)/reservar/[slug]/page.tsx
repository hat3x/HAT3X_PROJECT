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
      <main className="relative min-h-dvh overflow-hidden">
        {/* Fondo decorativo: halo violeta cálido en la parte superior. Sutil,
            contenido y sin capturar eventos; refuerza la marca sin distraer. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] bg-[radial-gradient(70%_100%_at_50%_0%,hsl(var(--primary)/0.10),transparent_72%)]"
        />
        <div className="relative mx-auto w-full max-w-xl px-4 py-10 md:py-16">
          <BookingWizard slug={params.slug} bootstrap={bootstrap} />
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof BookingError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
