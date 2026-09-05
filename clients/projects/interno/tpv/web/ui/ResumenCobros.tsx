// ============================================================================
// TPV · UI · Resumen diario de cobros
// ----------------------------------------------------------------------------
// El "cuadro de mando" del turno: total cobrado (KPI protagonista), reparto
// efectivo / otros medios y el desglose por método de pago. Presentacional:
// recibe el ResumenCaja ya agregado por el servidor.
// ============================================================================

import * as React from 'react';
import type { ResumenCaja } from '../../shared/types';
import { euros, numero } from './formato';
import { IconoEfectivo, IconoTarjeta, IconoRecibo } from './iconos';
import { Vacio } from './primitivas';

export interface ResumenCobrosProps {
  resumen: ResumenCaja;
}

/** Icono representativo del método por su código (efectivo/tarjeta/otro). */
function iconoMetodo(codigo: string) {
  if (codigo === 'efectivo') return <IconoEfectivo size="1.2em" />;
  if (codigo === 'tarjeta') return <IconoTarjeta size="1.2em" />;
  return <IconoRecibo size="1.2em" />;
}

export function ResumenCobros({ resumen }: ResumenCobrosProps) {
  return (
    <section className="caja-card" aria-label="Resumen de cobros del turno">
      <h3 className="caja-card__titulo">Resumen de cobros</h3>

      <div className="caja-kpis">
        <div className="caja-kpi caja-kpi--fuerte">
          <div className="caja-kpi__etq">Total cobrado</div>
          <div className="caja-kpi__val">{euros(resumen.total)}</div>
        </div>
        <div className="caja-kpi">
          <div className="caja-kpi__etq">Efectivo</div>
          <div className="caja-kpi__val">{euros(resumen.efectivo)}</div>
        </div>
        <div className="caja-kpi">
          <div className="caja-kpi__etq">Otros medios</div>
          <div className="caja-kpi__val">{euros(resumen.otros)}</div>
        </div>
      </div>

      {resumen.por_metodo.length === 0 ? (
        <div style={{ marginTop: 'var(--s-4)' }}>
          <Vacio
            titulo="Aún no hay cobros"
            texto="Los cobros del turno aparecerán aquí, agrupados por método de pago."
          />
        </div>
      ) : (
        <div className="caja-metodos" role="table" aria-label="Cobros por método">
          {resumen.por_metodo.map((m) => (
            <div className="caja-metodo" role="row" key={m.metodo_pago_id}>
              <span className="caja-metodo__icono" aria-hidden="true">
                {iconoMetodo(m.codigo)}
              </span>
              <span className="caja-metodo__nombre" role="cell">
                {m.nombre}
              </span>
              <span className="caja-metodo__conteo" role="cell">
                {numero(m.numero_pagos)}{' '}
                {m.numero_pagos === 1 ? 'cobro' : 'cobros'}
              </span>
              <span className="caja-metodo__total num" role="cell">
                {euros(m.total)}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="caja-campo__pista" style={{ marginTop: 'var(--s-3)' }}>
        {numero(resumen.numero_tickets)}{' '}
        {resumen.numero_tickets === 1 ? 'ticket cobrado' : 'tickets cobrados'} ·{' '}
        {numero(resumen.numero_cobros)}{' '}
        {resumen.numero_cobros === 1 ? 'apunte de pago' : 'apuntes de pago'}
      </p>
    </section>
  );
}
