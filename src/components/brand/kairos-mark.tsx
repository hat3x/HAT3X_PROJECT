import type { SVGProps } from "react";

/**
 * Símbolo de marca de Kairos — «la abertura»: un anillo con una abertura precisa
 * y un punto en ella (el momento oportuno, καιρός). Solo dos elementos, así que
 * escala hasta tamaños de favicon sin emborronarse.
 *
 * Monocromo: usa `currentColor` para el anillo y el punto, de modo que hereda el
 * color del contenedor (p. ej. el chip `bg-primary text-primary-foreground` de la
 * marca). En la Fase 2 (paleta cálida) el punto pasará a latón sobre superficie
 * neutra; aquí se mantiene neutro para no chocar con el color de acento actual.
 *
 * Decorativo por defecto (`aria-hidden`). Para uso autónomo (sin texto al lado),
 * pásale `title` y se anuncia como imagen accesible.
 */
export function KairosMark({
  title,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M75.28 28.79 A33 33 0 1 1 55.73 17.5"
        stroke="currentColor"
        strokeWidth={7}
        strokeLinecap="round"
      />
      <circle cx="66.5" cy="21.4" r="10" fill="currentColor" />
    </svg>
  );
}
