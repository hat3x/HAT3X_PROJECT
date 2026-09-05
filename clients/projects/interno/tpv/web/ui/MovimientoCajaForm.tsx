// ============================================================================
// TPV · UI · Registro de movimiento manual de efectivo
// ----------------------------------------------------------------------------
// Segmento entrada/salida + importe (coma decimal) + motivo obligatorio. Emite
// (tipo, importe, motivo); el contenedor persiste y aporta carga/error. Tras
// emitir con éxito, el formulario se limpia para el siguiente apunte.
// ============================================================================

import * as React from 'react';
import type { TipoMovimientoCaja } from '../../shared/types';
import { Boton } from './primitivas';
import { IconoEntrada, IconoSalida } from './iconos';

export interface MovimientoCajaFormProps {
  onRegistrar: (tipo: TipoMovimientoCaja, importe: number, motivo: string) => void;
  cargando?: boolean;
  error?: string | null;
}

function aNumero(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.');
  return limpio === '' ? NaN : Number(limpio);
}

export function MovimientoCajaForm({
  onRegistrar,
  cargando,
  error,
}: MovimientoCajaFormProps) {
  const [tipo, setTipo] = React.useState<TipoMovimientoCaja>('entrada');
  const [importe, setImporte] = React.useState('');
  const [motivo, setMotivo] = React.useState('');

  const valor = aNumero(importe);
  const valido = Number.isFinite(valor) && valor >= 0.01 && motivo.trim().length > 0;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || cargando) return;
    onRegistrar(tipo, valor, motivo.trim());
    setImporte('');
    setMotivo('');
  }

  return (
    <section className="caja-card">
      <h3 className="caja-card__titulo">Nuevo movimiento de efectivo</h3>

      <form className="caja-form" onSubmit={enviar} noValidate>
        <div className="caja-seg" role="group" aria-label="Tipo de movimiento">
          <button
            type="button"
            className="caja-seg__btn caja-seg__btn--entrada"
            aria-pressed={tipo === 'entrada'}
            onClick={() => setTipo('entrada')}
          >
            <IconoEntrada size="1.1em" /> Entrada
          </button>
          <button
            type="button"
            className="caja-seg__btn caja-seg__btn--salida"
            aria-pressed={tipo === 'salida'}
            onClick={() => setTipo('salida')}
          >
            <IconoSalida size="1.1em" /> Salida
          </button>
        </div>

        <div className="caja-campo">
          <label className="caja-campo__etq" htmlFor="caja-mov-importe">
            Importe
          </label>
          <input
            id="caja-mov-importe"
            className="caja-input caja-input--importe"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
          />
        </div>

        <div className="caja-campo">
          <label className="caja-campo__etq" htmlFor="caja-mov-motivo">
            Motivo
          </label>
          <input
            id="caja-mov-motivo"
            className="caja-input"
            maxLength={300}
            placeholder={
              tipo === 'entrada' ? 'p. ej. aporte de cambio' : 'p. ej. pago a mensajero'
            }
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {error ? (
          <p className="caja-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="caja-acciones">
          <Boton
            type="submit"
            variante="primary"
            bloque
            cargando={cargando}
            disabled={!valido}
          >
            Registrar {tipo === 'entrada' ? 'entrada' : 'salida'}
          </Boton>
        </div>
      </form>
    </section>
  );
}
