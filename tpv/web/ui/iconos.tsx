// ============================================================================
// TPV · UI · Iconografía (SVG inline, sin dependencias)
// ----------------------------------------------------------------------------
// Set mínimo de iconos de línea, trazo 1.75, esquinas redondeadas. Heredan el
// color (`currentColor`) y el tamaño (`1em` por defecto) del contexto, así que
// escalan con la tipografía y no requieren librería de iconos.
// ============================================================================

import * as React from 'react';

type Props = React.SVGProps<SVGSVGElement> & { size?: number | string };

function Base({ size = '1em', children, ...rest }: React.PropsWithChildren<Props>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconoBuscar = (p: Props) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Base>
);

export const IconoCerrar = (p: Props) => (
  <Base {...p}>
    <path d="M6 6 18 18M18 6 6 18" />
  </Base>
);

export const IconoMas = (p: Props) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconoMenos = (p: Props) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);

export const IconoPapelera = (p: Props) => (
  <Base {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Base>
);

export const IconoEtiqueta = (p: Props) => (
  <Base {...p}>
    <path d="M3 12V4h8l10 10-8 8L3 12Z" />
    <circle cx="7.5" cy="7.5" r="1.4" />
  </Base>
);

export const IconoEfectivo = (p: Props) => (
  <Base {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9v6M18 9v6" />
  </Base>
);

export const IconoTarjeta = (p: Props) => (
  <Base {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 9.5h19M6 15h4" />
  </Base>
);

export const IconoCarrito = (p: Props) => (
  <Base {...p}>
    <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 8H6" />
    <circle cx="9.5" cy="20" r="1.3" />
    <circle cx="17.5" cy="20" r="1.3" />
  </Base>
);

export const IconoCheck = (p: Props) => (
  <Base {...p}>
    <path d="m4 12.5 5 5 11-12" />
  </Base>
);

export const IconoRecibo = (p: Props) => (
  <Base {...p}>
    <path d="M5 3v18l2-1.4L9 21l2-1.4L13 21l2-1.4L17 21l2-1.4V3l-2 1.4L15 3l-2 1.4L11 3 9 4.4 7 3 5 4.4Z" />
    <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
  </Base>
);

export const IconoRayo = (p: Props) => (
  <Base {...p}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </Base>
);
