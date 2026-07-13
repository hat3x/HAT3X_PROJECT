// ============================================================================
// TPV · E2E (nivel dominio) — caja: apertura → arqueo → cierre
// ----------------------------------------------------------------------------
// Ejecutar (desde tpv/tests):  deno test e2e_apertura_arqueo_cierre_test.ts
//
// Recorre la vida de una sesión de caja encadenando la LÓGICA DE DOMINIO REAL
// de functions/_shared/caja.ts sobre el doble en memoria, como haría la
// secuencia tpv-abrir-caja → tpv-movimiento-caja → (cobros) → tpv-cerrar-caja:
//
//   1. Apertura con fondo inicial.
//   2. Movimientos manuales (entrada/salida) y cobros de la sesión (efectivo y
//      tarjeta): el efectivo TEÓRICO lo deriva el servidor, no el cliente.
//   3. Con la sesión abierta el arqueo muestra el teórico y deja el descuadre en
//      null (aún sin contar).
//   4. Cierre: se fija el efectivo REAL contado y el servidor calcula el
//      descuadre y el resumen por método.
//
// Invariante clave verificada: sólo los cobros en EFECTIVO tocan el cajón; la
// tarjeta entra en el total y en "otros" pero NO en el teórico de efectivo.
// ============================================================================

import { assertEquals } from 'jsr:@std/assert@1';
import { cargarCaja, cargarSesion, exigirSesionAbierta } from '../functions/_shared/caja.ts';
import { ErrorTpv } from '../shared/errors.ts';
import type { SesionCaja } from '../shared/types.ts';
import { FakeSupabase } from './fakeSupabase.ts';

const SALON = 'salon-A';
const SESION = 'sesion-1';

/** Abre una sesión de caja (fondo 100) con dos métodos de pago. */
function abrir(saldoInicial = 100): FakeSupabase {
  const sb = new FakeSupabase();
  sb.sembrar('tpv_sesiones_caja', [
    {
      id: SESION,
      salon_id: SALON,
      saldo_inicial: saldoInicial,
      saldo_final_real: null,
      estado: 'abierta',
      apertura_at: '2026-07-13T08:00:00.000Z',
    },
  ]);
  sb.sembrar('tpv_metodos_pago', [
    { id: 'm-efectivo', salon_id: SALON, codigo: 'efectivo', nombre: 'Efectivo' },
    { id: 'm-tarjeta', salon_id: SALON, codigo: 'tarjeta', nombre: 'Tarjeta' },
  ]);
  return sb;
}

/** Registra un movimiento manual de efectivo en la sesión. */
function movimiento(sb: FakeSupabase, tipo: 'entrada' | 'salida', importe: number, motivo: string) {
  sb.sembrar('tpv_movimientos_caja', [
    { sesion_caja_id: SESION, salon_id: SALON, tipo, importe, motivo, created_at: sb.ahora() },
  ]);
}

/** Registra un cobro completado dentro de la sesión. */
function cobro(sb: FakeSupabase, metodo_pago_id: string, importe: number, venta_id: string) {
  sb.sembrar('tpv_pagos', [
    {
      venta_id,
      salon_id: SALON,
      metodo_pago_id,
      sesion_caja_id: SESION,
      importe,
      estado: 'completado',
      pagado_at: sb.ahora(),
    },
  ]);
}

// ----------------------------------------------------------------------------
// Flujo completo
// ----------------------------------------------------------------------------

