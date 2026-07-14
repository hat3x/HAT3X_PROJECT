import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TpvView } from "@/app/(dashboard)/tpv/tpv-view";
import { getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Caja",
};

export default async function TpvPage(): Promise<React.ReactElement> {
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
        <h1 className="text-3xl font-bold tracking-tight">Caja</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  return <TpvView salonId={salon.id} timezone={salon.timezone} />;
}
