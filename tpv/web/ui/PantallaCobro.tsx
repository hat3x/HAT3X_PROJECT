// ============================================================================
// TPV · UI · Pantalla de cobro (orquestador)
// ----------------------------------------------------------------------------
// Une catálogo + ticket + cobro + confirmación en una máquina de estados de 3
// fases: `compra` → `pago` → `confirmado`. El carrito es LOCAL (useReducer) y
// se previsualiza con money.ts; sólo se toca la red al cobrar:
//
//   Cobrar  → crea (o actualiza) el ticket con sus líneas en el servidor
//             (autoritativo del total) y abre el panel de pago.
//   Confirmar → registra el/los pago(s) y marca la venta como pagada.
//
// Las Edge Functions y sus hooks (sub-3) hacen el trabajo real; aquí sólo se
// coordina la UI, los estados de carga/vacío y el feedback de error.
// ============================================================================

import * as React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetodoPago } from '../../shared/types';
import {
  previsualizarTicket,
  useActualizarLineas,
  useCrearTicket,
  useRegistrarPago,
} from '../hooks';
import type { ItemCatalogo } from './catalogo';
import {
  carritoInicial,
  carritoReducer,
  lineasInput,
  type Descuento,
  type LineaCarrito,
} from './carritoReducer';
import { CatalogoPanel } from './CatalogoPanel';
import { TicketPanel } from './TicketPanel';
import { DescuentoSheet } from './DescuentoSheet';
import { PanelPago, type PagoReunido } from './PanelPago';
import { Confirmacion } from './Confirmacion';

export interface PantallaCobroProps {
  supabase: SupabaseClient;
  salonId: string;
  /** Catálogo de servicios/productos del salón (de tu propio fetch). */
  catalogo: ItemCatalogo[];
  metodosPago: MetodoPago[];
  catalogoCargando?: boolean;
  /** Sesión de caja abierta, para el cuadre de efectivo. */
  sesionCajaId?: string | null;
  empleadoId?: string | null;
  clienteId?: string | null;
  reservaId?: string | null;
  /** Tema visual del mostrador. */
  tema?: 'dia' | 'noche';
  /** Acción de recibo tras cobrar (imprimir/enviar). Recibe la venta_id. */
  onRecibo?: (ventaId: string) => void;
}

type Fase = 'compra' | 'pago' | 'confirmado';

/** Objetivo del editor de descuento: una línea concreta o el ticket entero. */
type ObjetivoDto = { tipo: 'linea'; key: string } | { tipo: 'global' } | null;

function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'No se ha podido completar la operación. Inténtalo de nuevo.';
}

