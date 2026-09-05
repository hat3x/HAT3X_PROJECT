// ============================================================================
// TPV · UI · Banda de arqueo
// ----------------------------------------------------------------------------
// Muestra, de forma protagonista, el efectivo TEÓRICO de la caja con su
// desglose (fondo + cobros en efectivo ± movimientos) y, si la sesión ya está
// cerrada (o se está previsualizando el cierre), el DESCUADRE con su color.
// Presentacional puro: recibe un ArqueoCaja ya calculado (por el servidor o por
// previsualizarArqueo) y sólo lo pinta.
// ============================================================================

import * as React from 'react';
import type { ArqueoCaja } from '../../shared/types';
import { severidadDescuadre } from '../../shared/caja';
import { euros, eurosConSigno } from './formato';
import { IconoBalanza } from './iconos';

export interface ArqueoBandaProps {
  arqueo: ArqueoCaja;
  /** Etiqueta de la cifra principal (por defecto "Efectivo esperado en caja"). */
  etiquetaTeorico?: string;
}

const TEXTO_DESCUADRE: Record<'cuadra' | 'sobra' | 'falta', string> = {
  cuadra: 'La caja cuadra',
  sobra: 'Sobra efectivo',
  falta: 'Falta efectivo',
};

export function ArqueoBanda({ arqueo, etiquetaTeorico }: ArqueoBandaProps) {
  const sev = severidadDescuadre(arqueo.descuadre);
  const hayConteo = arqueo.efectivo_real != null;

  return (
    <section className="caja-arqueo" aria-label="Arqueo de caja">
      <div className="caja-arqueo__teorico">
        <span className="caja-arqueo__etq">
          {etiquetaTeorico ?? 'Efectivo esperado en caja'}
        </span>
        <span className="caja-arqueo__cifra">{euros(arqueo.efectivo_teorico)}</span>
      </div>

      <dl className="caja-desglose">
        <Fila etiqueta="Fondo de apertura" valor={arqueo.saldo_inicial} />
        <Fila etiqueta="Cobros en efectivo" valor={arqueo.cobros_efectivo} conSigno />
        {arqueo.entradas > 0 ? (
          <Fila etiqueta="Entradas manuales" valor={arqueo.entradas} conSigno />
        ) : null}
        {arqueo.salidas > 0 ? (
          <Fila etiqueta="Salidas manuales" valor={-arqueo.salidas} conSigno resta />
        ) : null}
      </dl>

      {hayConteo ? (
        <>
          <dl className="caja-desglose" style={{ marginTop: 0 }}>
            <Fila etiqueta="Efectivo contado" valor={arqueo.efectivo_real ?? 0} />
          </dl>
          <div className={`caja-descuadre caja-descuadre--${sev}`} role="status">
            <span>
              <IconoBalanza size="1.1em" style={{ verticalAlign: '-0.15em' }} />{' '}
              {TEXTO_DESCUADRE[sev]}
            </span>
            <span className="caja-descuadre__cifra">
              {sev === 'cuadra' ? euros(0) : eurosConSigno(arqueo.descuadre)}
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Fila({
  etiqueta,
  valor,
  conSigno,
  resta,
}: {
  etiqueta: string;
  valor: number;
  conSigno?: boolean;
  resta?: boolean;
}) {
  return (
    <div className="caja-desglose__fila">
      <dt>{etiqueta}</dt>
      <dd className={`caja-desglose__val ${resta ? 'caja-desglose__val--resta' : ''}`}>
        {conSigno ? eurosConSigno(valor) : euros(valor)}
      </dd>
    </div>
  );
}
