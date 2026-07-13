// ============================================================================
// TPV · Unitarias — casos límite de totales, IVA y descuentos
// ----------------------------------------------------------------------------
// Ejecutar (desde tpv/tests):  deno test unit_totales_iva_descuentos_test.ts
//
// Complementa a shared/money_test.ts profundizando en los BORDES del cálculo
// monetario, que es código financiero crítico (objetivo de cobertura 100%):
//   · Todos los tipos de IVA españoles (21/10/4/0) y redondeo por línea.
//   · Descuento por importe vs porcentual, prioridad, y acotado a [0, base].
//   · Cantidades fraccionarias, precio 0, ticket vacío.
//   · Agregación de cabecera con múltiples tramos y el céntimo del redondeo.
//   · Saldo y cambio en los límites de la tolerancia.
// ============================================================================

import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  calcularCambio,
  calcularLinea,
  calcularSaldo,
  calcularTicket,
  calcularTotales,
  importesIguales,
  redondear2,
  TOLERANCIA_EUR,
} from '../shared/money.ts';

// ----------------------------------------------------------------------------
// Redondeo — el ladrillo de todo el cálculo
// ----------------------------------------------------------------------------

Deno.test('redondear2: no finito → 0 (defensivo ante NaN/Infinity)', () => {
  assertEquals(redondear2(NaN), 0);
  assertEquals(redondear2(Infinity), 0);
  assertEquals(redondear2(-Infinity), 0);
});

Deno.test('redondear2: medio hacia arriba simétrico en negativos', () => {
  assertEquals(redondear2(2.345), 2.35);
  assertEquals(redondear2(-2.345), -2.35);
  assertEquals(redondear2(0.005), 0.01);
  assertEquals(redondear2(-0.005), -0.01);
});

Deno.test('importesIguales: usa la tolerancia de medio céntimo', () => {
  assert(importesIguales(10.004, 10));
  assert(!importesIguales(10.006, 10));
  assertEquals(TOLERANCIA_EUR, 0.005);
});

// ----------------------------------------------------------------------------
// IVA por tipo — 21 / 10 / 4 / 0
// ----------------------------------------------------------------------------

Deno.test('calcularLinea: IVA reducido 10% y superreducido 4%', () => {
  const reducido = calcularLinea({ cantidad: 1, precio_unitario: 100, tipo_impuesto: 10 });
  assertEquals(reducido.importe_impuesto, 10);
  assertEquals(reducido.total_linea, 110);

  const superreducido = calcularLinea({ cantidad: 1, precio_unitario: 100, tipo_impuesto: 4 });
  assertEquals(superreducido.importe_impuesto, 4);
  assertEquals(superreducido.total_linea, 104);
});

Deno.test('calcularLinea: IVA 0% (exento) no añade cuota', () => {
  const l = calcularLinea({ cantidad: 3, precio_unitario: 7, tipo_impuesto: 0 });
  assertEquals(l.base_neta, 21);
  assertEquals(l.importe_impuesto, 0);
  assertEquals(l.total_linea, 21);
});

Deno.test('calcularLinea: tipo_impuesto por defecto es 21%', () => {
  const l = calcularLinea({ cantidad: 1, precio_unitario: 10 });
  assertEquals(l.tipo_impuesto, 21);
  assertEquals(l.importe_impuesto, 2.1);
});

Deno.test('calcularLinea: el IVA se redondea POR LÍNEA a 2 decimales', () => {
  // 3 × 3.33 = 9.99 base; 21% = 2.0979 → 2.10 redondeado por línea.
  const l = calcularLinea({ cantidad: 3, precio_unitario: 3.33, tipo_impuesto: 21 });
  assertEquals(l.base_neta, 9.99);
  assertEquals(l.importe_impuesto, 2.1);
  assertEquals(l.total_linea, 12.09);
});

// ----------------------------------------------------------------------------
// Cantidades y precios límite
// ----------------------------------------------------------------------------

Deno.test('calcularLinea: cantidad fraccionaria (p.ej. 0.5 productos a granel)', () => {
  const l = calcularLinea({ cantidad: 0.5, precio_unitario: 9, tipo_impuesto: 21 });
  assertEquals(l.base_bruta, 4.5);
  assertEquals(l.importe_impuesto, 0.95); // 4.5 × 0.21 = 0.945 → 0.95
  assertEquals(l.total_linea, 5.45);
});

Deno.test('calcularLinea: precio 0 → todo a cero, sin NaN', () => {
  const l = calcularLinea({ cantidad: 4, precio_unitario: 0, descuento_pct: 50 });
  assertEquals(l.base_bruta, 0);
  assertEquals(l.descuento, 0);
  assertEquals(l.total_linea, 0);
});

Deno.test('calcularLinea: entradas no numéricas se tratan como 0 (defensivo)', () => {
  const l = calcularLinea({
    cantidad: Number('x'),
    precio_unitario: Number('y'),
    tipo_impuesto: 21,
  });
  assertEquals(l.base_bruta, 0);
  assertEquals(l.total_linea, 0);
});

// ----------------------------------------------------------------------------
// Descuentos — importe vs porcentaje, prioridad y acotado
// ----------------------------------------------------------------------------