export function PantallaCobro({
  supabase,
  salonId,
  catalogo,
  metodosPago,
  catalogoCargando,
  sesionCajaId,
  empleadoId,
  clienteId,
  reservaId,
  tema = 'dia',
  onRecibo,
}: PantallaCobroProps) {
  const [carrito, dispatch] = React.useReducer(carritoReducer, carritoInicial);
  const [fase, setFase] = React.useState<Fase>('compra');
  const [ventaId, setVentaId] = React.useState<string | null>(null);
  const [numero, setNumero] = React.useState<number | null>(null);
  const [totalServidor, setTotalServidor] = React.useState(0);
  const [cambioFinal, setCambioFinal] = React.useState(0);
  const [cobradoFinal, setCobradoFinal] = React.useState(0);
  const [objetivoDto, setObjetivoDto] = React.useState<ObjetivoDto>(null);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [errorPago, setErrorPago] = React.useState<string | null>(null);
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => setMontado(true), []);

  const crear = useCrearTicket(supabase);
  const actualizar = useActualizarLineas(supabase);
  const pagar = useRegistrarPago(supabase);

  // Previsualización de totales en cliente (mismo núcleo que el servidor).
  const resumen = React.useMemo(
    () => previsualizarTicket(lineasInput(carrito)),
    [carrito],
  );

  const preparandoCobro = crear.isPending || actualizar.isPending;

  // -- Acciones de carrito --------------------------------------------------
  const anadir = React.useCallback(
    (item: ItemCatalogo) => dispatch({ tipo: 'anadir', item }),
    [],
  );

  // -- Descuentos -----------------------------------------------------------
  const lineaObjetivo: LineaCarrito | undefined =
    objetivoDto?.tipo === 'linea'
      ? carrito.lineas.find((l) => l.key === objetivoDto.key)
      : undefined;

  function aplicarDescuento(desc: Descuento) {
    if (!objetivoDto) return;
    if (objetivoDto.tipo === 'linea') {
      dispatch({ tipo: 'descontar_linea', key: objetivoDto.key, descuento: desc });
    } else {
      const pct = desc?.modo === 'porcentaje' ? desc.valor : 0;
      dispatch({ tipo: 'descuento_global', porcentaje: pct });
    }
  }

  // -- Ir a cobro: persistir líneas y abrir panel de pago -------------------
  async function irACobrar() {
    setErrorBanner(null);
    const lineas = lineasInput(carrito);
    if (lineas.length === 0) return;

    try {
      const ticket = ventaId
        ? await actualizar.mutateAsync({ venta_id: ventaId, lineas })
        : await crear.mutateAsync({
            salon_id: salonId,
            sesion_caja_id: sesionCajaId ?? undefined,
            empleado_id: empleadoId ?? undefined,
            cliente_id: clienteId ?? undefined,
            reserva_id: reservaId ?? undefined,
            lineas,
          });
      setVentaId(ticket.venta.id);
      setNumero(ticket.venta.numero_ticket);
      setTotalServidor(ticket.venta.total);
      setErrorPago(null);
      setFase('pago');
    } catch (e) {
      setErrorBanner(mensajeDeError(e));
    }
  }

  // -- Confirmar cobro ------------------------------------------------------
  async function confirmarCobro(pagos: PagoReunido[], cambio: number) {
    if (!ventaId) return;
    setErrorPago(null);
    try {
      const ticket = await pagar.mutateAsync({
        venta_id: ventaId,
        sesion_caja_id: sesionCajaId ?? undefined,
        pagos,
        marcar_pagada: true,
      });
      setCambioFinal(cambio);
      setCobradoFinal(ticket.venta.total);
      setFase('confirmado');
    } catch (e) {
      setErrorPago(mensajeDeError(e));
    }
  }

  // -- Reiniciar para el siguiente ticket -----------------------------------
  function nuevoTicket() {
    dispatch({ tipo: 'vaciar' });
    setVentaId(null);
    setNumero(null);
    setTotalServidor(0);
    setCambioFinal(0);
    setCobradoFinal(0);
    setFase('compra');
  }

  return (
    <div
      className={`tpv ${montado ? 'tpv--montado' : ''}`}
      data-tpv-theme={tema === 'noche' ? 'noche' : undefined}
    >
      <CatalogoPanel items={catalogo} onAnadir={anadir} cargando={catalogoCargando} />

      <TicketPanel
        estado={carrito}
        resumen={resumen}
        numero={numero}
        recalculando={preparandoCobro}
        onIncrementar={(key) => dispatch({ tipo: 'incrementar', key })}
        onDecrementar={(key) => dispatch({ tipo: 'decrementar', key })}
        onQuitar={(key) => dispatch({ tipo: 'quitar', key })}
        onDescontarLinea={(key) => setObjetivoDto({ tipo: 'linea', key })}
        onDescuentoGlobal={() => setObjetivoDto({ tipo: 'global' })}
        onVaciar={() => dispatch({ tipo: 'vaciar' })}
        onCobrar={irACobrar}
      />

      {/* Editor de descuento (línea o global) */}
      <DescuentoSheet
        abierto={objetivoDto !== null}
        titulo={
          objetivoDto?.tipo === 'linea'
            ? `Descuento · ${lineaObjetivo?.descripcion ?? ''}`
            : 'Descuento global'
        }
        valorInicial={lineaObjetivo?.descuento ?? undefined}
        soloPorcentaje={objetivoDto?.tipo === 'global'}
        onAplicar={aplicarDescuento}
        onCerrar={() => setObjetivoDto(null)}
      />

      {/* Cobro */}
      {fase === 'pago' ? (
        <PanelPago
          total={totalServidor}
          metodos={metodosPago}
          cobrando={pagar.isPending}
          error={errorPago}
          onConfirmar={confirmarCobro}
          onCerrar={() => setFase('compra')}
        />
      ) : null}

      {/* Confirmación */}
      {fase === 'confirmado' && numero !== null ? (
        <Confirmacion
          numero={numero}
          cobrado={cobradoFinal}
          cambio={cambioFinal}
          onRecibo={onRecibo && ventaId ? () => onRecibo(ventaId) : undefined}
          onNuevoTicket={nuevoTicket}
        />
      ) : null}

      {/* Banner de error de la transición a cobro */}
      {errorBanner ? (
        <div
          role="alert"
          className="tpv-error"
          style={{
            position: 'fixed',
            insetInline: 0,
            bottom: 'var(--s-4)',
            width: 'fit-content',
            margin: '0 auto',
            zIndex: 50,
            boxShadow: 'var(--shadow-2)',
          }}
          onClick={() => setErrorBanner(null)}
        >
          {errorBanner}
        </div>
      ) : null}
    </div>
  );
}
