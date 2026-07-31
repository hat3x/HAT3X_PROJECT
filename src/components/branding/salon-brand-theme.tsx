/**
 * Estilo de marca del salón — inyector de variables CSS (sub-3 + sub-5).
 *
 * Componente de SERVIDOR: resuelve los overrides de tema de la marca activa y los
 * emite como un `<style>` inline (parte del HTML renderizado en servidor, por lo que
 * las variables ya están presentes en el PRIMER pintado — sin FOUC, igual espíritu que
 * `ThemeScript`). Las reglas están acotadas a `[data-salon-brand]`, así que solo
 * re-tintan el subárbol del panel; `:root` global queda intacto.
 *
 * Sub-5 — Sector fallback: si el salón no tiene `salon_branding`, se aplica el color
 * primario por defecto del sector (`SECTOR_REGISTRY[sector].defaultPrimary`) en lugar
 * de no emitir nada. Para `peluqueria` el resultado es byte-idéntico al default de
 * `globals.css`; para `odontologia` se activa la paleta teal de clínica.
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
