import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FichajeView } from "@/app/(dashboard)/fichaje/fichaje-view";
import { canManageSettings, getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type { TimeClockEntry } from "@/lib/queries/time-clock";

export const metadata: Metadata = {
  title: "Fichaje",
};

export default async function FichajePage(): Promise<React.ReactElement> {
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
        <h1 className="text-3xl font-bold tracking-tight">Fichaje</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  const membership = await getActiveMembership();
  const canManage = canManageSettings(membership?.role);

  // Fichaje abierto del usuario (para pintar el botón correcto al cargar).
  const { data: open } = await supabase
    .from("time_clock")
    .select("id, user_id, clock_in, clock_out")
    .eq("salon_id", salon.id)
    .eq("user_id", user.id)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  const initialOpen: TimeClockEntry | null = open
    ? {
        id: open.id,
        userId: open.user_id,
        name: "",
        clockIn: open.clock_in,
        clockOut: open.clock_out,
      }
    : null;

  return (
    <FichajeView
      salonId={salon.id}
      userId={user.id}
      canManage={canManage}
      timezone={salon.timezone}
      initialOpen={initialOpen}
    />
  );
}
