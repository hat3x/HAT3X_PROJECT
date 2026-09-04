import { redirect } from "next/navigation";

import { getActiveMembership } from "@/lib/salon";
import { canAccessSettingsSection, type SettingsSection } from "@/lib/settings/access";

/**
 * Guarda de una sección de Ajustes. Llámala al principio de cada `page.tsx`.
 *
 * ── POR QUÉ HACE FALTA EN CADA PÁGINA ───────────────────────────────────────
 * Antes el layout cerraba el área entera a owner/manager, así que las secciones
 * no comprobaban nada: bastaba con la puerta. Al abrirla a `staff` para que
 * Kristel llegue a su horario, esa suposición dejó de valer — sin esta guarda,
 * cualquiera escribiría `/ajustes/personal` en la barra de direcciones y
 * entraría a repartir roles.
 *
 * Ocultar el enlace en el menú NO es protección: es cosmética. La protección es
 * esto, en el servidor, antes de renderizar nada.
 *
 * Devuelve el rol ya resuelto para que la página no lo pida otra vez
 * (`getActiveMembership` está memorizada por petición, pero devolverlo evita
 * que cada página tenga que acordarse de eso).
 */
export async function requireSettingsSection(section: SettingsSection) {
  const membership = await getActiveMembership();
  if (!canAccessSettingsSection(section, membership?.role)) {
    redirect("/ajustes");
  }
  return membership;
}
