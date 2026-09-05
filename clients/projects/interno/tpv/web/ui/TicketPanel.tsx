// ============================================================================
// TPV · UI · Rail del ticket (carrito + totales + acción de cobro)
// ----------------------------------------------------------------------------
// Panel derecho de la pantalla de cobro. Lista las líneas del carrito, muestra
// el desglose (subtotal, descuentos, IVA por tramo, total) previsualizado con
// money.ts y ofrece las acciones de vaciar / descuento global / cobrar.
//
// Estados: vacío (invita a tocar el catálogo) y "recalculando" (mientras una
// mutación viaja al servidor, atenúa las líneas y deshabilita el cobro).
// ============================================================================

import * as React from 'react';
import type { ResumenTicket } from '../../shared/money';
import type { EstadoCarrito } from './carritoReducer';
import { totalUnidades } from './carritoReducer';
import { euros, numeroTicket, porcentaje } from './formato';
import { Boton, Vacio } from './primitivas';
import { LineaTicket } from './LineaTicket';
import { IconoCarrito, IconoEtiqueta, IconoRayo } from './iconos';

export interface TicketPanelProps {
  estado: EstadoCarrito;
  resumen: ResumenTicket;
  /** Nº de ticket ya asignado por el servidor, si existe. */
  numero?: number | null;
  /** Una mutación (crear/actualizar líneas) está en curso. */
  recalculando?: boolean;
  onIncrementar: (key: string) => void;
  onDecrementar: (key: string) => void;
  onQuitar: (key: string) => void;
  onDescontarLinea: (key: string) => void;
  onDescuentoGlobal: () => void;
  onVaciar: () => void;
  onCobrar: () => void;
}

export function TicketPanel({
  estado,
  resumen,
  numero,
  recalculando,
  onIncrementar,
  onDecrementar,
  onQuitar,
  onDescontarLinea,
  onDescuentoGlobal,
  onVaciar,
  onCobrar,
}: TicketPanelProps) {
  const vacio = estado.lineas.length === 0;
  const unidades = totalUnidades(estado);

  return (
    <aside className="tpv-ticket" aria-label="Ticket en curso">
      <header className="tpv-ticket__head">
        <div className="tpv-ticket__titulo">
          <b>{numero ? `Ticket ${numeroTicket(numero)}` : 'Ticket nuevo'}</b>
          <span>{vacio ? 'Sin líneas' : `${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}`}</span>
        </div>
        {!vacio ? (
          <button
            type="button"
            className="tpv-chip tpv-chip--add"
            onClick={onDescuentoGlobal}
            aria-label="Aplicar descuento global al ticket"
          >
            <IconoEtiqueta />
            Descuento global
          </button>
        ) : (
          <span className="tpv-badge" aria-hidden="true">
            <IconoCarrito />
          </span>
        )}
      </header>

      <div
        className="tpv-ticket__lineas"
        style={recalculando ? { opacity: 0.55, transition: 'opacity 150ms' } : undefined}
        aria-busy={recalculando || undefined}
      >
        {vacio ? (
          <Vacio
            icono={<IconoCarrito size={30} />}
            titulo="Ticket vacío"
            texto="Toca un servicio o producto del catálogo para empezar a cobrar."
          />
        ) : (
          estado.lineas.map((linea) => (
            <LineaTicket
              key={linea.key}
              linea={linea}
              onIncrementar={() => onIncrementar(linea.key)}
              onDecrementar={() => onDecrementar(linea.key)}
              onQuitar={() => onQuitar(linea.key)}
              onDescontar={() => onDescontarLinea(linea.key)}
            />
          ))
        )}
      </div>

      <dl className="tpv-ticket__totales">
        <div className="tpv-total-row">
          <dt>Base imponible</dt>
          <dd className="num">{euros(resumen.subtotal)}</dd>
        </div>

        {resumen.descuento_total > 0 ? (
          <div className="tpv-total-row tpv-total-row--dto">
            <dt>Descuentos</dt>
            <dd className="num">−{euros(resumen.descuento_total)}</dd>
          </div>
        ) : null}

        {resumen.desglose_iva.map((tramo) => (
          <div className="tpv-total-row" key={tramo.tipo_impuesto}>
            <dt>IVA {porcentaje(tramo.tipo_impuesto)}</dt>
            <dd className="num">{euros(tramo.cuota)}</dd>
          </div>
        ))}

        <div className="tpv-total-row tpv-total-row--grande">
          <dt>Total</dt>
          <dd className="num">{euros(resumen.total)}</dd>
        </div>
      </dl>

      <div className="tpv-ticket__footer">
        <Boton variante="ghost" onClick={onVaciar} disabled={vacio} aria-label="Vaciar el ticket">
          Vaciar
        </Boton>
        <Boton
          variante="primary"
          grande
          onClick={onCobrar}
          disabled={vacio || recalculando}
        >
          <IconoRayo />
          Cobrar {euros(resumen.total)}
        </Boton>
      </div>
    </aside>
  );
}
