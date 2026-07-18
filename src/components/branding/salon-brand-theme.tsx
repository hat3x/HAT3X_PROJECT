/**
 * Estilo de marca del salón — inyector de variables CSS (sub-3).
 *
 * Componente de SERVIDOR: resuelve los overrides de tema de la marca activa y los
 * emite como un `<style>` inline (parte del HTML renderizado en servidor, por lo que
 * las variables ya están presentes en el PRIMER pintado — sin FOUC, igual espíritu que
 * `ThemeScript`). Las reglas están acotadas a `[data-salon-brand]`, así que solo
 * re-tintan el subárbol del panel; `:root` global queda intacto.
 *
 * Fallback limpio: si el salón no tiene marca válida, `resolveBrandTheme` devuelve
 * `null` y este componente NO renderiza nada — manda el tema premium por defecto.
 * El CSS solo contiene tripletes numéricos generados por la lib (nunca texto libre),
 * de modo que `dangerouslySetInnerHTML` es seguro aquí.
 */
import {
  buildBrandThemeCss,
  resolveBrandTheme,
  type BrandTheme,
} from "@/lib/salon-branding/theme";
import type { SalonBranding } from "@/types/database";

interface SalonBrandStyleProps {
  /** Marca del salón activo, o `null` si aún no la ha personalizado. */
  branding: SalonBranding | null;
}

export function SalonBrandStyle({
  branding,
}: SalonBrandStyleProps): React.ReactElement | null {
  const theme: BrandTheme | null = resolveBrandTheme(branding);
  if (theme === null) return null;

  return (
    <style
      // Marca de la etiqueta para depuración (no participa en la cascada).
      data-salon-brand-style=""
      dangerouslySetInnerHTML={{ __html: buildBrandThemeCss(theme) }}
    />
  );
}
