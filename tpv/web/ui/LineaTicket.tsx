// ============================================================================
// TPV · UI · Línea del ticket (carrito)
// ----------------------------------------------------------------------------
// Una fila del rail del ticket: descripción, stepper de cantidad, chip de
// descuento y total de línea. El importe se PREVISUALIZA con calcularLinea de
// shared/money.ts (mismo núcleo que el servidor); el total definitivo lo fija
// la Edge Function al persistir.
// ============================================================================

import * as React from 'react';
import { calcularLinea } from '../../shared/money';
import type { LineaCarrito } from './carritoReducer';
import { euros, porcentaje } from './formato';
import { Stepper } from './primitivas';
import { IconoEtiqueta, IconoPapelera } from './iconos';

export interface LineaTicketProps {
  linea: LineaCarrito;
  onIncrementar: () => void;
  onDecrementar: () => void;
  onQuitar: () => void;
  /** Abre el editor de descuento para esta línea. */
  onDescontar: () => void;
}

export const LineaTicket = React.memo(function LineaTicket({
  linea,
  onIncrementar,
  onDecrementar,
  onQuitar,
  onDescontar,
}: LineaTicketProps) {
  const calc = calcularLinea({
    cantidad: linea.cantidad,
    precio_unitario: linea.precio_unitario,
    descuento: linea.descuento?.modo === 'importe' ? linea.descuento.valor : undefined,
    descuento_pct:
      linea.descuento?.modo === 'porcentaje' ? linea.descuento.valor : undefined,
    tipo_impuesto: linea.tipo_impuesto,
  });

  const conDescuento = calc.descuento > 0;
  const etiquetaDto =
    linea.descuento?.modo === 'porcentaje'
      ? `−${porcentaje(linea.descuento.valor)}`
      : `−${euros(calc.descuento)}`;

  return (
    <div className="tpv-linea">
      <div className="tpv-linea__desc">{linea.descripcion}</div>

      <div className="tpv-linea__precio num">
        {conDescuento ? <del>{euros(calc.base_bruta)}</del> : null}
        {euros(calc.total_linea)}
      </div>

      <div className="tpv-linea__sub">
        {euros(linea.precio_unitario)} · IVA {porcentaje(linea.tipo_impuesto)}
      </div>

      <div className="tpv-linea__acciones">
        <Stepper
          valor={linea.cantidad}
          etiqueta={linea.descripcion}
          onIncrementar={onIncrementar}
          onDecrementar={onDecrementar}
        />

        <button
          type="button"
          className={`tpv-chip ${conDescuento ? '' : 'tpv-chip--add'}`}
          onClick={onDescontar}
          aria-label={
            conDescuento
              ? `Editar descuento de ${linea.descripcion} (${etiquetaDto})`
              : `Añadir descuento a ${linea.descripcion}`
          }
        >
          <IconoEtiqueta />
          {conDescuento ? etiquetaDto : 'Descuento'}
        </button>

        <button
          type="button"
          className="tpv-linea__eliminar"
          onClick={onQuitar}
          aria-label={`Quitar ${linea.descripcion} del ticket`}
        >
          <IconoPapelera />
        </button>
      </div>
    </div>
  );
});
