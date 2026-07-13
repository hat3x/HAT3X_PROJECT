// ============================================================================
// TPV · Integración — facturación (emisión desde ticket)
// ----------------------------------------------------------------------------
// Ejecutar (desde tpv/tests):  deno test integracion_facturacion_test.ts
//
// Ejercita functions/_shared/factura.ts (emitirFactura / cargarFactura /
// cargarConfigFacturacion) contra el doble en memoria. Verifica el servidor
// autoritativo de facturación:
//   · Recalcula base/IVA/total y congela el snapshot desde las líneas del
//     ticket (nunca del cliente).
//   · Resuelve serie/emisor/moneda desde la config del salón, con override de
//     serie y de datos fiscales del cliente en la petición.
//   · Numeración correlativa por (salón, serie) — la simula el fake como el
//     trigger de BD.
//   · Un ticket sólo se factura una vez (UNIQUE venta_id → TICKET_YA_FACTURADO)
//     y no se facturan tickets anulados/reembolsados ni vacíos.
// ============================================================================

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { cargarFactura, emitirFactura } from '../functions/_shared/factura.ts';
import { ErrorTpv } from '../shared/errors.ts';
import type { EstadoVenta } from '../shared/types.ts';
import { FakeSupabase } from './fakeSupabase.ts';

const SALON = 'salon-A';

interface OpcionesTicket {
  id?: string;
  estado?: EstadoVenta;
  conLineas?: boolean;
}

/** Siembra un ticket (con una línea 2×10 @21% por defecto) listo para facturar. */
function conTicket(sb: FakeSupabase, o: OpcionesTicket = {}): string {
  const id = o.id ?? 'venta-1';
  sb.sembrar('tpv_ventas', [
    {
      id,
      salon_id: SALON,
      numero_ticket: 1,
      estado: o.estado ?? 'pagada',
      cliente_id: null,
      subtotal: 20,
      descuento_total: 0,
      impuestos_total: 4.2,
      total: 24.2,
    },
  ]);
  if (o.conLineas !== false) {
    sb.sembrar('tpv_lineas_ticket', [
      {
        id: `${id}-l1`,
        venta_id: id,
        salon_id: SALON,
        descripcion: 'Corte',
        cantidad: 2,
        precio_unitario: 10,
        descuento: 0,
        tipo_impuesto: 21,
        importe_impuesto: 4.2,
        total_linea: 24.2,
        orden: 0,
      },
    ]);
  }
  return id;
}

// ----------------------------------------------------------------------------
// Emisión y snapshot
// ----------------------------------------------------------------------------

Deno.test('emitirFactura: simplificada (sin config ni cliente) usa serie A y nº 1', async () => {
  const sb = new FakeSupabase();
  const venta_id = conTicket(sb);

  const { factura, referencia } = await emitirFactura(sb, { venta_id });

  assertEquals(factura.serie, 'A');
  assertEquals(factura.numero, 1);
  assertEquals(referencia, 'A/000001');
  // Importes recalculados desde las líneas (autoritativo).
  assertEquals(factura.base_imponible, 20);
  assertEquals(factura.impuestos, 4.2);
  assertEquals(factura.total, 24.2);
  // Snapshot de líneas + desglose congelado.
  assertEquals(factura.lineas_snapshot.length, 1);
  assertEquals(factura.desglose_iva, [{ tipo_impuesto: 21, base: 20, cuota: 4.2 }]);
  // Sin datos fiscales del cliente → factura simplificada.
  assertEquals(factura.razon_social, null);
});

Deno.test('emitirFactura: toma serie y emisor de la config del salón', async () => {
  const sb = new FakeSupabase();
  const venta_id = conTicket(sb);
  sb.sembrar('tpv_config_facturacion', [
    {
      salon_id: SALON,
      serie_por_defecto: '2026',
      emisor_razon_social: 'Salón Demo SL',
      emisor_nif: 'B12345678',
      emisor_direccion_fiscal: 'C/ Falsa 123',
      pie_factura: 'Gracias por su visita',
      moneda: 'EUR',
    },
  ]);

  const { factura, referencia } = await emitirFactura(sb, { venta_id });
  assertEquals(factura.serie, '2026');
  assertEquals(referencia, '2026/000001');
  assertEquals(factura.emisor_razon_social, 'Salón Demo SL');
  assertEquals(factura.emisor_nif, 'B12345678');
  assertEquals(factura.pie_factura, 'Gracias por su visita');
});

