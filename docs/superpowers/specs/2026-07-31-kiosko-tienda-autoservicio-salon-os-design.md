# Kiosko de tienda autoservicio (Salón OS)
**Fecha:** 2026-07-31
**Estado:** Aprobado por Jose M.
**Autor:** Jose M. + Claude (brainstorming session)
**Producto:** Salón OS (`clients/projects/salon-os/`)
**Piloto:** denueveanueve

---

## 1. Contexto y problema

Los clientes que solo quieren **comprar un producto de la tienda** del salón (champú, cera,
mascarilla…) tienen que entrar, esperar a que un profesional ocupado les atienda y cobrarles
en el TPV. Se quiere un **punto de autoservicio en tablet**, estilo kiosko de comida rápida:
el cliente elige productos en la pantalla, decide **pagar con tarjeta allí mismo** (datáfono/
lector conectado a la tablet) **o en efectivo**, y recoge el producto — sin tener que "entrar"
al salón ni interrumpir el trabajo.

Salón OS **ya tiene** casi todo el backend necesario, hoy solo accesible desde el TPV de
personal (con login):

- **Catálogo de productos** — tabla `products`, ruta `/(dashboard)/products`.
- **TPV / ventas** — `pos_sales` / `pos_sale_lines` / `pos_payments` / `pos_sessions`
  (`20260713180000_pos_base.sql`), con carrito, escáner y ticket térmico.
- **Facturación VeriFactu** — `20260714100000_verifactu_invoices.sql` + `lib/invoicing`.
- **Arqueo de caja** — `pos_sessions` + `/(dashboard)/arqueo`.
- **Fidelidad** — `lib/loyalty` + RPC `staff_award_visit`.
- **Capa de pagos** — `lib/payments` (`PaymentGateway`, hoy solo `ManualPaymentGateway`).
- **Auth no-humana** — `service_api_keys` (`20260722100000`): clave por salón, hasheada.
- **Feature flags y branding por salón** — `salon_features`, `salon_branding`.

**El hueco:** todo eso es *de cara al personal y con login* (RLS `authenticated` +
`app.user_salon_ids()`). Falta un **front de cara al cliente, sin login, para tablet**, y
resolver de verdad el **cobro con tarjeta presencial** desde la tablet.

## 2. Decisiones aprobadas

| Decisión | Elección | Motivo |
|---|---|---|
| Enfoque | Ruta nueva sin login **dentro de Salón OS** + carcasa Capacitor fina en la tablet | Un solo backend y un solo código (dirección de productización); reusa el 100% del dominio fiscal/venta ya probado |
| Cobro con tarjeta | **SumUp integrado**, disparado desde la app, con confirmación automática | Barato (pymes/salones), la app *sabe* si se pagó; ya sugerido en el README de pagos |
| Dónde vive el cargo | **En el dispositivo** (SDK SumUp ↔ lector). El servidor solo **registra** `method='tarjeta'`, `reference=txId` | El pago presencial lo autoriza el SDK; no hace falta pasarela SumUp en servidor |
| Entrega + efectivo | **Pantalla de pedidos para el personal** (Realtime). Efectivo se cobra en el TPV existente | El producto físico lo entrega una persona igualmente; reusa TPV + arqueo |
| Identificación de cliente | **Opcional** (QR o teléfono) para sumar puntos; si se salta, venta anónima | Equilibrio fricción / fidelización |
| Alcance v1 | **Solo productos de tienda**; piloto denueveanueve; feature de Salón OS multi-salón | YAGNI |

## 3. Arquitectura y componentes

Seis unidades. Solo **dos son verdaderamente nuevas** (kiosko web + puente/carcasa de pago);
el resto reutiliza dominio existente.