Deno.test('e2e caja: apertura → movimientos+cobros → arqueo abierto → cierre con descuadre', async () => {
  const sb = abrir(100);

  // 2. Movimientos y cobros de la sesión.
  movimiento(sb, 'entrada', 20, 'Aporte de cambio');
  movimiento(sb, 'salida', 10, 'Compra de material');
  cobro(sb, 'm-efectivo', 60, 'venta-1');
  cobro(sb, 'm-tarjeta', 40, 'venta-2');

  // 3. Arqueo con la sesión ABIERTA: teórico calculado, descuadre pendiente.
  let sesion = await cargarSesion(sb, SESION);
  let caja = await cargarCaja(sb, sesion);

  assertEquals(caja.arqueo.saldo_inicial, 100);
  assertEquals(caja.arqueo.cobros_efectivo, 60); // la tarjeta NO cuenta
  assertEquals(caja.arqueo.entradas, 20);
  assertEquals(caja.arqueo.salidas, 10);
  assertEquals(caja.arqueo.movimientos_neto, 10);
  assertEquals(caja.arqueo.efectivo_teorico, 170); // 100 + 60 + (20 − 10)
  assertEquals(caja.arqueo.efectivo_real, null);
  assertEquals(caja.arqueo.descuadre, null); // aún sin contar
  assertEquals(caja.arqueo.cuadra, false);

  // Resumen de cobros por método (efectivo primero: mayor total).
  assertEquals(caja.resumen.total, 100);
  assertEquals(caja.resumen.efectivo, 60);
  assertEquals(caja.resumen.otros, 40);
  assertEquals(caja.resumen.numero_cobros, 2);
  assertEquals(caja.resumen.numero_tickets, 2);
  assertEquals(caja.resumen.por_metodo.map((m) => m.codigo), ['efectivo', 'tarjeta']);

  // 4. Cierre: el cajero cuenta 168 € (faltan 2 €). El servidor fija el real.
  await sb.from('tpv_sesiones_caja')
    .update({ estado: 'cerrada', saldo_final_real: 168 })
    .eq('id', SESION)
    .select('id')
    .single();

  sesion = await cargarSesion(sb, SESION);
  caja = await cargarCaja(sb, sesion);
  assertEquals(caja.sesion.estado, 'cerrada');
  assertEquals(caja.arqueo.efectivo_real, 168);
  assertEquals(caja.arqueo.efectivo_teorico, 170);
  assertEquals(caja.arqueo.descuadre, -2); // faltan 2 €
  assertEquals(caja.arqueo.cuadra, false);
});

Deno.test('e2e caja: cierre que cuadra exactamente (descuadre 0)', async () => {
  const sb = abrir(50);
  cobro(sb, 'm-efectivo', 30, 'venta-1');
  await sb.from('tpv_sesiones_caja')
    .update({ estado: 'cerrada', saldo_final_real: 80 })
    .eq('id', SESION)
    .select('id')
    .single();

  const sesion = await cargarSesion(sb, SESION);
  const caja = await cargarCaja(sb, sesion);
  assertEquals(caja.arqueo.efectivo_teorico, 80); // 50 + 30
  assertEquals(caja.arqueo.descuadre, 0);
  assertEquals(caja.arqueo.cuadra, true);
});

Deno.test('e2e caja: sólo el efectivo mueve el cajón (sesión sólo con tarjeta)', async () => {
  const sb = abrir(100);
  cobro(sb, 'm-tarjeta', 200, 'venta-1');

  const sesion = await cargarSesion(sb, SESION);
  const caja = await cargarCaja(sb, sesion);
  assertEquals(caja.arqueo.cobros_efectivo, 0);
  assertEquals(caja.arqueo.efectivo_teorico, 100); // el fondo, intacto
  assertEquals(caja.resumen.total, 200);
  assertEquals(caja.resumen.efectivo, 0);
  assertEquals(caja.resumen.otros, 200);
});

// ----------------------------------------------------------------------------
// Guardas y carga
// ----------------------------------------------------------------------------

Deno.test('exigirSesionAbierta: lanza CAJA_NO_ABIERTA sobre una sesión cerrada', () => {
  const sesion = { id: SESION, estado: 'cerrada' } as SesionCaja;
  try {
    exigirSesionAbierta(sesion);
    throw new Error('debería haber lanzado');
  } catch (e) {
    assertEquals((e as ErrorTpv).codigo, 'CAJA_NO_ABIERTA');
  }
});

Deno.test('cargarSesion: 404 tipado si la sesión no existe', async () => {
  const sb = new FakeSupabase();
  let codigo = '';
  try {
    await cargarSesion(sb, 'inexistente');
  } catch (e) {
    codigo = (e as ErrorTpv).codigo;
  }
  assertEquals(codigo, 'NO_ENCONTRADO');
});
