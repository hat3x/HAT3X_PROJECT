import { useState } from 'react';
import { useSalon } from '@/lib/salon-context';
import { resolveSalonLogoUrl } from '@/lib/salon-branding';

interface SalonWordmarkProps {
  /** Clases del logo (`<img>`) cuando el salón trae un logo válido. */
  imgClassName?: string;
  /** Clases del wordmark de texto (fallback cuando no hay logo o falla al cargar). */
  textClassName?: string;
}

/**
 * Marca del salón resuelto en RUNTIME (white-label). Pinta:
 *   · el LOGO del salón si el branding trae una URL válida
 *     (`resolveSalonLogoUrl(branding.logoUrl)`), o
 *   · el NOMBRE del salón como wordmark de texto si no hay logo — o si la imagen
 *     falla al cargar (404 / URL rota).
 *
 * NUNCA cablea la marca de ningún salón concreto (nombre, logo o texto fijo): todo
 * sale de `useSalon()` (branding que devuelve `get_salon_branding`). Así la misma
 * app sirve a cualquier salón por subdominio sin recompilar. Debe usarse dentro de
 * <SalonProvider> (garantizado por App.tsx, que lo monta por encima de las rutas).
 */
export const SalonWordmark = ({ imgClassName, textClassName }: SalonWordmarkProps) => {
  const salon = useSalon();
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = resolveSalonLogoUrl(salon.logoUrl);

  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt={salon.name}
        className={imgClassName}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return <span className={textClassName}>{salon.name}</span>;
};

export default SalonWordmark;
