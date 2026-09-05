// ============================================================================
// TPV · Integración — API de cobros (agregado "ticket")
// ----------------------------------------------------------------------------
// Ejecutar (desde tpv/tests):  deno test integracion_cobros_test.ts
//
// Ejercita la LÓGICA DE DOMINIO REAL de functions/_shared/ticket.ts contra el
// doble en memoria (FakeSupabase), sin red ni base de datos. Verifica el
// contrato del servidor autoritativo de cobros:
//   · cargarVenta / cargarTicket: 404 y agregado (cabecera+líneas+pagos+saldo).
//   · reemplazarLineas: recalcula subtotal/IVA/total desde las líneas y persiste
//     una cabecera SIEMPRE coherente (aunque el cliente no envíe importes).
//   · exigirTicketAbierto: bloquea modificar un ticket ya pagado/anulado.
//   · saldo: sólo cuentan los pagos 'completado'; parcial vs cubierto.
//
// El aislamiento por salón (RLS) NO se prueba aquí sino en db/tests/*.sql: el
// fake es deliberadamente permisivo para poder probar el CÁLCULO y el FLUJO.
// ============================================================================

import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  cargarTicket,
  cargarVenta,
  exigirTicketAbierto,
  reemplazarLineas,
} from '../functions/_shared/ticket.ts';
import { ErrorTpv } from '../shared/errors.ts';
import type { LineaInput } from '../shared/schemas.ts';
import type { Venta } from '../shared/types.ts';
import { FakeSupabase } from './fakeSupabase.ts';

const SALON = 'salon-A';

/** Fábrica de línea de entrada (forma ya validada por Zod). */
function linea(
  p: Partial<LineaInput> & { descripcion: string; cantidad: number; precio_unitario: number },
): LineaInput {
  return {
    tipo: 'servicio',
    descuento: 0,
    tipo_impuesto: 21,
    ...p,
  } as LineaInput;
}

/** Siembra un ticket abierto vacío y devuelve el fake + la venta. */
function conTicketAbierto(): { sb: FakeSupabase; venta: Venta } {
  const sb = new FakeSupabase();
  const venta = {
    id: 'venta-1',
    salon_id: SALON,
    sesion_caja_id: null,
    reserva_id: null,
    cliente_id: null,
    empleado_id: null,
    numero_ticket: 1,
    estado: 'abierta',
    subtotal: 0,
    descuento_total: 0,
    impuestos_total: 0,
    total: 0,
    notas: null,
    anulada_at: null,
    created_at: '2026-07-13T08:00:00.000Z',
    updated_at: '2026-07-13T08:00:00.000Z',
  } as Venta;
  sb.sembrar('tpv_ventas', [venta]);
  return { sb, venta };
}

// ----------------------------------------------------------------------------
// Carga
// ----------------------------------------------------------------------------

Deno.test('cargarVenta: 404 tipado si el ticket no existe', async () => {
  const sb = new FakeSupabase();
  const e = await assertRejects(() => cargarVenta(sb, 'inexistente'), ErrorTpv);
  assertEquals(e.codigo, 'NO_ENCONTRADO');
});

Deno.test('cargarTicket: agrega cabecera + líneas + pagos + saldo', async () => {
  const { sb } = conTicketAbierto();
  sb.sembrar('tpv_lineas_ticket', [
    {
      id: 'l1',
      venta_id: 'venta-1',
      salon_id: SALON,
      descripcion: 'Corte',
      cantidad: 1,
      precio_unitario: 20,
      descuento: 0,
      tipo_impuesto: 21,
      importe_impuesto: 4.2,
      total_linea: 24.2,
      orden: 0,
    },
  ]);
  // Marcamos el total de la cabecera para comprobar el saldo.
  sb.tabla('tpv_ventas')[0].total = 24.2;
  sb.sembrar('tpv_pagos', [
    { id: 'p1', venta_id: 'venta-1', salon_id: SALON, metodo_pago_id: 'm1', importe: 10, estado: 'completado' },
    { id: 'p2', venta_id: 'venta-1', salon_id: SALON, metodo_pago_id: 'm1', importe: 5, estado: 'pendiente' },
  ]);

  const t = await cargarTicket(sb, 'venta-1');
  assertEquals(t.lineas.length, 1);
  assertEquals(t.pagos.length, 2);
  // Sólo el pago 'completado' (10) cuenta para el saldo.
  assertEquals(t.saldo.pagado, 10);
  assertEquals(t.saldo.pendiente, 14.2);
  assertEquals(t.saldo.cubierto, false);
});

