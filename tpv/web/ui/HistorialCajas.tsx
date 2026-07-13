// ============================================================================
// TPV · UI · Histórico de sesiones de caja
// ----------------------------------------------------------------------------
// Lista de cierres del salón: cada sesión con su día, horario, total cobrado y
// un chip de descuadre coloreado (verde cuadra / ámbar sobra / rojo falta).
// Fila pulsable para abrir el detalle. Presentacional.
// ============================================================================

import * as React from 'react';
import type { ResumenSesion } from '../../shared/types';
import { severidadDescuadre } from '../../shared/caja';
import { euros, eurosConSigno, hora } from './formato';
import { IconoReloj } from './iconos';
import { Vacio } from './primitivas';

export interface HistorialCajasProps {
  sesiones: ResumenSesion[];
  /** Abre el detalle de una sesión (turno en curso o cierre pasado). */
  onAbrirSesion?: (sesionId: string) => void;
}

const fmtDia = new Intl.DateTimeFormat('es-ES', { day: '2-digit' });
const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'short' });

const TEXTO_SEV: Record<'cuadra' | 'sobra' | 'falta', string> = {
  cuadra: 'Cuadra',
  sobra: 'Sobra',
  falta: 'Falta',
};

export function HistorialCajas({ sesiones, onAbrirSesion }: HistorialCajasProps) {
  if (sesiones.length === 0) {
    return (
      <Vacio
        icono={<IconoReloj size="1.6em" />}
        titulo="Todavía no hay cierres"
        texto="Cuando cierres una caja, el turno quedará aquí con su arqueo."
      />
    );
  }

  return (
    <div className="caja-hist">
      {sesiones.map(({ sesion, total_cobrado, numero_tickets }) => {
        const abierta = new Date(sesion.abierta_at);
        const cerrada = sesion.estado === 'cerrada';
        const sev = severidadDescuadre(sesion.descuadre);

        return (
          <button
            type="button"
            key={sesion.id}
            className="caja-sesion"
            onClick={onAbrirSesion ? () => onAbrirSesion(sesion.id) : undefined}
            aria-label={`Sesión del ${fmtDia.format(abierta)} ${fmtMes.format(abierta)}`}
          >
            <span className="caja-sesion__dia" aria-hidden="true">
              <b>{fmtDia.format(abierta)}</b>
              <span>{fmtMes.format(abierta)}</span>
            </span>

            <span className="caja-sesion__info">
              <span className="caja-sesion__linea1">
                {hora(sesion.abierta_at)}
                {sesion.cerrada_at ? ` – ${hora(sesion.cerrada_at)}` : ' · en curso'}
              </span>
              <span className="caja-sesion__linea2">
                {euros(total_cobrado)} cobrados · {numero_tickets}{' '}
                {numero_tickets === 1 ? 'ticket' : 'tickets'}
              </span>
            </span>

            <span className="caja-sesion__cierre">
              {cerrada ? (
                <span className={`caja-chip-desc caja-chip-desc--${sev}`}>
                  {TEXTO_SEV[sev]}
                  {sev !== 'cuadra' ? ` ${eurosConSigno(sesion.descuadre)}` : ''}
                </span>
              ) : (
                <span className="caja-estado caja-estado--abierta">
                  <span className="caja-estado__punto" />
                  Abierta
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
