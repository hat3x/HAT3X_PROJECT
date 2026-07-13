// ============================================================================
// TPV · Núcleo de cálculo de CAJA (arqueo, teórico de efectivo, resumen)
// ----------------------------------------------------------------------------
// Fuente ÚNICA de verdad del cálculo de caja, hermano de money.ts. Puro, sin
// dependencias ni efectos: se importa idéntico desde las Edge Functions (Deno,
// servidor autoritativo del cierre) y desde la web (previsualización del arqueo
// mientras el cajero cuenta el cajón, sin round-trips).
//
// Regla de oro: el efectivo TEÓRICO (lo que debería haber en el cajón) lo fija
// SIEMPRE el servidor a partir de datos persistidos —saldo inicial, cobros en
// efectivo y movimientos manuales—, nunca un importe enviado por el navegador.
// El cajero sólo aporta el efectivo REAL contado; el descuadre es su diferencia.
//
//     efectivo_teorico = saldo_inicial
//                      + Σ cobros en efectivo (con signo: el cambio resta)
//                      + Σ entradas manuales
//                      − Σ salidas manuales
//     descuadre        = efectivo_real − efectivo_teorico   (negativo = falta)
// ============================================================================

import { redondear2, TOLERANCIA_EUR } from './money.ts';

export type EstadoCaja = 'abierta' | 'cerrada';
export type TipoMovimientoCaja = 'entrada' | 'salida';

// ----------------------------------------------------------------------------
// Movimientos manuales de efectivo
// ----------------------------------------------------------------------------

/** Movimiento manual mínimo para el cálculo. `importe` siempre > 0; el signo lo da `tipo`. */
export interface MovimientoCalculable {
  tipo: TipoMovimientoCaja;
  importe: number;
}

/** Entradas, salidas y neto (entradas − salidas) de un conjunto de movimientos. */
export interface NetoMovimientos {
  entradas: number;
  salidas: number;
  neto: number;
}

/** Agrega movimientos manuales en entradas, salidas y neto con signo. */
export function netoMovimientos(movs: MovimientoCalculable[]): NetoMovimientos {
  let entradas = 0;
  let salidas = 0;
  for (const m of movs) {
    const importe = Math.abs(Number(m.importe) || 0);
    if (m.tipo === 'entrada') entradas += importe;
    else salidas += importe;
  }
  entradas = redondear2(entradas);
  salidas = redondear2(salidas);
  return { entradas, salidas, neto: redondear2(entradas - salidas) };
}

// ----------------------------------------------------------------------------
// Cobros (para desglose y para el teórico de efectivo)
// ----------------------------------------------------------------------------

/**
 * Cobro mínimo para el arqueo: su importe (con signo — el cambio/devolución es
 * negativo) y si se hizo en efectivo (única forma de pago que toca el cajón).
 */
export interface CobroCalculable {
  importe: number;
  es_efectivo: boolean;
}

/** Desglose del dinero cobrado en la sesión, para el resumen diario. */
export interface ResumenCobros {
  /** Σ de todos los cobros completados (efectivo + resto). */
  total: number;
  /** Σ de los cobros en efectivo (con signo). */
  efectivo: number;
  /** total − efectivo (tarjeta, bizum, transferencia, vale…). */
  otros: number;
  /** Número de apuntes de pago contados. */
  numero_cobros: number;
}

/** Resume los cobros de la sesión en total, efectivo y resto. */
export function resumirCobros(cobros: CobroCalculable[]): ResumenCobros {
  let total = 0;
  let efectivo = 0;
  for (const c of cobros) {
    const importe = Number(c.importe) || 0;
    total += importe;
    if (c.es_efectivo) efectivo += importe;
  }
  total = redondear2(total);
  efectivo = redondear2(efectivo);
  return {
    total,
    efectivo,
    otros: redondear2(total - efectivo),
    numero_cobros: cobros.length,
  };
}

// ----------------------------------------------------------------------------
// Arqueo de caja
// ----------------------------------------------------------------------------

/** Datos de partida para calcular el arqueo de una sesión. */
export interface EntradaArqueo {
  /** Fondo con el que se abrió la caja (≥ 0). */
  saldo_inicial: number;
  /** Cobros completados de la sesión (sólo los de efectivo tocan el cajón). */
  cobros: CobroCalculable[];
  /** Movimientos manuales de efectivo (aportes / retiradas). */
  movimientos: MovimientoCalculable[];
  /** Efectivo contado físicamente al cierre. null = aún no contado. */
  efectivo_real?: number | null;
}

/** Resultado del arqueo: teórico desglosado + real + descuadre. */
export interface Arqueo {
  saldo_inicial: number;
  /** Σ cobros en efectivo (con signo). */
  cobros_efectivo: number;
  /** Σ entradas manuales. */
  entradas: number;
  /** Σ salidas manuales. */
  salidas: number;
  /** entradas − salidas. */
  movimientos_neto: number;
  /** Efectivo que DEBERÍA haber en el cajón al cierre. */
  efectivo_teorico: number;
  /** Efectivo contado; null si aún no se ha contado. */
  efectivo_real: number | null;
  /** efectivo_real − efectivo_teorico. Negativo = falta dinero. null si no contado. */
  descuadre: number | null;
  /** true si hay conteo y |descuadre| < tolerancia (la caja cuadra). */
  cuadra: boolean;
}

/**
 * Calcula el arqueo de una sesión de caja. Es puro y determinista: mismas
 * entradas → mismo teórico y descuadre en cliente y servidor.
 */
export function calcularArqueo(entrada: EntradaArqueo): Arqueo {
  const saldoInicial = redondear2(Number(entrada.saldo_inicial) || 0);

  const cobrosEfectivo = redondear2(
    entrada.cobros.reduce(
      (acc, c) => acc + (c.es_efectivo ? Number(c.importe) || 0 : 0),
      0,
    ),
  );

  const { entradas, salidas, neto } = netoMovimientos(entrada.movimientos);

  const efectivoTeorico = redondear2(saldoInicial + cobrosEfectivo + neto);

  const tieneConteo =
    entrada.efectivo_real != null && Number.isFinite(entrada.efectivo_real);
  const efectivoReal = tieneConteo ? redondear2(entrada.efectivo_real as number) : null;
  const descuadre =
    efectivoReal != null ? redondear2(efectivoReal - efectivoTeorico) : null;

  return {
    saldo_inicial: saldoInicial,
    cobros_efectivo: cobrosEfectivo,
    entradas,
    salidas,
    movimientos_neto: neto,
    efectivo_teorico: efectivoTeorico,
    efectivo_real: efectivoReal,
    descuadre,
    cuadra: descuadre != null && Math.abs(descuadre) < TOLERANCIA_EUR,
  };
}

/** Etiqueta de severidad del descuadre para la UI (sin traducir estados). */
export type SeveridadDescuadre = 'cuadra' | 'sobra' | 'falta';

/** Clasifica un descuadre (null → 'cuadra') para colorear el arqueo. */
export function severidadDescuadre(descuadre: number | null): SeveridadDescuadre {
  if (descuadre == null || Math.abs(descuadre) < TOLERANCIA_EUR) return 'cuadra';
  return descuadre > 0 ? 'sobra' : 'falta';
}
