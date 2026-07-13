// ============================================================================
// TPV · E2E (nivel dominio) — flujo cobro → pago → factura
// ----------------------------------------------------------------------------
// Ejecutar (desde tpv/tests):  deno test e2e_cobro_pago_factura_test.ts
//
// Recorre el ciclo de vida completo de un ticket encadenando la LÓGICA DE
// DOMINIO REAL sobre el doble en memoria, tal como lo haría la secuencia de
// Edge Functions crear-ticket → actualizar-lineas → registrar-pago →
// emitir-factura:
//
//   1. Se abre un ticket y se le ponen líneas (reemplazarLineas → cabecera
//      autoritativa).
//   2. Se cobra en PAGO MIXTO (efectivo + tarjeta) aplicando la MISMA regla de
//      saldo del handler tpv-registrar-pago (sobrepago/insuficiente por
//      tolerancia) y marcando la venta 'pagada' al quedar cubierta.
//   3. Se emite la factura desde el ticket ya pagado y se comprueba que sus
//      importes derivan de las líneas y cuadran con lo cobrado.
//
// Es un test de INTEGRACIÓN de extremo a extremo del lado servidor (sin HTTP ni
// navegador): valida que las piezas encajan y que los invariantes se mantienen
// a lo largo del flujo. El e2e de UI/navegador queda fuera (no hay app servida).
// ============================================================================

import { assertEquals } from 'jsr:@std/assert@1';
import { cargarTicket, reemplazarLineas } from '../functions/_shared/ticket.ts';
import { emitirFactura } from '../functions/_shared/factura.ts';
import { redondear2, TOLERANCIA_EUR } from '../shared/money.ts';
import { ErrorTpv } from '../shared/errors.ts';
import type { LineaInput } from '../shared/schemas.ts';
import type { Venta } from '../shared/types.ts';
import { FakeSupabase } from './fakeSupabase.ts';

const SALON = 'salon-A';

function linea(
  p: Partial<LineaInput> & { descripcion: string; cantidad: number; precio_unitario: number },
): LineaInput {
  return { tipo: 'servicio', descuento: 0, tipo_impuesto: 21, ...p } as LineaInput;
}

