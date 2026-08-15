import type { SVGProps } from "react";

/**
 * Iconos dentales a medida para las secciones de Odontología del panel.
 *
 * Lucide no incluye piezas dentales, y las genéricas que se usaban (estetoscopio
 * para Odontograma, pulso para Periodontograma, llaves de código `{}` para
 * Ortodoncia…) no comunicaban bien. Estos SVG comparten el lenguaje de Lucide
 * (viewBox 24, trazo `currentColor`, extremos redondeados) para convivir con el
 * resto del icon-set. Firma `SVGProps` → aceptan `className`/`aria-hidden` igual
 * que un icono de Lucide, así encajan en `NavItem.icon` sin adaptadores.
 */

type IconProps = SVGProps<SVGSVGElement>;

const BASE: IconProps = {
  viewBox: "0 0 24 24",
  width: 24,
  height: 24,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** Odontograma — pieza dental (incisivo de dos cúspides). */
export function ToothIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...BASE} {...props}>
      <path d="M6.4 3.2C4.7 3.2 3.5 4.6 3.5 6.6c0 1.7.3 3.4.8 5 .3 1.1.5 2.6.9 3.7.3.9 1.4.9 1.7 0 .3-1 .4-2.2.7-3.2.2-.7.5-1.2 1.4-1.2s1.2.5 1.4 1.2c.3 1 .4 2.2.7 3.2.3.9 1.4.9 1.7 0 .4-1.1.6-2.6.9-3.7.5-1.6.8-3.3.8-5 0-2-1.2-3.4-2.9-3.4-1.3 0-2.2.7-3.1 1.3-.9-.6-1.8-1.3-3.1-1.3Z" />
    </svg>
  );
}

/** Periodontograma — diente sobre línea de encía con marcas de sondaje. */
export function PerioIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...BASE} {...props}>
      <path d="M8 3.4C6.7 3.4 5.8 4.5 5.8 6c0 1.3.3 2.6.7 3.8.4 1.2 1.4 1.1 1.7.1.2-.7.4-1.4 1.1-1.4s.9.7 1.1 1.4c.3 1 1.3 1.1 1.7-.1.4-1.2.7-2.5.7-3.8 0-1.5-.9-2.6-2.2-2.6-.9 0-1.5.5-2.1 1-.6-.5-1.2-1-2.1-1Z" />
      <path d="M3 15c2.5-1.4 5-1.4 6 0 1 1.4 2.5 1.4 3 0 1-1.4 4-1.4 6.5 0" />
      <path d="M4.5 19v1.8M9.5 19v2.2M14.5 19v1.8M19.5 19v2.4" />
    </svg>
  );
}

/** Ortodoncia — brackets sobre alambre (no las llaves de código). */
export function BracesIcon(props: IconProps): React.ReactElement {
  return (
    <svg {...BASE} {...props}>
      <path d="M2.5 12h19" />
      <rect x="4.2" y="9" width="4.1" height="6" rx="1.2" />
      <rect x="9.95" y="9" width="4.1" height="6" rx="1.2" />
      <rect x="15.7" y="9" width="4.1" height="6" rx="1.2" />
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
      <path d="M12 12.5c-.7-.6-1.7-.3-1.7.8 0 1 .6 1.6 1 2.4.2.4.5.4.7 0 .4-.8 1-1.4 1-2.4 0-1.1-1-1.4-1-.8Z" />
    </svg>
  );
}