| Unidad | Qué hace | Nueva / reuso |
|---|---|---|
| **Kiosko web** (`/(kiosk)/kiosko`) | Ruta sin login en la app Next de Salón OS. Táctil, pantalla completa, branding del salón. Catálogo → carrito → (fidelidad opcional) → pago. | 🆕 UI, reusa dominio |
| **Puente de pago** (`PaymentBridge`) | Interfaz cliente: `cobrar(importeCents) → {ok, txId}`. Impl. `MockPaymentBridge` (web/dev) y `SumUpBridge` (real). | 🆕 |
| **Carcasa Android** (Capacitor) | Bloquea la tablet (screen pinning) y provee el `SumUpBridge` real vía SDK. Carga la URL del kiosko en Vercel. | 🆕 fina (patrón 100M) |
| **RPC de pedido** (`kiosk_create_order`) | `SECURITY DEFINER`, atómica: crea `pos_sales` + `pos_sale_lines` (+ pago tarjeta / + `customer_id`). Gateada por clave de dispositivo. | 🆕 sobre tablas existentes |
| **RPC de catálogo** (`kiosk_get_catalog`) | `SECURITY DEFINER`, pública: devuelve solo productos activos y visibles en kiosko (sin coste ni internos). | 🆕 |
| **Pantalla de pedidos** (`/(dashboard)/kiosko`) | Realtime para el personal: pendientes de cobro y de entrega. "Cobrar" (→ TPV) y "Entregar". | 🆕 |
| **Backend venta/fiscal/loyalty/branding** | `pos_*`, VeriFactu, arqueo, fidelidad, catálogo, `salon_features`, `salon_branding`. | ♻️ reuso |

## 4. Modelo de datos (añadidos mínimos)

Reutiliza `pos_sales` / `pos_sale_lines` / `pos_payments` tal cual. **Nuevas columnas en
`pos_sales`** (aditivo, sin backfill — proyecto sin datos de producción):

- `channel` enum `pos_sale_channel ('staff','kiosk')`, `not null default 'staff'` — analítica y filtrado.
- `fulfillment_status` enum `pos_fulfillment_status ('pending','delivered')`, **nullable**
  (null = no aplica; solo el kiosko lo usa) — filtra la pantalla del personal.
- `idempotency_key` text **nullable**, `unique (salon_id, idempotency_key)` — evita venta
  duplicada al reintentar tras cobrar la tarjeta.
- `pickup_code` text — código corto de recogida (secuencia diaria por salón, p. ej. "13")
  para que cliente y personal se entiendan.

Nuevo método concreto opcional: se puede añadir un `pos_payment_methods` "SumUp" por salón y
referenciarlo en `payment_method_id`; no es imprescindible (el `method='tarjeta'` base basta
para reconciliar).

**Mapeo de estados:**

| Vía | `status` | `fulfillment_status` | Pago | Fiscal |
|---|---|---|---|---|
| **Tarjeta** | `completed` | `pending` | fila `pos_payments` (tarjeta, ref=txId) al crear | ticket emitido por la RPC |
| **Efectivo** | `open` | `pending` | **ninguno** aún | ticket lo emite el TPV al cobrar |
| **Entregado** | (igual) | `delivered` | — | — |

**RLS de las columnas nuevas:** las políticas de miembro existentes sobre `pos_sales`
(`members_select`, `members_update`) ya cubren leer y marcar entrega desde el dashboard. El
kiosko anónimo **no** escribe directo: pasa por la RPC gateada (§7).

## 5. Flujo del cliente en la tablet

```
┌─ INICIO ────────┐   ┌─ CATÁLOGO ──────┐   ┌─ CARRITO ───────┐
│ Logo del salón  │→  │ Productos por    │→ │ Líneas + total  │
│ "Toca para      │   │ categoría, foto, │   │ editar cantidad │
│  comprar"       │   │ precio, [+]      │   │ [Pagar]         │
└─────────────────┘   └──────────────────┘   └────────┬────────┘
                                                       ▼
                        ┌─ ¿FIDELIDAD? (opcional) ─────────────┐
                        │ [Escanear QR] [Teléfono] [Saltar]    │
                        └────────────────┬─────────────────────┘
                                         ▼
                        ┌─ MÉTODO DE PAGO ─────────────────────┐
                        │ [💳 Tarjeta ahora]  [💵 Efectivo]     │
                        └────────┬─────────────────┬───────────┘
                     tarjeta ▼                     ▼ efectivo
        ┌─ SumUp: acerca la tarjeta ─┐   ┌─ crear pedido 'open' ─┐
        │ bridge.cobrar → ok/txId    │   │ (sin pago)            │
        └────────────┬───────────────┘   └───────────┬───────────┘
                     ▼                                ▼
        ┌─ OK: "Pedido #13, recoge en el mostrador" ────────────┐
        │  (efectivo: "paga y recoge en el mostrador")          │
        │  ticket opcional impreso; vuelve a INICIO a los ~8s    │
        └───────────────────────────────────────────────────────┘
```

Si el cliente se identifica, el kiosko etiqueta `customer_id` en la venta (para tarjeta la
RPC suma puntos; para efectivo los suma el TPV al cobrar).

## 6. El puente de pago (SumUp), aislado y testeable

