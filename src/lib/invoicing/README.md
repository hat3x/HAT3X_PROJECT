# Motor de facturación Veri*factu (`@/lib/invoicing`)

Motor de emisión de **facturas Veri*factu** (modo **NO VERI\*FACTU**): genera
por cada factura un **registro de facturación de alta inmutable**, numerado de
forma **correlativa por serie y sin huecos**, **encadenado por huella SHA-256**
con el registro anterior de la misma serie, con **sello de tiempo** y **desglose
de IVA** (base / cuota / total por tipo impositivo).

Se apoya en la tabla `pos_invoices` (migración `20260714100000_verifactu_invoices.sql`),
que garantiza la inmutabilidad a nivel de motor (trigger `trg_pos_invoices_immutable`)
y la unicidad de numeración y de huella por salón.

El dinero se maneja como **enteros de céntimos** y la aritmética de IVA se delega
en `@/lib/payments` (misma fuente que usa la caja): aquí no se recalcula nada.

## Mapa de archivos

| Archivo | Qué contiene |
|---|---|
| `hash.ts` | Cadena canónica + huella **SHA-256** (hex mayúsculas, 64 chars) y `verifyHashChain` para reverificar la integridad de una cadena. Puro. |
| `engine.ts` | `buildInvoiceRecord`: motor **puro** que arma la fila `pos_invoices` (desglose de IVA, snapshots emisor/receptor, huella). Sin I/O. |
| `emit.ts` | Orquestador **server-only**: resuelve el nº correlativo sin huecos y el eslabón anterior, e inserta el registro con reintento ante colisión concurrente. |
| `index.ts` | Punto de entrada público. Importa **siempre** desde aquí. |

El **Server Action** que expone el motor a la UI del TPV vive en
`src/app/(dashboard)/tpv/invoice-actions.ts` (`emitInvoiceAction`).

## Modelo Veri*factu

- **Encadenamiento**: la huella de cada registro se calcula sobre una cadena
  canónica (`IDEmisorFactura`, `NumSerieFactura`, `FechaExpedicionFactura`,
  `TipoFactura`, `CuotaTotal`, `ImporteTotal`, **`Huella` del anterior**,
  `FechaHoraHusoGenRegistro`). Alterar un registro rompe la huella de todos los
  siguientes. El primero de la serie firma `Huella` vacía.
- **Numeración sin huecos**: `emit.ts` lee el último número de la serie, asigna
  el siguiente y confía en las restricciones `unique (salon_id, series,
  sequential_number)` / `unique (salon_id, current_hash)` para rechazar carreras;
  como un `insert` fallido no deja fila, la serie nunca queda con huecos.
- **Tipos de factura**:
  - `ticket` → **F2** (factura simplificada): sin datos del receptor.
  - `completa` → **F1** (factura ordinaria): con NIF/nombre del cliente
    (de la ficha de cliente o introducidos a mano).

## Uso (Server Action)

```ts
import { emitInvoiceAction } from "@/app/(dashboard)/tpv/invoice-actions";

// Ticket (simplificada) a partir de líneas libres:
await emitInvoiceAction({
  invoiceType: "ticket",
  series: "A",
  lines: [{ kind: "product", refId: null, description: "Champú", quantity: "1", unitPrice: "12,10", vatRate: "21" }],
});

// Factura completa de una venta ya registrada, con cliente fichado:
await emitInvoiceAction({
  invoiceType: "completa",
  series: "A",
  saleId: "…uuid…",
  customerId: "…uuid…",
});
```

## Tests

`src/tests/unit/invoicing-hash.test.ts` y `src/tests/unit/invoicing-engine.test.ts`
cubren la cadena canónica, el determinismo y encadenamiento de la huella, la
verificación de integridad, el desglose de IVA (21 % y multi-tipo), TICKET vs
COMPLETA y las reglas de dominio. Lógica pura, sin BD ni UI.