Deno.test('emitirFactura: serie del input tiene prioridad sobre la config', async () => {
  const sb = new FakeSupabase();
  const venta_id = conTicket(sb);
  sb.sembrar('tpv_config_facturacion', [{ salon_id: SALON, serie_por_defecto: 'A', moneda: 'EUR' }]);

  const { factura } = await emitirFactura(sb, { venta_id, serie: 'FR' });
  assertEquals(factura.serie, 'FR');
});

Deno.test('emitirFactura: con datos fiscales → factura completa (congela cliente)', async () => {
  const sb = new FakeSupabase();
  const venta_id = conTicket(sb);

  const { factura } = await emitirFactura(sb, {
    venta_id,
    cliente: {
      razon_social: 'Cliente SA',
      nif: 'A87654321',
      direccion_fiscal: 'Av. Real 1',
      email: 'cliente@example.com',
    },
  });
  assertEquals(factura.razon_social, 'Cliente SA');
  assertEquals(factura.nif, 'A87654321');
  assertEquals(factura.cliente_email, 'cliente@example.com');
});

// ----------------------------------------------------------------------------
// Numeración correlativa por (salón, serie)
// ----------------------------------------------------------------------------

Deno.test('emitirFactura: numeración correlativa e independiente por serie', async () => {
  const sb = new FakeSupabase();
  const v1 = conTicket(sb, { id: 'venta-1' });
  const v2 = conTicket(sb, { id: 'venta-2' });
  const v3 = conTicket(sb, { id: 'venta-3' });

  const f1 = await emitirFactura(sb, { venta_id: v1, serie: 'A' });
  const f2 = await emitirFactura(sb, { venta_id: v2, serie: 'A' });
  const f3 = await emitirFactura(sb, { venta_id: v3, serie: 'B' });

  assertEquals(f1.factura.numero, 1);
  assertEquals(f2.factura.numero, 2); // misma serie A → correlativo
  assertEquals(f3.factura.numero, 1); // serie B arranca en 1
});

// ----------------------------------------------------------------------------
// Reglas de negocio (rechazos)
// ----------------------------------------------------------------------------

Deno.test('emitirFactura: un ticket sólo se factura una vez → TICKET_YA_FACTURADO', async () => {
  const sb = new FakeSupabase();
  const venta_id = conTicket(sb);
  await emitirFactura(sb, { venta_id });

  const e = await assertRejects(() => emitirFactura(sb, { venta_id }), ErrorTpv);
  assertEquals(e.codigo, 'TICKET_YA_FACTURADO');
  // No se ha creado una segunda factura.
  assertEquals(sb.snapshot('tpv_facturas').length, 1);
});

Deno.test('emitirFactura: ticket anulado no es facturable', async () => {
  const sb = new FakeSupabase();
  const venta_id = conTicket(sb, { estado: 'anulada' });
  const e = await assertRejects(() => emitirFactura(sb, { venta_id }), ErrorTpv);
  assertEquals(e.codigo, 'TICKET_NO_FACTURABLE');
});

Deno.test('emitirFactura: ticket sin líneas no es facturable', async () => {
  const sb = new FakeSupabase();
  const venta_id = conTicket(sb, { conLineas: false });
  const e = await assertRejects(() => emitirFactura(sb, { venta_id }), ErrorTpv);
  assertEquals(e.codigo, 'TICKET_NO_FACTURABLE');
});

// ----------------------------------------------------------------------------
// Carga de facturas emitidas
// ----------------------------------------------------------------------------

Deno.test('cargarFactura: por venta_id y por factura_id devuelven la misma factura', async () => {
  const sb = new FakeSupabase();
  const venta_id = conTicket(sb);
  const emitida = await emitirFactura(sb, { venta_id });

  const porVenta = await cargarFactura(sb, { venta_id });
  const porId = await cargarFactura(sb, { factura_id: emitida.factura.id });
  assertEquals(porVenta.factura.id, emitida.factura.id);
  assertEquals(porId.factura.id, emitida.factura.id);
  assert(porVenta.referencia.startsWith('A/'));
});

Deno.test('cargarFactura: 404 si el ticket no tiene factura', async () => {
  const sb = new FakeSupabase();
  const e = await assertRejects(
    () => cargarFactura(sb, { venta_id: 'sin-factura' }),
    ErrorTpv,
  );
  assertEquals(e.codigo, 'NO_ENCONTRADO');
});