/** Escenario base: fake con un ticket abierto vacío y dos métodos de pago. */
function escenario(): { sb: FakeSupabase; venta: Venta } {
  const sb = new FakeSupabase();
  const venta = {
    id: 'venta-1',
    salon_id: SALON,
    sesion_caja_id: 'sesion-1',
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
  sb.sembrar('tpv_metodos_pago', [
    { id: 'm-efectivo', salon_id: SALON, codigo: 'efectivo', nombre: 'Efectivo', activo: true, orden: 0 },
    { id: 'm-tarjeta', salon_id: SALON, codigo: 'tarjeta', nombre: 'Tarjeta', activo: true, orden: 1 },
  ]);
  return { sb, venta };
}

/**
 * Aplica pagos reproduciendo la regla del handler tpv-registrar-pago: valida
 * sobrepago / pago insuficiente contra el saldo autoritativo, inserta los pagos
 * y marca 'pagada' la venta si queda cubierta. Devuelve el ticket recargado.
 */
async function registrarPago(
  sb: FakeSupabase,
  ventaId: string,
  pagos: { metodo_pago_id: string; importe: number }[],
  opts: { permitirParcial?: boolean } = {},
) {
  const ticket = await cargarTicket(sb, ventaId);
  const nuevos = redondear2(pagos.reduce((a, p) => a + p.importe, 0));
  const pagadoFinal = redondear2(ticket.saldo.pagado + nuevos);
  const pendienteFinal = redondear2(ticket.venta.total - pagadoFinal);

  if (pendienteFinal < -TOLERANCIA_EUR) {
    throw new ErrorTpv('SOBREPAGO', 'El cobro supera el total');
  }
  const cubierto = Math.abs(pendienteFinal) < TOLERANCIA_EUR;
  if (!opts.permitirParcial && !cubierto) {
    throw new ErrorTpv('PAGO_INSUFICIENTE', 'Falta para cubrir el total');
  }

  await sb.from('tpv_pagos').insert(
    pagos.map((p) => ({
      venta_id: ventaId,
      salon_id: ticket.venta.salon_id,
      metodo_pago_id: p.metodo_pago_id,
      sesion_caja_id: ticket.venta.sesion_caja_id,
      importe: p.importe,
      estado: 'completado',
    })),
  );
  if (cubierto) {
    await sb.from('tpv_ventas').update({ estado: 'pagada' }).eq('id', ventaId).select('id').single();
  }
  return cargarTicket(sb, ventaId);
}

// ----------------------------------------------------------------------------
// Flujo feliz completo
// ----------------------------------------------------------------------------

Deno.test('e2e: ticket → líneas → pago mixto → factura, todo coherente', async () => {
  const { sb, venta } = escenario();

  // 1. Líneas: servicio 2×10 @21% (24.20) + producto 1×100 dto 20 @10% (88.00).
  let ticket = await reemplazarLineas(sb, venta, [
    linea({ descripcion: 'Corte', cantidad: 2, precio_unitario: 10, tipo_impuesto: 21 }),
    linea({ descripcion: 'Champú', cantidad: 1, precio_unitario: 100, descuento: 20, tipo_impuesto: 10 }),
  ]);
  assertEquals(ticket.venta.total, 112.2); // 24.20 + 88.00
  assertEquals(ticket.saldo.cubierto, false);

  // 2. Pago mixto: 50 en efectivo + 62.20 en tarjeta = 112.20 (cubre justo).
  ticket = await registrarPago(sb, venta.id, [
    { metodo_pago_id: 'm-efectivo', importe: 50 },
    { metodo_pago_id: 'm-tarjeta', importe: 62.2 },
  ]);
  assertEquals(ticket.venta.estado, 'pagada');
  assertEquals(ticket.saldo.pagado, 112.2);
  assertEquals(ticket.saldo.cubierto, true);
  assertEquals(ticket.pagos.length, 2);

  // 3. Factura desde el ticket pagado: importes derivados de las líneas.
  const { factura, referencia } = await emitirFactura(sb, { venta_id: venta.id });
  assertEquals(referencia, 'A/000001');
  assertEquals(factura.total, ticket.venta.total); // factura cuadra con el ticket
  assertEquals(factura.base_imponible, 100); // 20 + 80
  assertEquals(factura.impuestos, 12.2); // 4.2 + 8
  assertEquals(factura.lineas_snapshot.length, 2);
  assertEquals(factura.desglose_iva, [
    { tipo_impuesto: 10, base: 80, cuota: 8 },
    { tipo_impuesto: 21, base: 20, cuota: 4.2 },
  ]);
});

// ----------------------------------------------------------------------------
// Variantes del cobro
// ----------------------------------------------------------------------------

Deno.test('e2e: sobrepago en efectivo con línea de cambio (negativo) queda cubierto', async () => {
  const { sb, venta } = escenario();
  await reemplazarLineas(sb, venta, [
    linea({ descripcion: 'Servicio', cantidad: 1, precio_unitario: 20, tipo_impuesto: 21 }), // total 24.20
  ]);
  // El cliente entrega 30 y se le devuelven 5.80 (importe negativo).
  const ticket = await registrarPago(sb, venta.id, [
    { metodo_pago_id: 'm-efectivo', importe: 30 },
    { metodo_pago_id: 'm-efectivo', importe: -5.8 },
  ]);
  assertEquals(ticket.saldo.pagado, 24.2);
  assertEquals(ticket.venta.estado, 'pagada');
});

Deno.test('e2e: un cobro que supera el total se rechaza (SOBREPAGO)', async () => {
  const { sb, venta } = escenario();
  await reemplazarLineas(sb, venta, [
    linea({ descripcion: 'Servicio', cantidad: 1, precio_unitario: 20, tipo_impuesto: 21 }), // 24.20
  ]);
  let codigo = '';
  try {
    await registrarPago(sb, venta.id, [{ metodo_pago_id: 'm-efectivo', importe: 30 }]);
  } catch (e) {
    codigo = (e as ErrorTpv).codigo;
  }
  assertEquals(codigo, 'SOBREPAGO');
  // No se insertó ningún pago ni se marcó pagada.
  assertEquals(sb.snapshot('tpv_pagos').length, 0);
  assertEquals(sb.snapshot('tpv_ventas')[0].estado, 'abierta');
});

Deno.test('e2e: cobro parcial permitido deja el ticket abierto; la factura sale de las líneas', async () => {
  const { sb, venta } = escenario();
  await reemplazarLineas(sb, venta, [
    linea({ descripcion: 'Servicio', cantidad: 1, precio_unitario: 100, tipo_impuesto: 21 }), // 121.00
  ]);
  const ticket = await registrarPago(
    sb,
    venta.id,
    [{ metodo_pago_id: 'm-tarjeta', importe: 50 }],
    { permitirParcial: true },
  );
  assertEquals(ticket.saldo.pagado, 50);
  assertEquals(ticket.saldo.pendiente, 71);
  assertEquals(ticket.saldo.cubierto, false);
  assertEquals(ticket.venta.estado, 'abierta'); // sigue abierto

  // Aun así se puede facturar: los importes salen de las líneas, con
  // independencia del estado del cobro.
  const { factura } = await emitirFactura(sb, { venta_id: venta.id });
  assertEquals(factura.total, 121);
});
