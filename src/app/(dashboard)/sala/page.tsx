import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SalaView } from "@/app/(dashboard)/sala/sala-view";
import { canManageSettings, getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sala",
};

/**
 * `page.tsx` de `/sala` (Task 7): resuelve `salonId` y `role` en servidor —
 * mismo patrón que `mostrador/page.tsx` (comprobar sesión, resolver salón
 * activo, delegar el resto a la vista cliente). El permiso de gestión del
 * layout (`canEdit`) se calcula AQUÍ en servidor (`canManageSettings`) y se
 * pasa a `SalaView`: `canManageSettings` vive en `@/lib/salon`, que importa
 * `next/headers` y no puede entrar en el bundle de cliente. El servidor lo
 * vuelve a comprobar en `saveTablePosition`/`createZone`/`createTable`
 * (`sala/actions.ts`, Task 5): la UI oculta, el servidor rechaza.
 */
export default async function SalaPage(): Promise<React.ReactElement> {
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
        <h1 className="text-3xl font-bold tracking-tight">Sala</h1>
        <p className="mt-2 text-muted-foreground">
          Tu usuario no está asociado a ningún salón todavía.
        </p>
      </main>
    );
  }

  const membership = await getActiveMembership();
  const canEdit = canManageSettings(membership?.role ?? null);

  return <SalaView salonId={salon.id} canEdit={canEdit} />;
}
