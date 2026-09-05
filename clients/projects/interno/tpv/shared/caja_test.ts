// ============================================================================
// TPV · Tests del núcleo de caja (Deno std/assert)
// ----------------------------------------------------------------------------
// Ejecutar:  deno test tpv/shared/caja_test.ts
// Verifica el neto de movimientos, el resumen de cobros y el arqueo completo
// (teórico de efectivo, descuadre con signo, tolerancia de céntimo y el caso
// "aún sin contar").
// ============================================================================

import { assertEquals } from 'jsr:@std/assert@1';
import {
  calcularArqueo,
  netoMovimientos,
  resumirCobros,
  severidadDescuadre,
  type CobroCalculable,
  type MovimientoCalculable,
} from './caja.ts';

Deno.test('netoMovimientos: entradas suman, salidas restan', () => {
  const movs: MovimientoCalculable[] = [
    { tipo: 'entrada', importe: 50 },
    { tipo: 'salida', importe: 12.5 },
    { tipo: 'salida', importe: 7.5 },
  ];
  const n = netoMovimientos(movs);
  assertEquals(n.entradas, 50);
  assertEquals(n.salidas, 20);
  assertEquals(n.neto, 30);
});

Deno.test('netoMovimientos: usa el valor absoluto del importe (el signo lo da tipo)', () => {
  const n = netoMovimientos([{ tipo: 'salida', importe: -30 }]);
  assertEquals(n.salidas, 30);
  assertEquals(n.neto, -30);
});

Deno.test('resumirCobros: separa efectivo del resto', () => {
  const cobros: CobroCalculable[] = [
    { importe: 100, es_efectivo: true },
    { importe: 40, es_efectivo: false }, // tarjeta
    { importe: -10, es_efectivo: true }, // cambio devuelto
  ];
  const r = resumirCobros(cobros);
  assertEquals(r.total, 130);
  assertEquals(r.efectivo, 90);
  assertEquals(r.otros, 40);
  assertEquals(r.numero_cobros, 3);
});

Deno.test('calcularArqueo: teórico = fondo + efectivo + entradas − salidas', () => {
  const arqueo = calcularArqueo({
    saldo_inicial: 100,
    cobros: [
      { importe: 60, es_efectivo: true },
      { importe: 200, es_efectivo: false }, // tarjeta: NO toca el cajón
    ],
    movimientos: [
      { tipo: 'entrada', importe: 20 },
      { tipo: 'salida', importe: 30 },
    ],
    efectivo_real: null,
  });
  assertEquals(arqueo.cobros_efectivo, 60);
  assertEquals(arqueo.movimientos_neto, -10);
  assertEquals(arqueo.efectivo_teorico, 150); // 100 + 60 + 20 − 30
  assertEquals(arqueo.efectivo_real, null);
  assertEquals(arqueo.descuadre, null);
  assertEquals(arqueo.cuadra, false); // sin conteo no cuadra
});

Deno.test('calcularArqueo: descuadre negativo = falta dinero', () => {
  const arqueo = calcularArqueo({
    saldo_inicial: 100,
    cobros: [{ importe: 50, es_efectivo: true }],
    movimientos: [],
    efectivo_real: 145,
  });
  assertEquals(arqueo.efectivo_teorico, 150);
  assertEquals(arqueo.descuadre, -5); // faltan 5 €
  assertEquals(arqueo.cuadra, false);
  assertEquals(severidadDescuadre(arqueo.descuadre), 'falta');
});

Deno.test('calcularArqueo: descuadre positivo = sobra dinero', () => {
  const arqueo = calcularArqueo({
    saldo_inicial: 0,
    cobros: [{ importe: 30, es_efectivo: true }],
    movimientos: [],
    efectivo_real: 33.5,
  });
  assertEquals(arqueo.descuadre, 3.5);
  assertEquals(severidadDescuadre(arqueo.descuadre), 'sobra');
});

Deno.test('calcularArqueo: cuadra dentro de la tolerancia de céntimo', () => {
  const arqueo = calcularArqueo({
    saldo_inicial: 100,
    cobros: [{ importe: 0.1, es_efectivo: true }],
    movimientos: [{ tipo: 'entrada', importe: 0.2 }],
    efectivo_real: 100.3,
  });
  assertEquals(arqueo.efectivo_teorico, 100.3);
  assertEquals(arqueo.descuadre, 0);
  assertEquals(arqueo.cuadra, true);
  assertEquals(severidadDescuadre(arqueo.descuadre), 'cuadra');
});

Deno.test('calcularArqueo: el cambio en efectivo (importe negativo) reduce el teórico', () => {
  const arqueo = calcularArqueo({
    saldo_inicial: 50,
    cobros: [
      { importe: 100, es_efectivo: true },
      { importe: -20, es_efectivo: true }, // vuelta de cambio
    ],
    movimientos: [],
    efectivo_real: 130,
  });
  assertEquals(arqueo.cobros_efectivo, 80);
  assertEquals(arqueo.efectivo_teorico, 130);
  assertEquals(arqueo.cuadra, true);
});
