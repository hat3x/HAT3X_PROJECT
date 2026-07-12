import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppointmentsView } from "@/app/(dashboard)/appointments/appointments-view";
import { getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Citas",
};

export default async function AppointmentsPage(): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect("/login");
  }

  const salon = await getActiveSalon();

  if (salon === null) {
    return (
      <main className="container py-10">
        <h1 className="text-3xl font-bold tracking-tight">Citas</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  return (
    <AppointmentsView
      salonId={salon.id}
      salonSlug={salon.slug}
      timezone={salon.timezone}
    />
  );
}
