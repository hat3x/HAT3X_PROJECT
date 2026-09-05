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
| `export.ts` | **Exportación** del libro registro de facturas expedidas (AEAT/gestoría) a CSV/JSON. **Puro**: recibe las filas y devuelve el texto. |
| `spec-format.ts` | Formateadores canónicos compartidos (`importe` → `21.00`, `fecha` → `dd-mm-yyyy`). Los usan la huella y el QR para que lo firmado y lo impreso cuadren. Puro. |
| `verifactu-url.ts` | Construye la **URL de cotejo de la AEAT** (`ValidarQR?nif&numserie&fecha&importe`) y expone `VERIFACTU_MODE` / `VERIFACTU_LEGEND` (modo **NO VERI\*FACTU**). Puro. |
| `qr.ts` | Generador de **códigos QR** sin dependencias (ISO/IEC 18004, modo byte, Reed-Solomon, nivel M). Devuelve el QR como SVG. Puro. |
| `document.ts` | `buildInvoiceDocumentHtml`: **documento imprimible** (HTML autónomo) del ticket (F2) y la factura completa (F1). Puro. |
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

## Exportación para la AEAT / gestoría

El **Route Handler** `GET /api/facturacion/export`
(`src/app/api/facturacion/export/route.ts`) descarga el **libro registro de
facturas expedidas** del salón activo.

- **Aislamiento por salón**: RLS (cliente Supabase de servidor scopeado por la
  sesión) **más** un `.eq("salon_id", …)` explícito con el salón resuelto en
  servidor; nunca se acepta un `salon_id` del cliente. La descarga se restringe
  además a roles de administración (`owner`/`manager`).
- **Filtros** (query string, todos opcionales): `series`, `from`, `to`
  (`YYYY-MM-DD`, ambos inclusive) y `format` (`csv` por defecto | `json`).
- **CSV**: una fila por línea de desglose de IVA (formato "libro registro"),
  separador `;`, decimales con coma y BOM UTF-8 (Excel es-ES). **JSON**:
  documento estructurado y *lossless* con el desglose anidado y la cadena de
  huellas.

```
GET /api/facturacion/export?series=A&from=2026-01-01&to=2026-03-31&format=csv
→ 200  Content-Disposition: attachment; filename="facturas_serie-A_2026-01-01_2026-03-31.csv"
```

La serialización vive en `export.ts` (pura, sin BD): el Route Handler solo
resuelve auth, aislamiento y la lectura filtrada.

## Documento imprimible (ticket y factura completa)

El **Route Handler** `GET /api/facturacion/documento/[id]`
(`src/app/api/facturacion/documento/[id]/route.ts`) devuelve el documento
**HTML autónomo** de un registro de factura del salón activo, listo para
imprimir o **guardar como PDF** desde el navegador (Ctrl+P). Sirve para el
ticket (F2) y para la factura completa (F1).

El documento incluye, según exige la normativa y como marca el modo
**NO VERI\*FACTU**:

- **aviso visible NO VERI\*FACTU** en un banner superior **y** en la leyenda del
  código QR (el sistema conserva los registros pero no los remite a la AEAT en
  tiempo real);
- **código QR** con la **URL de cotejo de la AEAT** (`ValidarQR?nif&numserie&
  fecha&importe`), generado sin dependencias (`qr.ts`);
- **sello de tiempo** de generación del registro y **huella SHA-256** propia y
  del eslabón anterior;
- **desglose de IVA** por tipo (base / cuota / total) y totales;
- detalle de líneas cuando la factura procede de una venta (`pos_sale_lines`).

El contenido dinámico se **escapa** (sin inyección de HTML), el aislamiento es
por `salon_id` resuelto en servidor, y la URL del QR apunta a producción o
preproducción según `VERIFACTU_ENVIRONMENT`. La construcción del HTML vive en
`document.ts` (pura, sin BD): el Route Handler solo resuelve auth, lectura y
normalización.

```
GET /api/facturacion/documento/{uuid}
→ 200  Content-Type: text/html; charset=utf-8   (ticket F2 o factura F1)
```

```ts
import { buildInvoiceDocumentHtml } from "@/lib/invoicing";

const html = buildInvoiceDocumentHtml(datosDelRegistro, {
  environment: "production",     // URL de cotejo de la AEAT
  timezone: "Europe/Madrid",     // zona de las fechas mostradas
});
```

## Tests

`src/tests/unit/invoicing-hash.test.ts` y `src/tests/unit/invoicing-engine.test.ts`
cubren la cadena canónica, el determinismo y encadenamiento de la huella, la
verificación de integridad, el desglose de IVA (21 % y multi-tipo), TICKET vs
COMPLETA y las reglas de dominio. `src/tests/unit/invoicing-export.test.ts`
cubre la serialización CSV/JSON del libro registro (mapeo F1/F2, una fila por
tipo de IVA, importes con coma, escapado y nombre de archivo).

Para el documento imprimible: `src/tests/unit/invoicing-qr.test.ts` verifica los
invariantes del QR (tamaño por versión, patrones de localización/temporización,
determinismo, SVG); `src/tests/unit/invoicing-verifactu-url.test.ts` valida la
URL de cotejo (orden y formato de parámetros, encoding, entornos, leyenda);
`src/tests/unit/invoicing-document.test.ts` cubre el HTML (aviso NO VERI\*FACTU,
QR embebido, sello de tiempo, desglose de IVA, huella, ticket vs completa y
escapado anti-inyección). Lógica pura, sin BD ni UI.
