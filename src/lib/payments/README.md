# Capa de pagos (`@/lib/payments`)

Capa de dominio, aislada de la UI y de la base de datos, con dos
responsabilidades:

1. **Cálculo de totales e IVA** por línea y por venta — fuente única reutilizada
   por **caja (TPV)** y por **facturación**.
2. **Abstracción de pasarela de pago** (`PaymentGateway`) con una implementación
   **manual / de registro** que no procesa ningún cobro real.

Todo el dinero se maneja como **enteros de céntimos** (invariante §1.6 del
esquema). Nada aquí depende de React, Next ni Supabase: es lógica pura y
testeable.

## Mapa de archivos

| Archivo | Qué contiene |
|---|---|
| `money.ts` | Primitivas de céntimos: redondeo comercial, multiplicación por cantidad fraccionaria, extracción de IVA de un bruto. |
| `totals.ts` | `computeLineTotals` / `computeSaleTotals` + desglose de IVA por tipo (`vatBreakdown`). |
| `gateway.ts` | Interfaz `PaymentGateway`, tipos de tender/resultado y validación de cuadre. |
| `manual-gateway.ts` | `ManualPaymentGateway`: valida y transforma los tenders en filas de `pos_payments`. Sin cobro real. |
| `index.ts` | Punto de entrada público + `getPaymentGateway()` (selector de pasarela). |

Importa **siempre** desde `@/lib/payments`, nunca de los submódulos.

## Modelo de precios: BRUTO (PVP, IVA incluido)

Los precios unitarios (`unit_price_cents`, `products.price_cents`) son **PVP con
IVA incluido**, como es norma en el retail y los salones en España y coherente
con `pos_sale_lines.line_total_cents` = «IVA incluido, tras descuento». Por eso
la base imponible y la cuota se **extraen** del bruto:

```
base = round(bruto / (1 + tipoIVA/100))
cuota = bruto − base          // por diferencia → base + cuota === bruto (exacto)
```

Mapeo a los snapshots del esquema (`pos_*`):

| Cálculo | Columna |
|---|---|
| bruto de la línea (IVA incl., tras descuento) | `pos_sale_lines.line_total_cents` |
| Σ base imponible | `pos_sales.subtotal_cents` |
| Σ cuota de IVA | `pos_sales.tax_cents` |
| Σ descuentos de línea (informativo) | `pos_sales.discount_cents` |
| Σ bruto | `pos_sales.total_cents` ≡ `subtotal + tax` |

## Uso rápido

```ts
import {
  computeSaleTotals,
  getPaymentGateway,
  type PaymentTender,
} from "@/lib/payments";

// 1) Totales del ticket (caja y facturación)
const totals = computeSaleTotals([
  { quantity: 1, unitPriceCents: 2000, vatRate: 21 },     // servicio 20 €
  { quantity: 2, unitPriceCents: 550, vatRate: 21 },      // 2 productos
]);
// totals.totalCents, totals.subtotalCents, totals.taxCents, totals.vatBreakdown

// 2) Registrar el cobro (pago mixto = varios tenders)
const tenders: PaymentTender[] = [
  { method: "efectivo", amountCents: 1200 },
  { method: "tarjeta", amountCents: totals.totalCents - 1200 },
];
const gateway = getPaymentGateway();                       // 'manual'
const result = await gateway.registerPayment({
  salonId, saleId, sessionId,
  totalCents: totals.totalCents,
  tenders,
});
// result.payments → filas listas para insertar en pos_payments
```

`registerPayment` **no persiste nada**: devuelve las filas para que la Server
Action / capa de datos las inserte dentro de su propia transacción (junto a la
venta y sus líneas).

## «Pago mixto»

El enum `pos_payment_method` **no** tiene un valor `'mixto'`. Un pago mixto es
simplemente **más de un tender** (p. ej. parte en efectivo y parte en tarjeta):
cada tender genera su fila en `pos_payments`. `isMixedPayment(tenders)` lo
detecta cuando hace falta (p. ej. para la etiqueta de la UI).

## Roadmap: pasarelas reales (TODO)

La abstracción existe precisamente para que enchufar un proveedor real **no
toque el TPV**. Solo hay que añadir una clase que implemente `PaymentGateway` y
un `case` en `getPaymentGateway()`.

- [ ] **`sumup`** — SumUp: datáfono/lector Bluetooth pensado para pymes y
  salones. Autorizar el cargo con la SumUp API/SDK y mapear el id de transacción
  a `pos_payments.reference`.
- [ ] **`stripe`** — Stripe Terminal (presencial) o Payment Intents (online).
  Confirmar el `PaymentIntent` antes de devolver las filas.
- [ ] **`redsys`** — Redsys / TPV bancario español: redirección con firma
  HMAC-SHA256 y validación de la respuesta del banco.

Cada integración debe: (1) **autorizar el cobro antes** de devolver el
`PaymentResult`; (2) devolver `status` distinto de `'registered'` si procede
(p. ej. `'authorized'`); (3) guardar la referencia del proveedor en
`reference`; (4) manejar fallos/timeout lanzando un error de dominio que el TPV
pueda mostrar sin dejar la venta a medias.