Deno.test('calcularLinea: descuento_pct 100% deja base y total en 0', () => {
  const l = calcularLinea({ cantidad: 2, precio_unitario: 25, descuento_pct: 100 });
  assertEquals(l.descuento, 50);
  assertEquals(l.base_neta, 0);
  assertEquals(l.importe_impuesto, 0);
  assertEquals(l.total_linea, 0);
});

Deno.test('calcularLinea: descuento por importe exacto = base bruta', () => {
  const l = calcularLinea({ cantidad: 1, precio_unitario: 40, descuento: 40, tipo_impuesto: 21 });
  assertEquals(l.base_neta, 0);
  assertEquals(l.total_linea, 0);
});

Deno.test('calcularLinea: descuento negativo se acota a 0 (no incrementa la base)', () => {
  const l = calcularLinea({ cantidad: 1, precio_unitario: 30, descuento: -10, tipo_impuesto: 21 });
  assertEquals(l.descuento, 0);
  assertEquals(l.base_neta, 30);
});

Deno.test('calcularLinea: pct tiene prioridad aunque venga también descuento', () => {
  // money.ts: si descuento_pct != null, manda sobre el importe fijo.
  const l = calcularLinea({
    cantidad: 1,
    precio_unitario: 200,
    descuento: 999, // ignorado
    descuento_pct: 25,
    tipo_impuesto: 21,
  });
  assertEquals(l.descuento, 50); // 25% de 200
  assertEquals(l.base_neta, 150);
});

// ----------------------------------------------------------------------------
// Agregación de cabecera
// ----------------------------------------------------------------------------

Deno.test('calcularTotales: ticket vacío → todo a 0 y desglose vacío', () => {
  const t = calcularTotales([]);
  assertEquals(t.subtotal, 0);
  assertEquals(t.descuento_total, 0);
  assertEquals(t.impuestos_total, 0);
  assertEquals(t.total, 0);
  assertEquals(t.desglose_iva, []);
});

Deno.test('calcularTicket: desglose ordenado ascendente por tipo con 3 tramos', () => {
  const { totales } = calcularTicket([
    { cantidad: 1, precio_unitario: 100, tipo_impuesto: 21 },
    { cantidad: 1, precio_unitario: 100, tipo_impuesto: 4 },
    { cantidad: 1, precio_unitario: 100, tipo_impuesto: 10 },
    { cantidad: 1, precio_unitario: 100, tipo_impuesto: 21 },
  ]);
  assertEquals(totales.desglose_iva.map((t) => t.tipo_impuesto), [4, 10, 21]);
  const tramo21 = totales.desglose_iva.find((t) => t.tipo_impuesto === 21)!;
  assertEquals(tramo21.base, 200);
  assertEquals(tramo21.cuota, 42);
  assertEquals(totales.subtotal, 400);
  assertEquals(totales.impuestos_total, 63); // 42 + 4 + 10
  assertEquals(totales.total, 463);
});

Deno.test('calcularTicket: descuento_total agrega los descuentos de todas las líneas', () => {
  const { totales } = calcularTicket([
    { cantidad: 1, precio_unitario: 100, descuento: 10, tipo_impuesto: 21 },
    { cantidad: 1, precio_unitario: 50, descuento_pct: 20, tipo_impuesto: 10 }, // dto 10
  ]);
  assertEquals(totales.descuento_total, 20);
  assertEquals(totales.subtotal, 130); // 90 + 40
});

Deno.test('calcularTicket: total = subtotal + impuestos con redondeo de cabecera coherente', () => {
  const { totales } = calcularTicket([
    { cantidad: 3, precio_unitario: 3.33, tipo_impuesto: 21 }, // base 9.99, IVA 2.10
    { cantidad: 7, precio_unitario: 1.11, tipo_impuesto: 21 }, // base 7.77, IVA 1.63
  ]);
  assertEquals(totales.subtotal, 17.76);
  assertEquals(totales.impuestos_total, 3.73); // 2.10 + 1.63
  assertEquals(totales.total, 21.49);
});

// ----------------------------------------------------------------------------
// Saldo y cambio — límites de tolerancia
// ----------------------------------------------------------------------------

Deno.test('calcularSaldo: sin pagos → todo pendiente, no cubierto', () => {
  const s = calcularSaldo(50, []);
  assertEquals(s.pagado, 0);
  assertEquals(s.pendiente, 50);
  assertEquals(s.cubierto, false);
  assertEquals(s.sobrepago, 0);
});

Deno.test('calcularSaldo: cubierto dentro de la tolerancia (medio céntimo)', () => {
  const s = calcularSaldo(100, [{ importe: 99.996 }]);
  assertEquals(s.cubierto, true); // |pendiente| < 0.005
});

Deno.test('calcularSaldo: devolución (importe negativo) reduce lo pagado', () => {
  const s = calcularSaldo(100, [{ importe: 120 }, { importe: -20 }]);
  assertEquals(s.pagado, 100);
  assertEquals(s.cubierto, true);
});

Deno.test('calcularCambio: nunca negativo y redondeado a céntimo', () => {
  assertEquals(calcularCambio(9.99, 20), 10.01);
  assertEquals(calcularCambio(10, 10), 0);
  assertEquals(calcularCambio(10, 9.99), 0); // entregado de menos → 0, no negativo
});
