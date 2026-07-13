// ============================================================================
// TPV · UI · Apertura de caja
// ----------------------------------------------------------------------------
// Formulario para abrir el turno con un fondo de cambio inicial. El importe se
// teclea con coma decimal (es-ES) y se normaliza a número antes de emitir. El
// contenedor decide qué hacer con (saldoInicial, notas) y aporta estado de
// carga/error.
// ============================================================================

import * as React from 'react';
import { Boton } from './primitivas';
import { IconoCajon } from './iconos';
import { euros } from './formato';

export interface AbrirCajaFormProps {
  onAbrir: (saldoInicial: number, notas: string | null) => void;
  cargando?: boolean;
  error?: string | null;
}

/** "12,50" | "12.50" → 12.5; entrada inválida → NaN. */
function aNumero(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.');
  return limpio === '' ? NaN : Number(limpio);
}

export function AbrirCajaForm({ onAbrir, cargando, error }: AbrirCajaFormProps) {
  const [fondo, setFondo] = React.useState('');
  const [notas, setNotas] = React.useState('');

  const valor = aNumero(fondo);
  const valido = Number.isFinite(valor) && valor >= 0;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || cargando) return;
    onAbrir(valor, notas.trim() || null);
  }

  return (
    <section className="caja-card">
      <h3 className="caja-card__titulo">
        <IconoCajon size="1.2em" /> Abrir caja
      </h3>

      <form className="caja-form" onSubmit={enviar} noValidate>
        <div className="caja-campo">
          <label className="caja-campo__etq" htmlFor="caja-fondo">
            Fondo de cambio inicial
          </label>
          <input
            id="caja-fondo"
            className="caja-input caja-input--importe"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={fondo}
            onChange={(e) => setFondo(e.target.value)}
            aria-describedby="caja-fondo-pista"
          />
          <span id="caja-fondo-pista" className="caja-campo__pista">
            Efectivo con el que arranca el cajón{valido ? ` · ${euros(valor)}` : ''}.
          </span>
        </div>

        <div className="caja-campo">
          <label className="caja-campo__etq" htmlFor="caja-notas">
            Notas <span style={{ fontWeight: 400 }}>(opcional)</span>
          </label>
          <textarea
            id="caja-notas"
            className="caja-input"
            rows={2}
            maxLength={1000}
            placeholder="p. ej. turno de tarde, cajón nuevo…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
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
            grande
            bloque
            cargando={cargando}
            disabled={!valido}
          >
            Abrir caja
          </Boton>
        </div>
      </form>
    </section>
  );
}
