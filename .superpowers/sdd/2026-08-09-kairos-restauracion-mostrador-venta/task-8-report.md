# Task 8 — UI de mostrador (`/mostrador`) — Informe

**STATUS: COMPLETADO**
**Commit:** `f3b8098a6aff64ebed235a3c03b74daa2e4023a2` (rama `hat3x/HAT3X-038`, repo anidado `clients/projects/salon-os`)
**Tests:** `npm test -- order-panel` → 4/4 verdes · `npm test` (suite completa) → 141 ficheros / 1859 tests verdes · `npm run typecheck` → exit 0.

---

## 1. Ficheros

### Creados en `src/app/(dashboard)/mostrador/`
| Fichero | Rol |
|---|---|
| `layout.tsx` | `SectorGate required="restauracion"`, SIN gate de rol (staff vende). |
| `page.tsx` | Resuelve sesión + `getActiveSalon()` (patrón `products/page.tsx`), pasa `salonId`+`salonName` a la vista. |
| `mostrador-view.tsx` | `"use client"`. Orquestador: estado local del pedido en curso, wiring de los 4 subcomponentes. |
| `product-grid.tsx` | Categorías (pestañas) + rejilla de productos (`useMenuCategories`/`useMenuProducts`), buscador, decide alta directa vs abrir el selector. |
| `order-panel.tsx` | Líneas + total (`settleTotals`) + botones **Mandar**/**Cobrar**; orquesta las mutaciones de `@/hooks/use-orders` y la impresión. |
| `modifier-picker-dialog.tsx` | Cantidad + grupos de modificadores (min/max) + piezas de combo (informativo) → produce un `MenuSelection`. |
| `open-orders-bar.tsx` | `useOpenOrders` → chips de cuentas abiertas + "Cuenta nueva". |
| `payment-sheet.tsx` | Diálogo de cobro: tenders + cambio, patrón `tpv/payment-dialog.tsx`. |

### Test
`src/tests/unit/order-panel.test.tsx` — 4 casos: renderiza líneas + total (`settleTotals`), botones Mandar/Cobrar presentes, clic en Cobrar abre el flujo de pago (aparece "Confirmar cobro"), y con pedido vacío ambos botones quedan deshabilitados.

### Extendidos (hooks/queries de lectura, sin tocar `actions.ts`)
- `src/lib/queries/menu.ts`: + `fetchAllProductModifierGroups(salonId)` (todas las asignaciones producto↔grupo del salón de una vez, para decidir por botón de la rejilla si hay que abrir el selector) y `fetchModifierOptionsForGroups(salonId, groupIds)` (opciones de varios grupos a la vez, para el diálogo).
- `src/hooks/use-menu.ts`: + `useAllProductModifierGroups(salonId)` y `useModifierOptionsForGroups(salonId, groupIds)`, envoltorios `useQuery` de lo anterior. No se tocó ningún hook/export existente.

No se modificó `mostrador/actions.ts` ni ninguna otra server action — solo lectura nueva.

---

## 2. Decisiones de UI

- **Rejilla de categorías**: pestañas tipo "segmented control" (mismo patrón visual que `SegmentTab` de `tpv-view.tsx`) en vez del componente `Tabs` de Radix — evita el coste de montar `TabsContent` por categoría cuando lo que cambia es solo un filtro sobre la misma rejilla. El brief permitía "Tabs/botones grandes".
- **Alta directa vs selector**: al tocar un producto, `product-grid` consulta el mapa `productId → groupIds[]` (de `useAllProductModifierGroups`); si el producto NO es combo y no tiene grupos asignados, se añade con cantidad 1 sin abrir diálogo (flujo rápido, p. ej. "Caña"); si es combo o tiene grupos, se abre `modifier-picker-dialog`.
- **`modifier-picker-dialog`**: grupos con `max_select <= 1` se comportan como selección única (un segundo toque deselecciona); grupos con `max_select > 1` bloquean nuevas selecciones al llegar al máximo. El botón "Añadir al pedido" se deshabilita hasta que todos los grupos cumplen su `min_select`. Las piezas de combo se muestran informativas (no elegibles) — el combo se compone según `combo_components`.
- **Total con NBSP**: `formatMoney` (Intl es-ES) separa el importe del símbolo € con un espacio *non-breaking* (U+00A0). Descubrí en el propio TDD que `@testing-library/dom` normaliza el texto del DOM pero **no** el string que se le pasa como matcher (`matches()` compara `normalizedText === String(matcher)` sin normalizar el segundo lado) — así que el test normaliza a mano el NBSP a espacio antes de buscarlo. Documentado con comentario en el test para que no se repita el rodeo en otros tests del proyecto.

---

## 3. Los dos flujos, cableado exacto

### Estado local (`mostrador-view.tsx`)
- `items: OrderPanelItem[]` — TODAS las líneas del pedido en curso (persistidas + nuevas), cada una con su `name` ya resuelto (para pintar/imprimir sin recompletar contra el catálogo).
- `pendingIds: Set<string>` — ids de `items` que aún NO están en BD.
- `order: Order | null` — fila del pedido una vez creado (o el seleccionado desde `OpenOrdersBar`).
- Al **reabrir una cuenta** (clic en un chip de `open-orders-bar`), se resetea `loadedOrderIdRef` y se dispara `useOrderItems(salonId, order.id)`; un `useEffect` (guardado por ese ref, para no recargar dos veces el mismo pedido) mapea las filas `order_items` (excluyendo `status: "anulado"` y anulaciones `void_of_item_id != null`, mismo criterio que `settleOrder`) a `OrderPanelItem[]` y vacía `pendingIds` (todo ya persistido).
- Cuando `OrderPanel` crea el pedido en el primer Mandar/Cobrar (`onOrderPersisted`), el ref se marca con ese id ANTES de `setOrder` — evita que el `useEffect` de arriba sobrescriba con un array vacío las líneas que se acaban de añadir localmente (hay una ventana de carrera real ahí: la query de `useOrderItems` para el pedido recién creado resuelve vacía antes de que `addOrderItems` complete).

### Mandar (`order-panel.tsx :: handleSend`)
1. Si `order === null`: genera `id = crypto.randomUUID()`, `useCreateOrder().mutateAsync({ id, label: null, idempotencyKey: id })`, informa a la vista (`onOrderPersisted`).
2. `useAddOrderItems().mutateAsync({ orderId, items: pendingItems })`.
3. `useSendOrderToStations().mutateAsync({ orderId })`.
4. `printKitchenComanda` una vez por estación, agrupando `pendingItems` por `stationId` (comida→cocina, bebida→barra según `station_id`/`station_id_override` del producto/pieza).
5. `onItemsSent()` vacía `pendingIds` (las líneas quedan "ya mandadas"); el pedido queda ABIERTO (no se cobra).

### Cobrar (`order-panel.tsx :: handleConfirmPayment`, vía `payment-sheet`)
1. Abre `PaymentSheet` con el total (`settleTotals`).
2. Al confirmar: crea el pedido si no existe; si hay `pendingItems` (líneas sin mandar → **pagar-primero**), las añade con `addOrderItems` ANTES de cobrar.
3. `useSettleOrder().mutateAsync({ orderId, tenders, sendPending: true })` — `sendPending: true` SIEMPRE: si es "cerrar cuenta" (nada pendiente) no hace nada; si es "pagar-primero", el propio `settleOrder` server-side manda las líneas recién añadidas a estación tras cobrar (§10 de `mostrador/actions.ts`).
4. Imprime el ticket de cliente (`buildTicketData` + `printTicketDocument`, reusando el documento térmico del TPV) con las líneas resueltas (`buildSettleLines`) adaptadas al formato `TicketLine`/`TicketTotals`.
5. Si era pagar-primero, TAMBIÉN imprime la(s) comanda(s) por estación (igual que Mandar).
6. `onSettled()` resetea la vista a una cuenta nueva vacía.

### `payment-sheet.tsx` — cuadre exacto de `settleOrder`
`settleOrder` exige `Σ tenders.amountCents === totalCents` EXACTO. Cada fila de cobro separa:
- **Efectivo**: `amount` tecleado = lo que el cliente ENTREGA; el `amountCents` enviado (`appliedCents`) se topa al importe pendiente en el momento de aplicar esa fila; el sobrante se muestra como "Cambio" bajo la fila y en el resumen agregado — nunca se envía el efectivo entregado si excede el total.
- **Resto de medios** (tarjeta/bizum/transferencia/otro): lo tecleado se aplica tal cual, sin concepto de cambio (igual que el TPV).
- "Confirmar cobro" solo se habilita cuando `Σ appliedCents === totalCents` exacto.

---

## 4. Impresión

- **Comanda de cocina**: `printKitchenComanda` (`@/lib/restauracion/kitchen-comanda`), una llamada por estación con las líneas agrupadas (`stationId` de cada `OrderItemDraft`, incluidas las piezas de combo con su estación resuelta vía `station_id_override ?? station_id` del producto pieza).
- **Ticket de cliente**: `printTicketDocument` + `buildTicketData` (`@/app/(dashboard)/tpv/print-ticket`), reutilizando el documento térmico del TPV sin duplicar HTML/CSS. Las líneas del mostrador (`OrderItemDraft`, céntimos/números) se adaptan al formato `TicketLine` del TPV (texto en euros) solo para ese propósito de impresión; los cálculos reales de negocio siguen pasando por `settleTotals`/`buildSettleLines` de `@/lib/restauracion/order`, no por la aritmética del TPV.

---

## 5. Tests y verificación

- TDD real: el test se escribió primero, falló (`Failed to resolve import ".../order-panel"`), y solo entonces se implementó `OrderPanel`+`PaymentSheet` hasta ponerlo en verde.
- `npm test -- order-panel` → 4/4.
- `npm test` (suite completa del proyecto) → **141 ficheros, 1859 tests, todos verdes** (nada se rompió en `use-menu.ts`/`queries/menu.ts` por las dos consultas añadidas).
- `npm run typecheck` → exit 0 (un error intermedio de tipos — `ComboPiece` se importaba desde `@/lib/restauracion/order`, que no lo reexporta; el tipo vive en `@/lib/restauracion/menu` — se corrigió antes del commit).

---

## 6. Preocupaciones / lo que dejo abierto

1. **No hay UI de anulación de línea (`voidOrderItem`)** en `/mostrador`. La action existe (Task 4) pero el brief de esta tarea no la mencionaba como parte del flujo; si se quiere, es un botón más por línea en `order-panel.tsx` que ya tiene todo el contexto (`orderId`, `itemId`) a mano.
2. **`modifier-picker-dialog` no permite elegir piezas alternativas de un combo** — las piezas se muestran informativas, tal como las define `combo_components`. Si en el futuro se quieren combos configurables (p. ej. elegir la bebida), es una extensión de este mismo diálogo.
3. **`open-orders-bar` no distingue visualmente cuentas con líneas pendientes de mandar vs ya enviadas** — solo muestra `#número` + `label`. Suficiente para el alcance de esta tarea, pero un futuro indicador (p. ej. un punto de color) mejoraría la UX de un turno con varias mesas.
4. **`OrderPanel` asume que `settleOrder`/`addOrderItems`/`sendOrderToStations` invalidan correctamente la caché de React Query** (ya lo hacen, ver `use-orders.ts`) — no se testeó la integración end-to-end contra Supabase real, solo el contrato de UI vía mocks (fuera del alcance del test pedido).
5. **Gotcha documentado para el equipo**: `@testing-library/dom`'s `getByText(string)` NO normaliza el string que se le pasa como matcher (solo el texto del DOM) — cualquier assertion futura contra `formatMoney(...)` (que usa NBSP) necesita el mismo tratamiento que en `order-panel.test.tsx` (`moneyText()` helper) o usar un matcher por función/regex.

---

## 7. Ronda de fix (2026-08-10) — carrera al cambiar de cuenta + tender fantasma

**Commit:** `0b1d2709fc0a9193c35a20a45c1dc6387027305c` (misma rama).
**Tests:** `npm test -- payment-sheet order-panel` → 7/7 verdes (3 nuevos + 4 existentes) · `npm test` completo → **142 ficheros, 1862 tests verdes** · `npm run typecheck` → exit 0.

### Fix 1 — carrera al cambiar de cuenta abierta (`mostrador-view.tsx`)

`handleSelectOrder` solo reseteaba `loadedOrderIdRef` y hacía `setOrder(selected)`, sin limpiar `items`/`pendingIds` de forma síncrona (a diferencia de `handleNewOrder`). En la ventana hasta que `useOrderItems` resolvía para la cuenta B, `order.id` ya apuntaba a B mientras `items`/`pendingIds` seguían siendo los de A — un Mandar/Cobrar en esa ventana habría cargado las líneas de A contra el `orderId` de B.

Arreglo: `handleSelectOrder` ahora limpia `items`/`pendingIds` de forma SÍNCRONA (mismo patrón que `handleNewOrder`) ANTES de `setOrder(selected)`, así que en cuanto se pulsa el chip de la cuenta B, el panel queda vacío hasta que el `useEffect` cargue sus líneas reales. Esto también cubre la mejora opcional pedida ("deshabilitar Mandar/Cobrar mientras carga"): con `items = []`, `OrderPanel` deshabilita Cobrar (`items.length === 0`) y Mandar (`pendingItems.length === 0`, ya que las líneas recién cargadas nunca entran en `pendingIds`) durante toda la ventana de carga — no hizo falta plumbing adicional.

### Fix 2 — tender fantasma de 0€ (`payment-sheet.tsx`)

`addRow()` siembra una fila con `amount: ""` cuando `remainingCents <= 0` (el total ya estaba cubierto); el gate `covered` solo mira el AGREGADO (`remainingCents === 0`), así que se podía confirmar con esa fila vacía de por medio → un tender `amountCents: 0` que `settleTenderSchema` (exige `amountCents` entero positivo) rechazaría en el servidor.

Arreglo: `handleConfirm` ahora filtra las filas con `amountCents <= 0` ANTES de construir el array que se pasa a `onConfirm` — ninguna fila fantasma llega como tender. El gate de habilitación de "Confirmar cobro" sigue mirando el agregado (`covered`), sin cambios ahí: sigue permitiendo confirmar con una fila vacía de sobra, pero esa fila ya no viaja en el payload.

### Test nuevo — `src/tests/unit/payment-sheet.test.tsx`

Sin mocks de hooks (el componente recibe todo por prop) — 3 casos:
1. Efectivo que EXCEDE el total (20,00€ entregados sobre un total de 12,34€): el tender que llega a `onConfirm` es `{ method: "efectivo", amountCents: 1234, paymentMethodId: null }` — el importe TOTAL, nunca el efectivo entregado — y se verifica que aparece el texto "Cambio" junto al importe del exceso (7,66€), buscado por `textContent` (no `getByText` exacto: el nodo combina "Cambio: " + el importe en el mismo elemento, y el resumen agregado combina "Cobro cuadrado · cambio" + importe también).
2. "Confirmar cobro" deshabilitado con un importe por debajo del total (5,00€ sobre 10,00€) y habilitado al llegar exactamente al total.
3. Reproduce el bug del tender fantasma: fila inicial cubre el total exacto, se pulsa "Añadir otro medio de pago" (siembra la fila vacía de `addRow`), se confirma, y se verifica que `onConfirm` recibe SOLO 1 tender (no 2), con `amountCents > 0` en todas las filas y una suma EXACTA al total — confirma el fix 2 end-to-end vía la UI.

### Test de la carrera de cuentas (`mostrador-view.tsx`) — no incluido, documentado aquí

Siguiendo la guía del coordinador ("si `mostrador-view` es difícil de montar por los muchos hooks, prioriza el test de `payment-sheet`... y deja el de la carrera como aserción mínima o coméntalo en el report"): `mostrador-view.tsx` depende de 6 hooks distintos (`useMenuProducts`, `useStations`, `useModifierGroups`, `useAllProductModifierGroups`, `useOrderItems`, `useSalePaymentMethods` — de dos módulos distintos, `@/hooks/use-menu` y `@/hooks/use-tpv`, más `useOrderItems` de `@/hooks/use-orders`) y a su vez monta `OrderPanel` (que añade sus propios 4 hooks de mutación). Mockear todo ese árbol solo para verificar una limpieza de estado local de dos líneas (`setItems([])`/`setPendingIds(new Set())`) tenía un coste de mantenimiento desproporcionado frente al valor marginal, dado que el propio código del fix es trivial de auditar a simple vista (dos líneas nuevas, antes de `setOrder`, con comentario explicando la ventana de carrera que cierran) y `payment-sheet.test.tsx` ya cubre la zona de mayor riesgo real (dinero). Priorizado tal como indicó el coordinador.
