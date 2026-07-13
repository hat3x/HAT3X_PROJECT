// ============================================================================
// TPV · UI · Confirmación de cobro
// ----------------------------------------------------------------------------
// Pantalla de éxito tras registrar el pago. Muestra el nº de ticket, el importe
// cobrado y, si hubo efectivo de más, el CAMBIO a devolver bien grande (lo que
// el cajero necesita leer de un vistazo). Acciones: imprimir/enviar recibo y
// empezar un ticket nuevo.
// ============================================================================

import * as React from 'react';
import { euros, numeroTicket } from './formato';
import { Boton } from './primitivas';
import { IconoCheck, IconoRecibo } from './iconos';

export interface ConfirmacionProps {
  numero: number;
  cobrado: number;
  cambio?: number;
  /** Imprime/entrega el recibo. Opcional: si no se pasa, no se muestra. */
  onRecibo?: () => void;
  onNuevoTicket: () => void;
}

export function Confirmacion({
  numero,
  cobrado,
  cambio = 0,
  onRecibo,
  onNuevoTicket,
}: ConfirmacionProps) {
  return (
    <div className="tpv-overlay" role="dialog" aria-modal="true" aria-label="Cobro completado">
      <div className="tpv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tpv-panel__body">
          <div className="tpv-confirm">
            <div className="tpv-confirm__check" aria-hidden="true">
              <IconoCheck />
            </div>

            <h2>Cobrado {euros(cobrado)}</h2>
            <p className="tpv-vacio__texto">Ticket {numeroTicket(numero)} · pagado correctamente</p>

            {cambio > 0 ? (
              <div className="tpv-confirm__cambio" role="status">
                <small>Cambio a devolver</small>
                <b className="num">{euros(cambio)}</b>
              </div>
            ) : null}

            <div className="tpv-confirm__acciones">
              {onRecibo ? (
                <Boton variante="ghost" onClick={onRecibo}>
                  <IconoRecibo />
                  Recibo
                </Boton>
              ) : null}
              <Boton variante="primary" grande onClick={onNuevoTicket} autoFocus>
                Nuevo ticket
              </Boton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
