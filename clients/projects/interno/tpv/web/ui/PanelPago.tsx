// ============================================================================
// TPV · UI · Panel de cobro (métodos, efectivo con cambio, pago mixto)
// ----------------------------------------------------------------------------
// Overlay a pantalla completa para cobrar un ticket. Soporta:
//  · Pago simple: se selecciona un método y su importe se autocompleta con el
//    pendiente → un toque en "Confirmar".
//  · Pago mixto: se añaden varios pagos (p.ej. 40 € tarjeta + resto efectivo);
//    el importe se acota al pendiente para no provocar SOBREPAGO en el servidor.
//  · Efectivo: al teclear un importe MAYOR que el pendiente, se registra sólo
//    el pendiente y la diferencia se muestra como CAMBIO a devolver del cajón.
//
// El componente NO llama a la API: reúne los pagos y delega en onConfirmar. El
// servidor sigue siendo autoritativo (valida métodos del salón y el saldo).
// ============================================================================

import * as React from 'react';
import type { MetodoPago } from '../../shared/types';
import { calcularSaldo, redondear2 } from '../../shared/money';
import { euros } from './formato';
import { Boton } from './primitivas';
import { IconoCerrar, IconoEfectivo, IconoTarjeta } from './iconos';

/** Pago reunido en la UI, listo para el payload `pagos` de registrarPago. */
export interface PagoReunido {
  metodo_pago_id: string;
  importe: number;
}

export interface PanelPagoProps {
  total: number;
  metodos: MetodoPago[];
  /** Cobro en curso (mutación viajando al servidor). */
  cobrando?: boolean;
  /** Mensaje de error del último intento (p.ej. METODO_PAGO_INVALIDO). */
  error?: string | null;
  onConfirmar: (pagos: PagoReunido[], cambio: number) => void;
  onCerrar: () => void;
}

interface PagoUI extends PagoReunido {
  key: string;
  nombre: string;
}

const DENOMINACIONES = [5, 10, 20, 50];

/** Heurística: ¿el método es efectivo? (para mostrar cambio). */
function esEfectivo(m: MetodoPago | undefined): boolean {
  if (!m) return false;
  const s = `${m.codigo} ${m.nombre}`.toLowerCase();
  return (
    s.includes('efectivo') ||
    s.includes('metalico') ||
    s.includes('metálico') ||
    s.includes('cash')
  );
}

function iconoMetodo(m: MetodoPago) {
  return esEfectivo(m) ? <IconoEfectivo /> : <IconoTarjeta />;
}