El único trozo que depende de hardware queda tras una interfaz fina, para que **todo el
kiosko corra en un navegador durante el desarrollo**:

```ts
interface PaymentBridge {
  readonly id: string;                              // 'mock' | 'sumup'
  cobrar(input: { totalCents: number; idempotencyKey: string })
    : Promise<{ ok: true; txId: string } | { ok: false; reason: string }>;
}
```

- `MockPaymentBridge` (web/dev): simula OK/fallo con un botón → flujo entero sin tablet.
- `SumUpBridge` (carcasa Capacitor): llama al SDK de SumUp, devuelve el `txId` real.
- El kiosko elige el bridge según el contexto (`window.Capacitor`). Tras `ok`, llama a la
  server action que ejecuta `kiosk_create_order` con el `txId`.

**Estilo de integración SumUp** (a resolver en el plan, preferir el más simple): plugin
nativo del SDK vs *app-switch* a la app de SumUp con callback. Ambos cumplen el contrato
`PaymentBridge`; el kiosko no cambia.

## 7. Seguridad

- **Kiosko sin login**, pero **toda escritura** exige una **clave de dispositivo**
  (`service_api_keys`, scope `kiosk:sale`) validada en el servidor (server action) antes de
  llamar a la RPC. La clave vive en la config de la carcasa Capacitor, **nunca** en el bundle
  web público.
- **Lectura del catálogo:** los productos tienen RLS de miembro → el kiosko anónimo lee vía
  RPC pública `kiosk_get_catalog(salon_id)` (`SECURITY DEFINER`) que devuelve solo productos
  activos y visibles en kiosko (sin coste ni campos internos).
- **`kiosk_create_order`** es `SECURITY DEFINER`: valida salón + clave/gate, calcula totales
  desde el catálogo del servidor (no confía en precios del cliente), inserta venta+líneas
  (+pago tarjeta) de forma atómica y devuelve `pickup_code`.
- **Gate por salón:** feature flag `kiosk` en `salon_features`. Sin la feature, la ruta 404.
- **Aislamiento tablet:** screen pinning de Android en la carcasa → el cliente no sale del
  kiosko a otras apps ni al navegador.
- **Sin acceso al dashboard:** el kiosko es un árbol de rutas separado de `(dashboard)`; no
  comparte sesión de miembro.

## 8. Errores, idempotencia y fiscal

El punto crítico es **no perder ni duplicar una venta después de cobrar la tarjeta**.

- **Idempotencia:** el kiosko genera un `idempotencyKey` (uuid) al iniciar el checkout.
  `kiosk_create_order` hace *upsert* por `(salon_id, idempotency_key)`: reintentar con la
  misma clave **y** el mismo `txId` crea la venta **una sola vez**.
- **Tarjeta OK pero servidor caído:** el kiosko reintenta la server action con el mismo
  `idempotencyKey`/`txId`. Si aun así no llega, muestra "Guarda este comprobante" con el
  `txId` y avisa al personal; se reconcilia a mano en el TPV referenciando ese `txId`. Nunca
  se cobra dos veces (el SDK ya cargó una vez).
- **Tarjeta rechazada/cancelada:** no se crea nada; vuelve al método de pago con "Pago no
  completado, intenta de nuevo".
- **Fiscal (VeriFactu):** el ticket de tarjeta lo emite `kiosk_create_order` al completar
  (reusa `lib/invoicing`). El de efectivo lo emite el TPV al cobrar. **Sin doble camino fiscal.**
- **Loyalty:** en tarjeta, la RPC suma puntos si hay `customer_id`; en efectivo, los suma el
  TPV al cobrar (comportamiento actual). Si el cliente se identificó, el kiosko solo etiqueta
  `customer_id`.

## 9. Pantalla de pedidos del personal (`/(dashboard)/kiosko`)

Ruta nueva en el dashboard, suscripción **Realtime** a `pos_sales` con `channel='kiosk'` y
`fulfillment_status='pending'`. Dos columnas:

```
PENDIENTES DE COBRO (efectivo)        PAGADOS · ENTREGAR (tarjeta)
────────────────────────────         ─────────────────────────────
#13  12,50€  hace 1 min               #12  ⭐ 8,90€  PAGADO
  Champú x1, Mascarilla x1             Cera x1
  [Cobrar en TPV]                      [Entregar ✓]
```

- **Cobrar en TPV:** abre el TPV existente con la venta precargada (`/tpv?sale=<id>`). El
  personal cobra efectivo con el flujo actual → `completed`, ticket, arqueo; al terminar
  marca entrega.
