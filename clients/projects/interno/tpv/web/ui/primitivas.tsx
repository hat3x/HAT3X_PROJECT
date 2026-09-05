// ============================================================================
// TPV · UI · Primitivas reutilizables
// ----------------------------------------------------------------------------
// Piezas atómicas compartidas por las pantallas del TPV: botón táctil, stepper
// de cantidad, skeletons de carga y estado vacío. Todas asumen los estilos de
// tpv.css y objetivos de toque grandes (tablet). Sin estado propio salvo lo
// imprescindible; la lógica vive en los componentes de feature.
// ============================================================================

import * as React from 'react';
import { IconoMas, IconoMenos } from './iconos';

// ----------------------------------------------------------------------------
// Botón
// ----------------------------------------------------------------------------
type VarianteBoton = 'primary' | 'ghost' | 'danger' | 'neutral';

export interface BotonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  /** Ocupa todo el ancho disponible. */
  bloque?: boolean;
  /** Tamaño grande para la acción principal (cobrar). */
  grande?: boolean;
  /** Muestra spinner y bloquea el botón (mutación en curso). */
  cargando?: boolean;
}

const CLASE_VARIANTE: Record<VarianteBoton, string> = {
  primary: 'tpv-btn--primary',
  ghost: 'tpv-btn--ghost',
  danger: 'tpv-btn--danger',
  neutral: '',
};

export function Boton({
  variante = 'neutral',
  bloque,
  grande,
  cargando,
  disabled,
  className,
  children,
  ...rest
}: BotonProps) {
  const clases = [
    'tpv-btn',
    CLASE_VARIANTE[variante],
    bloque ? 'tpv-btn--block' : '',
    grande ? 'tpv-btn--lg' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={clases}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...rest}
    >
      {cargando ? <Spinner /> : children}
    </button>
  );
}

/** Spinner circular en línea, hereda color y tamaño de texto. */
export function Spinner({ etiqueta = 'Procesando' }: { etiqueta?: string }) {
  return (
    <svg
      width="1.25em"
      height="1.25em"
      viewBox="0 0 24 24"
      role="status"
      aria-label={etiqueta}
      style={{ animation: 'tpv-spin 720ms linear infinite' }}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <style>{'@keyframes tpv-spin{to{transform:rotate(360deg)}}'}</style>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Stepper de cantidad
// ----------------------------------------------------------------------------
export interface StepperProps {
  valor: number;
  onIncrementar: () => void;
  onDecrementar: () => void;
  /** Etiqueta accesible del concepto que se ajusta (p.ej. "Corte de caballero"). */
  etiqueta: string;
  min?: number;
}

export function Stepper({
  valor,
  onIncrementar,
  onDecrementar,
  etiqueta,
  min = 1,
}: StepperProps) {
  return (
    <div className="tpv-stepper" role="group" aria-label={`Cantidad de ${etiqueta}`}>
      <button
        type="button"
        className="tpv-stepper__btn"
        onClick={onDecrementar}
        aria-label={`Quitar una unidad de ${etiqueta}`}
      >
        <IconoMenos />
      </button>
      <span className="tpv-stepper__val" aria-live="polite" aria-atomic="true">
        {valor}
      </span>
      <button
        type="button"
        className="tpv-stepper__btn"
        onClick={onIncrementar}
        disabled={valor >= 999}
        aria-label={`Añadir una unidad de ${etiqueta}`}
      >
        <IconoMas />
      </button>
      <span hidden>{min}</span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Skeletons de carga
// ----------------------------------------------------------------------------
/** Bloque skeleton genérico; se estiliza con las variantes de tpv.css. */
export function Skeleton({
  variante,
  className,
  style,
}: {
  variante?: 'tile' | 'linea' | 'texto' | 'total';
  className?: string;
  style?: React.CSSProperties;
}) {
  const v = variante ? `tpv-skel--${variante}` : '';
  return <div className={`tpv-skel ${v} ${className ?? ''}`.trim()} style={style} aria-hidden="true" />;
}

/** Rejilla de tiles fantasma mientras carga el catálogo. */
export function SkeletonCatalogo({ tiles = 9 }: { tiles?: number }) {
  return (
    <div className="tpv-grid" aria-hidden="true">
      {Array.from({ length: tiles }, (_, i) => (
        <Skeleton key={i} variante="tile" />
      ))}
    </div>
  );
}

/** Líneas fantasma mientras carga/recalcula el ticket. */
export function SkeletonTicket({ lineas = 4 }: { lineas?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lineas }, (_, i) => (
        <Skeleton key={i} variante="linea" />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Estado vacío
// ----------------------------------------------------------------------------
export interface VacioProps {
  icono?: React.ReactNode;
  titulo: string;
  texto?: string;
  /** Acción opcional (botón ya montado por el consumidor). */
  accion?: React.ReactNode;
}

export function Vacio({ icono, titulo, texto, accion }: VacioProps) {
  return (
    <div className="tpv-vacio" role="status">
      {icono ? <div className="tpv-vacio__icono">{icono}</div> : null}
      <p className="tpv-vacio__titulo">{titulo}</p>
      {texto ? <p className="tpv-vacio__texto">{texto}</p> : null}
      {accion}
    </div>
  );
}
