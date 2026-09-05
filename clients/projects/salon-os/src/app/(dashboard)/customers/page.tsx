import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CustomersView } from "@/app/(dashboard)/customers/customers-view";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Clientes",
};

export default async function CustomersPage(): Promise<React.ReactElement> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect("/login");
  }

  const salonId = await getActiveSalonId();

  if (salonId === null) {
    return (
      <main className="container py-10">
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  return <CustomersView salonId={salonId} />;
}
