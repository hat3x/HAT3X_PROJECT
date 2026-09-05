// ============================================================================
// TPV · UI · Lista de movimientos manuales de efectivo
// ----------------------------------------------------------------------------
// Historial de entradas/salidas de la sesión: cada fila con su marca de color
// (verde entrada, rojo salida), motivo, hora e importe con signo. Presentacional.
// ============================================================================

import * as React from 'react';
import type { MovimientoCaja } from '../../shared/types';
import { euros, hora } from './formato';
import { IconoEntrada, IconoSalida } from './iconos';
import { Vacio } from './primitivas';

export interface MovimientosListaProps {
  movimientos: MovimientoCaja[];
}

export function MovimientosLista({ movimientos }: MovimientosListaProps) {
  if (movimientos.length === 0) {
    return (
      <Vacio
        titulo="Sin movimientos manuales"
        texto="Aquí se listan las entradas y salidas de efectivo que registres durante el turno."
      />
    );
  }

  return (
    <ul className="caja-mov-lista" aria-label="Movimientos de efectivo">
      {movimientos.map((m) => {
        const esEntrada = m.tipo === 'entrada';
        const signo = esEntrada ? '+' : '−';
        return (
          <li className="caja-mov" key={m.id}>
            <span
              className={`caja-mov__marca caja-mov__marca--${m.tipo}`}
              aria-hidden="true"
            >
              {esEntrada ? <IconoEntrada size="1.1em" /> : <IconoSalida size="1.1em" />}
            </span>
            <span className="caja-mov__motivo">
              {m.motivo}
              <span className="caja-mov__meta"> · {hora(m.created_at)}</span>
            </span>
            <span
              className={`caja-mov__importe caja-mov__importe--${m.tipo}`}
              aria-label={`${esEntrada ? 'Entrada' : 'Salida'} de ${euros(m.importe)}`}
            >
              {signo}
              {euros(m.importe)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