// ----------------------------------------------------------------------------
// Recálculo autoritativo de la cabecera
// ----------------------------------------------------------------------------

Deno.test('reemplazarLineas: recalcula y persiste subtotal/IVA/total desde las líneas', async () => {
  const { sb, venta } = conTicketAbierto();
  const t = await reemplazarLineas(sb, venta, [
    linea({ descripcion: 'Corte', cantidad: 2, precio_unitario: 10, tipo_impuesto: 21 }), // base 20, IVA 4.2
    linea({ descripcion: 'Producto', cantidad: 1, precio_unitario: 100, descuento: 20, tipo_impuesto: 10 }), // base 80, IVA 8
  ]);

  // La cabecera devuelta y la persistida coinciden y son coherentes.
  assertEquals(t.venta.subtotal, 100);
  assertEquals(t.venta.descuento_total, 20);
  assertEquals(t.venta.impuestos_total, 12.2);
  assertEquals(t.venta.total, 112.2);

  const persistida = sb.snapshot('tpv_ventas')[0];
  assertEquals(persistida.total, 112.2);
  assertEquals(persistida.impuestos_total, 12.2);

  // Las líneas quedan con sus importes derivados por el servidor.
  const lineas = sb.snapshot('tpv_lineas_ticket');
  assertEquals(lineas.length, 2);
  const prod = lineas.find((l) => l.descripcion === 'Producto')!;
  assertEquals(prod.descuento, 20);
  assertEquals(prod.importe_impuesto, 8);
  assertEquals(prod.total_linea, 88);
});

Deno.test('reemplazarLineas: es declarativo — reemplaza TODAS las líneas previas', async () => {
  const { sb, venta } = conTicketAbierto();
  sb.sembrar('tpv_lineas_ticket', [
    {
      id: 'vieja',
      venta_id: 'venta-1',
      salon_id: SALON,
      descripcion: 'Vieja',
      cantidad: 1,
      precio_unitario: 5,
      descuento: 0,
      tipo_impuesto: 21,
      importe_impuesto: 1.05,
      total_linea: 6.05,
      orden: 0,
    },
  ]);
  await reemplazarLineas(sb, venta, [
    linea({ descripcion: 'Nueva', cantidad: 1, precio_unitario: 50, tipo_impuesto: 21 }),
  ]);
  const lineas = sb.snapshot('tpv_lineas_ticket');
  assertEquals(lineas.length, 1);
  assertEquals(lineas[0].descripcion, 'Nueva');
});

Deno.test('reemplazarLineas: conjunto vacío deja la cabecera en 0', async () => {
  const { sb, venta } = conTicketAbierto();
  const t = await reemplazarLineas(sb, venta, []);
  assertEquals(t.venta.total, 0);
  assertEquals(t.venta.subtotal, 0);
  assertEquals(sb.snapshot('tpv_lineas_ticket').length, 0);
});

// ----------------------------------------------------------------------------
// Guardas de estado
// ----------------------------------------------------------------------------

Deno.test('exigirTicketAbierto: lanza TICKET_NO_ABIERTO si ya está pagada', () => {
  const venta = { estado: 'pagada', numero_ticket: 7 } as Venta;
  try {
    exigirTicketAbierto(venta);
    throw new Error('debería haber lanzado');
  } catch (e) {
    assertEquals((e as ErrorTpv).codigo, 'TICKET_NO_ABIERTO');
  }
});

Deno.test('reemplazarLineas: rechaza modificar un ticket no abierto', async () => {
  const { sb, venta } = conTicketAbierto();
  sb.tabla('tpv_ventas')[0].estado = 'pagada';
  const vpagada = { ...venta, estado: 'pagada' } as Venta;
  const e = await assertRejects(
    () =>
      reemplazarLineas(sb, vpagada, [
        linea({ descripcion: 'X', cantidad: 1, precio_unitario: 1 }),
      ]),
    ErrorTpv,
  );
  assertEquals(e.codigo, 'TICKET_NO_ABIERTO');
});
