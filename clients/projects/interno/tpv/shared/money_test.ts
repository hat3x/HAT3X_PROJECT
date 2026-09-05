// ============================================================================
// TPV · Tests del núcleo de cálculo (Deno std/assert)
// ----------------------------------------------------------------------------
// Ejecutar:  deno test tpv/shared/money_test.ts
// Verifica IVA por línea, descuentos (importe y %), agregación de cabecera,
// desglose de IVA y saldo de pagos (incl. mixto, parcial y sobrepago).
// ============================================================================

import { assertEquals } from 'jsr:@std/assert@1';
import {
  calcularCambio,
  calcularLinea,
  calcularSaldo,
  calcularTicket,
  redondear2,
} from './money.ts';

Deno.test('redondear2: medio hacia arriba y estable en flotante', () => {
  assertEquals(redondear2(0.1 + 0.2), 0.3);
  assertEquals(redondear2(1.005), 1.01);
  assertEquals(redondear2(-1.005), -1.01);
  assertEquals(redondear2(2.675), 2.68);
});

Deno.test('calcularLinea: IVA 21% sobre base sin descuento', () => {
  const l = calcularLinea({ cantidad: 2, precio_unitario: 10, tipo_impuesto: 21 });
  assertEquals(l.base_bruta, 20);
  assertEquals(l.descuento, 0);
  assertEquals(l.base_neta, 20);
  assertEquals(l.importe_impuesto, 4.2);
  assertEquals(l.total_linea, 24.2);
});

Deno.test('calcularLinea: descuento por importe reduce la base imponible', () => {
  const l = calcularLinea({
    cantidad: 1,
    precio_unitario: 100,
    descuento: 20,
    tipo_impuesto: 10,
  });
  assertEquals(l.base_neta, 80);
  assertEquals(l.importe_impuesto, 8);
  assertEquals(l.total_linea, 88);
});

Deno.test('calcularLinea: descuento porcentual tiene prioridad y se acota', () => {
  const l = calcularLinea({
    cantidad: 1,
    precio_unitario: 50,
    descuento_pct: 10,
    tipo_impuesto: 21,
  });
  assertEquals(l.descuento, 5);
  assertEquals(l.base_neta, 45);
  assertEquals(l.importe_impuesto, 9.45);

  // El descuento nunca supera la base bruta (queda acotado).
  const acotada = calcularLinea({ cantidad: 1, precio_unitario: 30, descuento: 999 });
  assertEquals(acotada.base_neta, 0);
  assertEquals(acotada.total_linea, 0);
});

Deno.test('calcularTicket: totales y desglose de IVA por tipos mezclados', () => {
  const { totales } = calcularTicket([
    { cantidad: 1, precio_unitario: 100, tipo_impuesto: 21 }, // base 100, IVA 21
    { cantidad: 2, precio_unitario: 10, tipo_impuesto: 10 }, // base 20, IVA 2
    { cantidad: 1, precio_unitario: 50, descuento: 10, tipo_impuesto: 21 }, // base 40, IVA 8.4
  ]);

  assertEquals(totales.subtotal, 160); // 100 + 20 + 40
  assertEquals(totales.descuento_total, 10);
  assertEquals(totales.impuestos_total, 31.4); // 21 + 2 + 8.4
  assertEquals(totales.total, 191.4);

  assertEquals(totales.desglose_iva, [
    { tipo_impuesto: 10, base: 20, cuota: 2 },
    { tipo_impuesto: 21, base: 140, cuota: 29.4 },
  ]);
});

Deno.test('calcularSaldo: pago mixto que cubre exactamente el total', () => {
  const s = calcularSaldo(191.4, [{ importe: 100 }, { importe: 91.4 }]);
  assertEquals(s.pagado, 191.4);
  assertEquals(s.pendiente, 0);
  assertEquals(s.cubierto, true);
  assertEquals(s.sobrepago, 0);
});

Deno.test('calcularSaldo: pago parcial deja pendiente y no cubierto', () => {
  const s = calcularSaldo(100, [{ importe: 40 }]);
  assertEquals(s.pendiente, 60);
  assertEquals(s.cubierto, false);
});

Deno.test('calcularSaldo: sobrepago se refleja con signo positivo', () => {
  const s = calcularSaldo(50, [{ importe: 60 }]);
  assertEquals(s.pendiente, -10);
  assertEquals(s.sobrepago, 10);
  assertEquals(s.cubierto, false);
});

Deno.test('calcularCambio: efectivo entregado por encima del total', () => {
  assertEquals(calcularCambio(24.2, 30), 5.8);
  assertEquals(calcularCambio(24.2, 24.2), 0);
  assertEquals(calcularCambio(24.2, 20), 0);
});
