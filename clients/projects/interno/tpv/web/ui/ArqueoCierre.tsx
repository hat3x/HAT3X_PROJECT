// ============================================================================
// TPV · UI · Cierre de caja con arqueo
// ----------------------------------------------------------------------------
// El cajero cuenta el efectivo del cajón y lo teclea; se previsualiza el
// descuadre en vivo (real − teórico) reutilizando ArqueoBanda. El teórico
// definitivo y el descuadre los vuelve a fijar el servidor al cerrar (aquí sólo
// es una previsualización para dar confianza). Emite (efectivoReal, notasCierre).
// ============================================================================

import * as React from 'react';
import type { ArqueoCaja } from '../../shared/types';
import { redondear2, TOLERANCIA_EUR } from '../../shared/money';
import { Boton } from './primitivas';
import { ArqueoBanda } from './ArqueoBanda';
import { IconoBalanza } from './iconos';

export interface ArqueoCierreProps {
  /** Arqueo abierto (efectivo_real = null): aporta el teórico y el desglose. */
  arqueo: ArqueoCaja;
  onCerrar: (efectivoReal: number, notasCierre: string | null) => void;
  cargando?: boolean;
  error?: string | null;
}

function aNumero(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.');
  return limpio === '' ? NaN : Number(limpio);
}

export function ArqueoCierre({ arqueo, onCerrar, cargando, error }: ArqueoCierreProps) {
  const [conteo, setConteo] = React.useState('');
  const [notas, setNotas] = React.useState('');

  const valor = aNumero(conteo);
  const hayConteo = Number.isFinite(valor) && valor >= 0;

  // Previsualización: mismo cálculo de descuadre que hará el servidor.
  const preview: ArqueoCaja = React.useMemo(() => {
    if (!hayConteo) return arqueo;
    const real = redondear2(valor);
    const descuadre = redondear2(real - arqueo.efectivo_teorico);
    return {
      ...arqueo,
      efectivo_real: real,
      descuadre,
      cuadra: Math.abs(descuadre) < TOLERANCIA_EUR,
    };
  }, [arqueo, hayConteo, valor]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!hayConteo || cargando) return;
    onCerrar(redondear2(valor), notas.trim() || null);
  }

  return (
    <section className="caja-card">
      <h3 className="caja-card__titulo">
        <IconoBalanza size="1.2em" /> Arqueo y cierre
      </h3>

      <ArqueoBanda arqueo={preview} />

      <form
        className="caja-form"
        onSubmit={enviar}
        noValidate
        style={{ marginTop: 'var(--s-5)' }}
      >
        <div className="caja-campo">
          <label className="caja-campo__etq" htmlFor="caja-conteo">
            Efectivo contado en el cajón
          </label>
          <input
            id="caja-conteo"
            className="caja-input caja-input--importe"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={conteo}
            onChange={(e) => setConteo(e.target.value)}
            aria-describedby="caja-conteo-pista"
          />
          <span id="caja-conteo-pista" className="caja-campo__pista">
            Cuenta billetes y monedas y anota el total. El descuadre se calcula solo.
          </span>
        </div>

        <div className="caja-campo">
          <label className="caja-campo__etq" htmlFor="caja-notas-cierre">
            Nota de cierre <span style={{ fontWeight: 400 }}>(opcional)</span>
          </label>
          <textarea
            id="caja-notas-cierre"
            className="caja-input"
            rows={2}
            maxLength={1000}
            placeholder="Justifica un descuadre o deja constancia del turno…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>

        {error ? (
          <p className="caja-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="caja-acciones caja-acciones--fin">
          <Boton
            type="submit"
            variante="primary"
            grande
            cargando={cargando}
            disabled={!hayConteo}
          >
            Cerrar caja
          </Boton>
        </div>
      </form>
    </section>
  );
}