- **Entregar:** `update` de `fulfillment_status='delivered'` (RLS de miembro existente).
  Desaparece de la pantalla.
- Aviso sonoro/visual opcional al entrar un pedido nuevo (patrón "Cocina" de 100M).

## 10. Tests

Vitest + BD real (como el resto del repo):

- **Unit:** carrito/totales (reusa `lib/payments/totals`), generación de `pickup_code`,
  selección de bridge, shaping del catálogo.
- **Integración contra BD:** `kiosk_create_order` (tarjeta→`completed`+pago+ref;
  efectivo→`open`; **idempotencia**; anónimo vs identificado; loyalty en tarjeta), validación
  de clave de dispositivo, feature-gate, `kiosk_get_catalog`.
- El `SumUpBridge` real se valida **a mano en la tablet** (no hay hardware en CI); el
  `MockPaymentBridge` cubre el flujo en tests/dev.

## 11. Alcance y no-objetivos (YAGNI)

**Dentro de v1:**
- Solo **productos de tienda** (nada de servicios/citas/bonos en el kiosko).
- Piloto **denueveanueve**, construido como **feature de Salón OS** (multi-salón desde el día
  1 vía feature flag + branding).
- Pago tarjeta (SumUp) y efectivo (cobro en mostrador vía TPV).
- Identificación opcional para fidelidad.

**Fuera de v1 (futuro):**
- Control de stock físico (el esquema de productos no lo lleva atado hoy).
- Devoluciones desde el kiosko.
- Envío de ticket por email (el impreso sí).
- Multi-idioma.
- Pasarela SumUp/Stripe/Redsys en servidor para pago online (distinto del presencial).

## 12. Orden de construcción sugerido

1. **Datos + RPCs:** migración (columnas `pos_sales` + enums + `pickup_code`), `kiosk_get_catalog`,
   `kiosk_create_order` (con tests de integración).
2. **Kiosko web + `PaymentBridge` (mock):** flujo completo en navegador con la pasarela simulada.
3. **Pantalla de pedidos del personal** (Realtime) + enlace "Cobrar en TPV".
4. **Carcasa Capacitor + `SumUpBridge`:** screen pinning + SDK, validación en tablet real.
5. **Feature-gate + branding + alta de denueveanueve** (feature `kiosk`, clave de dispositivo).

## 13. Dirección visual (aprobada 2026-07-31)

Cerrada con Jose tras iterar varias direcciones. Mockup navegable aprobado:
`docs/superpowers/specs/assets/2026-07-31-kiosko-liquid-glass-perla.html`.

- **Estilo: Liquid Glass** (recomendación de la base de diseño para retail de lujo/beauty):
  paneles de vidrio translúcido con `backdrop-filter` blur + una *aurora* de gradientes
  radiales en lento movimiento por detrás. Respeta `prefers-reduced-motion` (aurora estática).
- **Acabado: «Perla»** — oro rosa (`--accent:#a85462`) sobre nácar (`--bg:#ece5e9`). Se
  descartó el oscuro «Noche» (champán sobre negro), aunque queda como variante viable del
  mismo código (solo cambian los tokens de color).
- **Tipografía: Playfair Display (serif display) + Inter (UI/body)**. Nombres de producto y
  precios en Playfair; interfaz en Inter. En producción se cargan self-hosted (no CDN) o vía
  `next/font` para cumplir rendimiento; en el mockup local van por Google Fonts.
- **Composición: escaparate con héroe** (patrón «Feature-Rich Showcase»): barra de navegación
  de vidrio (marca + categorías + «Suma puntos») → **producto destacado** grande → fila de
  **galería** de producto → **barra de carrito** de vidrio con total + «Pagar con tarjeta» /
  «Efectivo».
- **Cajas de foto reservadas (requisito de Jose):** cada tarjeta y el héroe tienen un marco de
  imagen de **altura fija** con `overflow:hidden`; la foto real rellena con `object-fit:cover`
  y el **título/precio van siempre debajo**, sin superponerse. Las botellas de vidrio del
  mockup son solo *placeholder* hasta cargar las fotos reales de producto.
- **Branding por salón:** color y logo se sustituyen por los de cada salón vía `salon_branding`
  (los tokens `--accent`/`--bg` son el punto de inyección).
- Micro-interacciones: escala 0.9–0.97 al pulsar (botones/añadir), entrada escalonada de
  tarjetas. Todo interrumpible y con `prefers-reduced-motion`.
