// ============================================================================
// TPV · UI · Panel de caja (orquestador)
// ----------------------------------------------------------------------------
// Punto de entrada del módulo de caja. Decide el estado a mostrar:
//   · Sin caja abierta → formulario de apertura + histórico de cierres.
//   · Caja abierta      → pestañas Resumen / Movimientos / Arqueo del turno.
//   · Ver un cierre pasado → detalle de sólo lectura (resumen + arqueo + movs).
//
// Consume los hooks de dominio (useCajaAbierta, useSesionesCaja y las mutaciones)
// y reparte los datos a componentes presentacionales. Requiere el CSS:
//   import 'tpv/web/ui/tpv.css';
//   import 'tpv/web/ui/caja.css';
// ============================================================================

import * as React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  useAbrirCaja,
  useCaja,
  useCajaAbierta,
  useCerrarCaja,
  useMovimientoCaja,
  useSesionesCaja,
} from '../hooks';
import type { TipoMovimientoCaja } from '../../shared/types';
import { fecha, hora } from './formato';
import { Boton, Spinner } from './primitivas';
import { IconoCajon, IconoCandado } from './iconos';
import { AbrirCajaForm } from './AbrirCajaForm';
import { MovimientoCajaForm } from './MovimientoCajaForm';
import { MovimientosLista } from './MovimientosLista';
import { ResumenCobros } from './ResumenCobros';
import { ArqueoBanda } from './ArqueoBanda';
import { ArqueoCierre } from './ArqueoCierre';
import { HistorialCajas } from './HistorialCajas';

export interface PanelCajaProps {
  sb: SupabaseClient;
  salonId: string;
  /** Empleado que opera (se registra en apertura/cierre/movimientos). */
  empleadoId?: string | null;
  /** Nº de sesiones del histórico a cargar (por defecto 30). */
  limiteHistorial?: number;
}

type Pestana = 'resumen' | 'movimientos' | 'arqueo';

/** Mensaje legible de un error de mutación (ErrorTpv extiende Error). */
function mensajeError(e: unknown): string | null {
  return e instanceof Error ? e.message : null;
}