export function PanelPago({
  total,
  metodos,
  cobrando,
  error,
  onConfirmar,
  onCerrar,
}: PanelPagoProps) {
  const activos = React.useMemo(
    () => metodos.filter((m) => m.activo).sort((a, b) => a.orden - b.orden),
    [metodos],
  );

  const [metodoId, setMetodoId] = React.useState<string>(activos[0]?.id ?? '');
  const [pagos, setPagos] = React.useState<PagoUI[]>([]);
  const [seq, setSeq] = React.useState(0);
  const [cambio, setCambio] = React.useState(0);
  // Importe tecleado en euros (texto con coma decimal); '' = usar el pendiente.
  const [texto, setTexto] = React.useState('');

  const metodo = activos.find((m) => m.id === metodoId);
  const saldo = calcularSaldo(total, pagos);
  const pendiente = Math.max(saldo.pendiente, 0);

  // Importe a aplicar: lo tecleado o, si está vacío, el pendiente completo.
  const tecleado = texto === '' ? pendiente : Number(texto.replace(',', '.')) || 0;

  function pulsar(t: string) {
    setTexto((prev) => {
      if (t === '⌫') return prev.slice(0, -1);
      if (t === ',') return prev.includes(',') ? prev : (prev || '0') + ',';
      const sig = prev === '0' ? t : prev + t;
      const [, dec] = sig.split(','); // máx. 2 decimales
      if (dec && dec.length > 2) return prev;
      return sig;
    });
  }

  function anadirPago() {
    if (!metodo || pendiente <= 0) return;
    const bruto = redondear2(tecleado);
    if (bruto <= 0) return;

    // Se registra como mucho el pendiente (evita SOBREPAGO en el servidor).
    const aplicado = Math.min(bruto, pendiente);
    // Sólo el efectivo genera cambio físico por el exceso entregado.
    if (esEfectivo(metodo) && bruto > pendiente) {
      setCambio((c) => redondear2(c + (bruto - pendiente)));
    }

    setPagos((prev) => [
      ...prev,
      { key: `p${seq}`, metodo_pago_id: metodo.id, nombre: metodo.nombre, importe: aplicado },
    ]);
    setSeq((s) => s + 1);
    setTexto('');
  }

  function quitarPago(key: string) {
    setPagos((prev) => prev.filter((p) => p.key !== key));
    // Al retirar un pago se descarta el cambio calculado (se recompone al añadir).
    setCambio(0);
  }

  function confirmar() {
    onConfirmar(
      pagos.map(({ metodo_pago_id, importe }) => ({ metodo_pago_id, importe })),
      cambio,
    );
  }

  const cubierto = saldo.cubierto || pendiente <= 0;
  const sinMetodos = activos.length === 0;

  return (
    <div className="tpv-overlay" role="dialog" aria-modal="true" aria-label="Cobrar ticket" onClick={onCerrar}>
      <div className="tpv-panel" onClick={(e) => e.stopPropagation()}>
        <header className="tpv-panel__head">
          <h2>Cobrar</h2>
          <button type="button" className="tpv-panel__cerrar" onClick={onCerrar} aria-label="Cerrar sin cobrar">
            <IconoCerrar />
          </button>
        </header>

        <div className="tpv-panel__body">
          <div className="tpv-cobrar-total">
            <small>Total a cobrar</small>
            <b className="num">{euros(total)}</b>
          </div>

          {error ? (
            <p className="tpv-error" role="alert">
              {error}
            </p>
          ) : null}

          {sinMetodos ? (
            <p className="tpv-error" role="alert">
              No hay métodos de pago activos configurados para este salón.
            </p>
          ) : (
            <>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="tpv-seccion__titulo" style={{ marginBottom: 'var(--s-2)' }}>
                  Método
                </legend>
                <div className="tpv-metodos">
                  {activos.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="tpv-metodo"
                      aria-pressed={m.id === metodoId}
                      onClick={() => {
                        setMetodoId(m.id);
                        setTexto('');
                      }}
                    >
                      <span className="tpv-metodo__icono">{iconoMetodo(m)}</span>
                      {m.nombre}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Pagos ya añadidos (mixto) */}
              {pagos.length > 0 ? (
                <div className="tpv-pagos-mixto" aria-label="Pagos añadidos">
                  {pagos.map((p) => (
                    <div className="tpv-pago-item" key={p.key}>
                      <span>{p.nombre}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                        <span className="num">{euros(p.importe)}</span>
                        <button
                          type="button"
                          className="tpv-pago-item__quitar"
                          onClick={() => quitarPago(p.key)}
                          aria-label={`Quitar pago de ${p.nombre}`}
                        >
                          <IconoCerrar />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Entrada de importe (sólo si queda pendiente) */}
              {!cubierto ? (
                <>
                  <div className="tpv-entregado">
                    <span>{esEfectivo(metodo) ? 'Entregado' : 'Importe'}</span>
                    <b className="num">{euros(tecleado)}</b>
                  </div>

                  <div className="tpv-atajos">
                    <button
                      type="button"
                      className="tpv-atajo"
                      onClick={() => setTexto(String(pendiente).replace('.', ','))}
                    >
                      Exacto · {euros(pendiente)}
                    </button>
                    {esEfectivo(metodo)
                      ? DENOMINACIONES.map((d) => (
                          <button key={d} type="button" className="tpv-atajo num" onClick={() => setTexto(String(d))}>
                            {euros(d)}
                          </button>
                        ))
                      : null}
                  </div>

                  <div className="tpv-teclado">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((t) => (
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

                  <Boton variante="ghost" bloque onClick={anadirPago} disabled={tecleado <= 0}>
                    Añadir pago
                  </Boton>
                </>
              ) : null}

              {/* Saldo: pendiente / cambio / cubierto */}
              {cambio > 0 ? (
                <div className="tpv-saldo tpv-saldo--cambio">
                  <span>Cambio a devolver</span>
                  <b className="num">{euros(cambio)}</b>
                </div>
              ) : cubierto ? (
                <div className="tpv-saldo tpv-saldo--cubierto">
                  <span>Ticket cubierto</span>
                  <b className="num">{euros(saldo.pagado)}</b>
                </div>
              ) : (
                <div className="tpv-saldo tpv-saldo--pendiente">
                  <span>Pendiente</span>
                  <b className="num">{euros(pendiente)}</b>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="tpv-panel__footer">
          <Boton
            variante="primary"
            grande
            bloque
            cargando={cobrando}
            disabled={sinMetodos || !cubierto}
            onClick={confirmar}
          >
            Confirmar cobro · {euros(total)}
          </Boton>
        </footer>
      </div>
    </div>
  );
}
