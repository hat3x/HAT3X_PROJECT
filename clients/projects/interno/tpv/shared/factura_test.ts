// ============================================================================
// TPV · Tests del núcleo de facturación (Deno std/assert)
// ----------------------------------------------------------------------------
// Ejecutar:  deno test tpv/shared/factura_test.ts
// Verifica el snapshot de líneas, el resumen (base/IVA/total + desglose por
// tipo), el formato de referencia/importe/fecha y el render HTML (escapado y
// coherencia de totales). No toca red ni BD: sólo cálculo y formato puros.
// ============================================================================

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  construirSnapshotFactura,
  formatearReferencia,
  formatearTipoIva,
  montarFacturaCompleta,
  resumenDeLineas,
} from './factura.ts';
import { escaparHtml, renderFacturaHTML } from './facturaHtml.ts';
import type { Factura, LineaFacturaSnapshot, LineaTicket } from './types.ts';

// ----------------------------------------------------------------------------
// Utilidades de fixtures
// ----------------------------------------------------------------------------

function lineaTicket(p: Partial<LineaTicket>): LineaTicket {
  return {
    id: 'l1',
    venta_id: 'v1',
    salon_id: 's1',
    tipo: 'servicio',
    referencia_id: null,
    descripcion: 'Servicio',
    cantidad: 1,
    precio_unitario: 0,
    descuento: 0,
    tipo_impuesto: 21,
    importe_impuesto: 0,
    total_linea: 0,
    orden: 0,
    created_at: '2026-07-13T10:00:00Z',
    ...p,
  };
}

function factura(p: Partial<Factura>): Factura {
  return {
    id: 'f1',
    salon_id: 's1',
    venta_id: 'v1',
    cliente_id: null,
    serie: 'A',
    numero: 123,
    estado: 'emitida',
    razon_social: null,
    nif: null,
    direccion_fiscal: null,
    cliente_email: null,
    emisor_razon_social: null,
    emisor_nif: null,
    emisor_direccion_fiscal: null,
    base_imponible: 0,
    impuestos: 0,
    total: 0,
    moneda: 'EUR',
    desglose_iva: [],
    lineas_snapshot: [],
    pie_factura: null,
    factura_rectificada_id: null,
    emitida_at: '2026-07-13T10:00:00Z',
    created_at: '2026-07-13T10:00:00Z',
    updated_at: '2026-07-13T10:00:00Z',
    ...p,
  };
}

// ----------------------------------------------------------------------------
// Referencia y formato
// ----------------------------------------------------------------------------

Deno.test('formatearReferencia: serie/número con relleno de ceros', () => {
  assertEquals(formatearReferencia('A', 123), 'A/000123');
  assertEquals(formatearReferencia('2026', 7, 4), '2026/0007');
  assertEquals(formatearReferencia('A', 1_000_000), 'A/1000000'); // no trunca
});

Deno.test('formatearTipoIva: entero y decimal en es-ES', () => {
  assertEquals(formatearTipoIva(21), '21%');
  assertEquals(formatearTipoIva(10.5), '10,5%');
});

// ----------------------------------------------------------------------------
// Snapshot y resumen (base / IVA / total / desglose)
// ----------------------------------------------------------------------------

Deno.test('construirSnapshotFactura: congela sólo los campos de factura', () => {
  const { lineas_snapshot } = construirSnapshotFactura([
    lineaTicket({
      descripcion: 'Corte',
      cantidad: 2,
      precio_unitario: 10,
      importe_impuesto: 4.2,
      total_linea: 24.2,
    }),
  ]);
  assertEquals(lineas_snapshot.length, 1);
  const l = lineas_snapshot[0];
  assertEquals(l.descripcion, 'Corte');
  assertEquals(l.total_linea, 24.2);
  // No arrastra campos internos del ticket (id, venta_id, orden…).
  assert(!('id' in (l as Record<string, unknown>)));
});