export function PanelCaja({
  sb,
  salonId,
  empleadoId = null,
  limiteHistorial = 30,
}: PanelCajaProps) {
  const cajaAbierta = useCajaAbierta(sb, salonId);
  const historial = useSesionesCaja(sb, { salon_id: salonId, limite: limiteHistorial });

  const abrir = useAbrirCaja(sb);
  const movimiento = useMovimientoCaja(sb);
  const cerrar = useCerrarCaja(sb);

  const [pestana, setPestana] = React.useState<Pestana>('resumen');
  const [sesionVista, setSesionVista] = React.useState<string | null>(null);

  // Detalle de sólo lectura de una sesión del histórico.
  const detalle = useCaja(sb, sesionVista);

  // -- Vista: detalle de un cierre pasado ------------------------------------
  if (sesionVista) {
    return (
      <div className="caja">
        <div className="caja__hoja">
          <header className="caja-cab">
            <div>
              <h1 className="caja-cab__titulo">
                <IconoCandado /> Cierre de caja
              </h1>
              {detalle.data ? (
                <p className="caja-cab__sub">
                  {fecha(detalle.data.sesion.abierta_at)} ·{' '}
                  {hora(detalle.data.sesion.abierta_at)}
                  {detalle.data.sesion.cerrada_at
                    ? ` – ${hora(detalle.data.sesion.cerrada_at)}`
                    : ''}
                </p>
              ) : null}
            </div>
            <Boton variante="ghost" onClick={() => setSesionVista(null)}>
              ← Volver
            </Boton>
          </header>

          {detalle.isPending ? (
            <Cargando />
          ) : detalle.isError || !detalle.data ? (
            <p className="caja-error" role="alert">
              No se pudo cargar la sesión.
            </p>
          ) : (
            <>
              <ResumenCobros resumen={detalle.data.resumen} />
              <ArqueoBanda
                arqueo={detalle.data.arqueo}
                etiquetaTeorico="Efectivo esperado al cierre"
              />
              <section className="caja-card">
                <h3 className="caja-card__titulo">Movimientos del turno</h3>
                <MovimientosLista movimientos={detalle.data.movimientos} />
              </section>
            </>
          )}
        </div>
      </div>
    );
  }

  // -- Carga inicial ---------------------------------------------------------
  if (cajaAbierta.isPending) {
    return (
      <div className="caja">
        <div className="caja__hoja">
          <Cargando />
        </div>
      </div>
    );
  }

  const caja = cajaAbierta.data ?? null;

  // -- Vista: sin caja abierta -----------------------------------------------
  if (!caja) {
    return (
      <div className="caja">
        <div className="caja__hoja">
          <header className="caja-cab">
            <div>
              <h1 className="caja-cab__titulo">
                <IconoCajon /> Caja
              </h1>
              <p className="caja-cab__sub">
                No hay ninguna caja abierta en este salón.
              </p>
            </div>
            <span className="caja-estado caja-estado--cerrada">Cerrada</span>
          </header>

          <AbrirCajaForm
            onAbrir={(saldoInicial, notas) =>
              abrir.mutate({
                salon_id: salonId,
                saldo_inicial: saldoInicial,
                empleado_apertura_id: empleadoId,
                notas,
              })
            }
            cargando={abrir.isPending}
            error={mensajeError(abrir.error)}
          />

          <section className="caja-card">
            <h3 className="caja-card__titulo">Cierres recientes</h3>
            {historial.isPending ? (
              <Cargando />
            ) : (
              <HistorialCajas
                sesiones={historial.data ?? []}
                onAbrirSesion={setSesionVista}
              />
            )}
          </section>
        </div>
      </div>
    );
  }

  // -- Vista: caja abierta (turno en curso) ----------------------------------
  const { sesion, arqueo, resumen, movimientos } = caja;

  return (
    <div className="caja">
      <div className="caja__hoja">
        <header className="caja-cab">
          <div>
            <h1 className="caja-cab__titulo">
              <IconoCajon /> Turno de caja
            </h1>
            <p className="caja-cab__sub">
              Abierta a las {hora(sesion.abierta_at)} · {fecha(sesion.abierta_at)}
            </p>
          </div>
          <span className="caja-estado caja-estado--abierta">
            <span className="caja-estado__punto" />
            Abierta
          </span>
        </header>

        <nav className="caja-tabs" role="tablist" aria-label="Secciones del turno">
          <Tab activa={pestana === 'resumen'} onClick={() => setPestana('resumen')}>
            Resumen
          </Tab>
          <Tab
            activa={pestana === 'movimientos'}
            onClick={() => setPestana('movimientos')}
          >
            Movimientos
          </Tab>
          <Tab activa={pestana === 'arqueo'} onClick={() => setPestana('arqueo')}>
            Arqueo
          </Tab>
        </nav>

        {pestana === 'resumen' ? (
          <>
            <ResumenCobros resumen={resumen} />
            <ArqueoBanda arqueo={arqueo} etiquetaTeorico="Efectivo esperado ahora" />
          </>
        ) : null}

        {pestana === 'movimientos' ? (
          <>
            <MovimientoCajaForm
              onRegistrar={(tipo: TipoMovimientoCaja, importe, motivo) =>
                movimiento.mutate({
                  sesion_caja_id: sesion.id,
                  tipo,
                  importe,
                  motivo,
                  empleado_id: empleadoId,
                })
              }
              cargando={movimiento.isPending}
              error={mensajeError(movimiento.error)}
            />
            <section className="caja-card">
              <h3 className="caja-card__titulo">Movimientos del turno</h3>
              <MovimientosLista movimientos={movimientos} />
            </section>
          </>
        ) : null}

        {pestana === 'arqueo' ? (
          <ArqueoCierre
            arqueo={arqueo}
            onCerrar={(efectivoReal, notasCierre) =>
              cerrar.mutate({
                sesion_caja_id: sesion.id,
                efectivo_real: efectivoReal,
                empleado_cierre_id: empleadoId,
                notas_cierre: notasCierre,
              })
            }
            cargando={cerrar.isPending}
            error={mensajeError(cerrar.error)}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Pestaña accesible (role=tab). */
function Tab({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      className="caja-tab"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Indicador de carga centrado. */
function Cargando() {
  return (
    <div className="caja-vacio" role="status">
      <Spinner etiqueta="Cargando caja" />
    </div>
  );
}
