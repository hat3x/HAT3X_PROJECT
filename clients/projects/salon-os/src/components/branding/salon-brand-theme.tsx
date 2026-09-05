/**
 * Estilo de marca del salón — inyector de variables CSS (sub-3 + sub-5).
 *
 * Componente de SERVIDOR: resuelve los overrides de tema de la marca activa y los
 * emite como un `<style>` inline (parte del HTML renderizado en servidor, por lo que
 * las variables ya están presentes en el PRIMER pintado — sin FOUC, igual espíritu que
 * `ThemeScript`). Las reglas están acotadas a `[data-salon-brand]`, así que solo
 * re-tintan el subárbol del panel; `:root` global queda intacto.
 *
 * Rebrand Kairos — SIN fallback por sector: si el salón no tiene `salon_branding`,
 * `resolveSectorFallbackTheme` devuelve `null` y este componente NO emite nada; el panel
 * hereda el default de marca de `globals.css` (primary = tinta, acento = latón). Solo el
 * branding EXPLÍCITO del tenant re-tiñe el subárbol del panel.
 * El CSS solo contiene tripletes numéricos generados por la lib (nunca texto libre),
 * de modo que `dangerouslySetInnerHTML` es seguro aquí.
 */
import type { SalonBranding, SalonSector } from "@/types/database";

import {
  buildBrandThemeCss,
  resolveBrandTheme,
  resolveSectorFallbackTheme,
} from "@/lib/salon-branding/theme";

interface SalonBrandStyleProps {
  /** Marca del salón activo, o `null` si aún no la ha personalizado. */
  branding: SalonBranding | null;
  /** Sector del salón — determina el color primario cuando no hay branding propio. */
  sector: SalonSector;
}

export function SalonBrandStyle({
  branding,
  sector,
}: SalonBrandStyleProps): React.ReactElement | null {
  const theme = resolveBrandTheme(branding) ?? resolveSectorFallbackTheme(sector);
  if (theme === null) return null;

  return (
    <style
      // Marca de la etiqueta para depuración (no participa en la cascada).
      data-salon-brand-style=""
      dangerouslySetInnerHTML={{ __html: buildBrandThemeCss(theme) }}
    />
  );
}
