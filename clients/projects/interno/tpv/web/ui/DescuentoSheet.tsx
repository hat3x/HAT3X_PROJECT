// ============================================================================
// TPV · UI · Editor de descuento (hoja modal)
// ----------------------------------------------------------------------------
// Aplica descuento a una LÍNEA (importe € o %) o un descuento GLOBAL (%). El
// importe y el porcentaje son excluyentes (coherente con el esquema Zod). No
// calcula el importe final: sólo emite el Descuento; money.ts lo acota a la
// base de la línea. Teclado numérico grande para el mostrador.
// ============================================================================

import * as React from 'react';
import type { Descuento } from './carritoReducer';
import { Boton } from './primitivas';
import { IconoCerrar } from './iconos';

export interface DescuentoSheetProps {
  abierto: boolean;
  /** Título de contexto ("Descuento en Corte" o "Descuento global"). */
  titulo: string;
  valorInicial?: Descuento;
  /** Sólo permite porcentaje (caso descuento global sobre todas las líneas). */
  soloPorcentaje?: boolean;
  onAplicar: (descuento: Descuento) => void;
  onCerrar: () => void;
}

type Modo = 'importe' | 'porcentaje';

export function DescuentoSheet({
  abierto,
  titulo,
  valorInicial,
  soloPorcentaje,
  onAplicar,
  onCerrar,
}: DescuentoSheetProps) {
  const [modo, setModo] = React.useState<Modo>(
    soloPorcentaje ? 'porcentaje' : valorInicial?.modo ?? 'porcentaje',
  );
  const [texto, setTexto] = React.useState<string>(
    valorInicial ? String(valorInicial.valor) : '',
  );

  // Al reabrir, resembrar desde el valor actual de la línea.
  React.useEffect(() => {
    if (!abierto) return;
    setModo(soloPorcentaje ? 'porcentaje' : valorInicial?.modo ?? 'porcentaje');
    setTexto(valorInicial ? String(valorInicial.valor) : '');
  }, [abierto, soloPorcentaje, valorInicial]);

  if (!abierto) return null;

  const valor = Number(texto.replace(',', '.')) || 0;
  const excedePct = modo === 'porcentaje' && valor > 100;

  function pulsar(t: string) {
    setTexto((prev) => {
      if (t === '⌫') return prev.slice(0, -1);
      if (t === ',') return prev.includes(',') ? prev : (prev || '0') + ',';
      // Evita ceros a la izquierda tipo "007".
      return prev === '0' ? t : prev + t;
    });
  }

  function aplicar() {
    if (valor <= 0) {
      onAplicar(null); // quitar descuento
    } else {
      onAplicar({ modo, valor: modo === 'porcentaje' ? Math.min(valor, 100) : valor });
    }
    onCerrar();
  }

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

  return (
    <div className="tpv-overlay" role="dialog" aria-modal="true" aria-label={titulo} onClick={onCerrar}>
      <div className="tpv-panel" style={{ maxWidth: '30rem' }} onClick={(e) => e.stopPropagation()}>
        <header className="tpv-panel__head">
          <h2>{titulo}</h2>
          <button type="button" className="tpv-panel__cerrar" onClick={onCerrar} aria-label="Cerrar">
            <IconoCerrar />
          </button>
        </header>

        <div className="tpv-panel__body">
          {!soloPorcentaje ? (
            <div className="tpv-metodos" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button
                type="button"
                className="tpv-metodo"
                aria-pressed={modo === 'porcentaje'}
                onClick={() => setModo('porcentaje')}
              >
                <span className="tpv-metodo__icono">%</span>
                Porcentaje
              </button>
              <button
                type="button"
                className="tpv-metodo"
                aria-pressed={modo === 'importe'}
                onClick={() => setModo('importe')}
              >
                <span className="tpv-metodo__icono">€</span>
                Importe
              </button>
            </div>
          ) : null}

          <div className="tpv-entregado">
            <span>{modo === 'porcentaje' ? 'Descuento' : 'Rebaja'}</span>
            <b className="num">
              {texto || '0'}
              {modo === 'porcentaje' ? ' %' : ' €'}
            </b>
          </div>

          {excedePct ? (
            <p className="tpv-error" role="alert">
              Un porcentaje no puede superar el 100 %.
            </p>
          ) : null}

          <div className="tpv-teclado">
            {teclas.map((t) => (
              <button
                key={t}
                type="button"
                className={`tpv-tecla ${t === '⌫' || t === ',' ? 'tpv-tecla--util' : ''}`}
                onClick={() => pulsar(t)}
                aria-label={t === '⌫' ? 'Borrar' : t}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <footer className="tpv-panel__footer">
          {valorInicial ? (
            <Boton
              variante="danger"
              bloque
              onClick={() => {
                onAplicar(null);
                onCerrar();
              }}
            >
              Quitar descuento
            </Boton>
          ) : null}
          <Boton variante="primary" grande bloque onClick={aplicar} disabled={excedePct}>
            Aplicar
          </Boton>
        </footer>
      </div>
    </div>
  );
}
