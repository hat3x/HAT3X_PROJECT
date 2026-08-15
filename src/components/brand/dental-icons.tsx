import type { SVGProps } from "react";

/**
 * Iconos dentales a medida para las secciones de Odontología del panel.
 *
 * Lucide no incluye piezas dentales, y las genéricas que se usaban (estetoscopio,
 * pulso, llaves de código `{}`) no comunicaban bien. Estos SVG comparten el
 * lenguaje de Lucide: viewBox 24, trazo `currentColor`, `stroke-width` 2,
 * extremos redondeados y — importante — el dibujo RELLENA el cuadro (≈ 2.5–21.5)
 * para que se vean del MISMO tamaño que el resto del icon-set. Firma `SVGProps`
 * → aceptan `className`/`aria-hidden` igual que un icono de Lucide.
 */

type IconProps = SVGProps<SVGSVGElement>;

const BASE: IconProps = {
  viewBox: "0 0 24 24",
  width: 24,
  height: 24,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** Odontograma — pieza dental (dos cúspides), rellenando el cuadro. */
export function ToothIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...BASE} {...props}>
      <path d="M12 3.4c-1.4-1.1-3.4-1.7-5.1-.9C5 3.4 4 5.7 4.2 8.1c.2 2.4.7 4.7 1.3 7 .4 1.6.7 3.3 1.2 4.8.3.9.7 1.7 1.5 1.7 1 0 1.2-1.7 1.5-3.3.3-1.7.5-3.4 1.3-3.4h.2c.8 0 1 1.7 1.3 3.4.3 1.6.5 3.3 1.5 3.3.8 0 1.2-.8 1.5-1.7.5-1.5.8-3.2 1.2-4.8.6-2.3 1.1-4.6 1.3-7 .2-2.4-.8-4.7-2.7-5.6-1.7-.8-3.7-.2-5.1.9Z" />
    </svg>
  );
}

/** Periodontograma — diente sobre línea de encía con marcas de sondaje. */
export function PerioIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...BASE} {...props}>
      <path d="M12 3c-1-.9-2.5-1.3-3.8-.7C6.8 2.9 6 4.6 6.2 6.4c.2 1.6.6 3.2 1 4.7.3 1 .6 2.1 1.2 2.1.7 0 .9-1.1 1.1-2.1.2-.6.3-1 .8-1s.6.4.8 1c.3 1 .5 2.1 1.2 2.1.6 0 .9-1.1 1.2-2.1.4-1.5.8-3.1 1-4.7.2-1.8-.6-3.5-2-4.1-1.3-.6-2.8-.2-3.8.7Z" />
      <path d="M3 16c2.3-1.3 4.5-1.3 6.2 0 1.7 1.3 3.4 1.3 6.2 0 1.2-.6 2.4-.7 2.6-.5" />
      <path d="M5 19v2.4M10 19v2.8M15 19v2.4M19 19v3" />
    </svg>
  );
}

/** Ortodoncia — brackets sobre alambre (no las llaves de código). */
export function BracesIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...BASE} {...props}>
      <path d="M2 12h20" />
      <rect x="4" y="6.5" width="4.4" height="11" rx="1.4" />
      <rect x="9.8" y="6.5" width="4.4" height="11" rx="1.4" />
      <rect x="15.6" y="6.5" width="4.4" height="11" rx="1.4" />
    </svg>
  );
}

/** Planes de tratamiento — portapapeles con visto + líneas de presupuesto. */
export function TreatmentPlanIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...BASE} {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 12.5l1.5 1.5 2.5-3" />
      <path d="M14.5 11.5h2.5M14.5 15h2.5" />
    </svg>
  );
}

/** Expediente clínico — ficha/archivo con pieza dental. */
export function DentalRecordIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...BASE} {...props}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M12 12.4c-.8-.7-2-.4-2 .9 0 1.1.7 1.8 1.1 2.6.3.5.5.5.8 0 .4-.8 1.1-1.5 1.1-2.6 0-1.3-1.2-1.6-2-.9Z" />
    </svg>
  );
}