Deno.test('resumenDeLineas: agrega base/IVA/total y desglosa por tipo', () => {
  const lineas: LineaFacturaSnapshot[] = [
    // 2 × 10 @21% → base 20, IVA 4.2
    {
      descripcion: 'Corte',
      cantidad: 2,
      precio_unitario: 10,
      descuento: 0,
      tipo_impuesto: 21,
      importe_impuesto: 4.2,
      total_linea: 24.2,
    },
    // 1 × 100, dto 20 @10% → base 80, IVA 8
    {
      descripcion: 'Producto',
      cantidad: 1,
      precio_unitario: 100,
      descuento: 20,
      tipo_impuesto: 10,
      importe_impuesto: 8,
      total_linea: 88,
    },
    // otra al 21% → base 30, IVA 6.3 (se agrupa con la primera)
    {
      descripcion: 'Extra',
      cantidad: 1,
      precio_unitario: 30,
      descuento: 0,
      tipo_impuesto: 21,
      importe_impuesto: 6.3,
      total_linea: 36.3,
    },
  ];
  const r = resumenDeLineas(lineas);
  assertEquals(r.base_imponible, 130); // 20 + 80 + 30
  assertEquals(r.impuestos, 18.5); // 4.2 + 8 + 6.3
  assertEquals(r.total, 148.5);

  // Desglose ordenado por tipo ascendente: 10% y 21% agrupado.
  assertEquals(r.desglose_iva, [
    { tipo_impuesto: 10, base: 80, cuota: 8 },
    { tipo_impuesto: 21, base: 50, cuota: 10.5 }, // 20+30 base, 4.2+6.3 cuota
  ]);
});

Deno.test('montarFacturaCompleta: añade la referencia formateada', () => {
  const res = montarFacturaCompleta(factura({ serie: 'B', numero: 5 }));
  assertEquals(res.referencia, 'B/000005');
  assertEquals(res.factura.numero, 5);
});

// ----------------------------------------------------------------------------
// Render HTML
// ----------------------------------------------------------------------------

Deno.test('escaparHtml: neutraliza caracteres peligrosos', () => {
  assertEquals(
    escaparHtml('<script>&"\'</script>'),
    '&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;',
  );
});

Deno.test('renderFacturaHTML: incluye referencia, totales y escapa descripciones', () => {
  const f = factura({
    serie: 'A',
    numero: 42,
    emisor_razon_social: 'Salón Demo',
    razon_social: 'Cliente <b>Ácido</b>',
    base_imponible: 20,
    impuestos: 4.2,
    total: 24.2,
    desglose_iva: [{ tipo_impuesto: 21, base: 20, cuota: 4.2 }],
    lineas_snapshot: [
      {
        descripcion: 'Corte & peinado <x>',
        cantidad: 2,
        precio_unitario: 10,
        descuento: 0,
        tipo_impuesto: 21,
        importe_impuesto: 4.2,
        total_linea: 24.2,
      },
    ],
  });
  const html = renderFacturaHTML(f);

  assertStringIncludes(html, 'A/000042'); // referencia
  assertStringIncludes(html, 'Salón Demo'); // emisor
  assertStringIncludes(html, 'Corte &amp; peinado &lt;x&gt;'); // línea escapada
  assertStringIncludes(html, 'Cliente &lt;b&gt;Ácido&lt;/b&gt;'); // cliente escapado
  // La descripción original sin escapar NO debe aparecer (no hay inyección).
  assert(!html.includes('<b>Ácido</b>'));
  assertStringIncludes(html, '<!doctype html>');
});

Deno.test('renderFacturaHTML: factura simplificada muestra "Cliente contado"', () => {
  const html = renderFacturaHTML(factura({ razon_social: null }));
  assertStringIncludes(html, 'Cliente contado');
});

Deno.test('renderFacturaHTML: autoImprimir inserta el script de impresión', () => {
  const conScript = renderFacturaHTML(factura({}), { autoImprimir: true });
  const sinScript = renderFacturaHTML(factura({}), { autoImprimir: false });
  assertStringIncludes(conScript, 'window.addEventListener("load"');
  assert(!sinScript.includes('window.addEventListener("load"'));
});
