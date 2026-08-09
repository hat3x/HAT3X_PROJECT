# Kairos · Restauración — Sub-proyecto 1: Carta + Venta de mostrador + KDS

**Fecha:** 2026-08-09
**Rama:** `feature/salon-os-multi-sector`
**Proyecto:** `clients/projects/salon-os` (Kairos — Next.js 14 App Router + TS strict + Supabase)
**Estado:** diseño aprobado (secciones 1-5), pendiente de plan de implementación.

---

## 1. Contexto y encuadre

Kairos es un SaaS multi-sector (peluquería / odontología / restauración). El sector
`restauracion` ya existe como declaración pero está marcado `implemented: false` y hoy cae en
la pantalla "Próximamente". Este documento diseña el **primer entregable real** del vertical
de restauración.

El PDF de referencia ("Kairos · Restauración — Qué hacer, paso a paso") describe un **programa
completo de 9-12 meses** (6 fases). Este spec **no** cubre ese programa: cubre solo el primer
sub-proyecto, elegido y acotado tras la conversación de brainstorming.

### Reencuadre clave respecto al PDF
El PDF asume construir desde cero. **Kairos no parte de cero.** Ya existe, genérico y probado:

- **TPV** con carrito, **pago mixto**, efectivo/tarjeta/bizum/transferencia, **cálculo de
  cambio** (`pos_sales`, `pos_sale_lines`, `pos_payments`, `pos_payment_methods`).
- **Turno de caja / arqueo / cierre** (`pos_sessions`, con descuadre).
- **Catálogo de productos** plano con **IVA por producto** y motor de desglose de IVA
  (21/10/4/0) en `src/lib/payments`.
- **Facturación** con series, desglose, QR y exportación (`src/lib/invoicing`; el encadenado
  VeriFactu está en el código pero **desactivado en BD** por decisión de producto).
- **Ticket térmico** por navegador (`src/lib/tpv`), fidelización, feature-flags y branding por
  salón, y el andamiaje **multi-sector** (registry + provider + guard + "Próximamente").

Por tanto no construimos "un TPV de restauración desde cero": construimos la **capa con forma
de restaurante** (carta con modificadores/combos + comandas + cocina) **encima del backbone de
TPV/fiscal existente**.

> **Nota — 100M:** el cliente real "100M" (100-montaditos) es un proyecto **separado**
> (`clients/projects/100-montaditos/`, stack Vite + Supabase + APK Capacitor). NO comparte
> código ni BD con Kairos. Se usa aquí como **carta-examen** para validar el modelo de datos
> (combos, alérgenos, ruteo comida→cocina / bebida→barra) y como posible piloto de migración
> futura, no como dependencia técnica.

---

## 2. Decisiones tomadas (brainstorming)

| Decisión | Elección | Implicación |
|---|---|---|
| **Formato** | Mostrador / barra | Reusa el grueso del TPV; camino más corto a "cobro real". |
| **Piloto** | Producto primero (patrón dental→Biodental) | Construir el módulo como MVP y onboardear cliente después; validar modelo contra la carta real de 100M. |
| **Offline** | Online, "offline-ready" por dentro | MVP online ahora; adoptar YA lo barato del diseño offline (append-only, IDs de cliente, idempotencia) para que el offline real sea aditivo, no una reescritura. |
| **Alcance v1** | Carta + Venta mostrador + **KDS** | Incluye pantalla de cocina en tiempo real desde el arranque. |
| **Flujos de venta** | Pagar-primero **y** cuenta abierta | Ambos salen del mismo modelo append-only; difieren solo en cuándo se paga. |
| **Modificadores** | Grupos con min/max y precio | Ej. "Punto de la carne" (obligatorio 1-1), "Extras" (0-N, con recargo). |
| **Combos** | Ruteo por pieza | Comida→cocina, bebida→barra, de serie (lección de 100M). |
| **Anulaciones** | Append-only con motivo | Nunca DELETE físico; regla del PDF ("nunca se borra un dato"). |
| **Carta online / QR mesa** | **Fuera de v1** — add-on a medida (sub-proyecto 5) | v1 deja el catálogo listo para alimentarla (alérgenos, foto, descripción, flag de canal). |

---

## 3. El programa completo (decomposición) — contexto, no alcance

Cada sub-proyecto es su propio ciclo spec → plan → build y deja software que funciona solo:

| # | Sub-proyecto | Reusa | Construye |
|---|---|---|---|
| **1** | **Carta + Venta mostrador + KDS** ← *este spec* | TPV, cobro, cambio, arqueo, IVA, ticket, facturación, Realtime | Carta con modificadores/combos, rejilla táctil, comandas, ruteo a estaciones, pantalla de cocina |
| 2 | *(absorbido en el 1: KDS entra ya)* | — | — |
| 3 | Hardware real | ticket térmico | ESC/POS directo, apertura de cajón, datáfono integrado (SumUp) |
| 4 | Kiosko de autopedido | spec kiosko existente | Adaptar a carta de restauración |
| 5 | Carta online / pedir desde mesa (QR) — **add-on a medida** | catálogo v1 | Canal online, aceptación, aviso; implementación a medida por restaurante |
| — | Sala/mesas/plano/reservas | — | Otro camino, si algún día |

---

## 4. Arquitectura

**Idea rectora: separar el modelo OPERATIVO del FISCAL.**

- El **pedido/comanda** es el mundo que vive rápido: cocina, estados, se corrige sobre la
  marcha, es append-only, nace con IDs de cliente. Tablas nuevas (`orders`, `order_items`).
- La **factura/arqueo** es el mundo fiscal, ya construido en Kairos (`pos_*`). No se toca.
- Se unen **al cobrar**: `settle_order` materializa un `pos_sale` desde el pedido y reusa
  cobro/cambio/arqueo/facturación.

Ventaja: reutilizamos todo el backbone fiscal sin ensuciarlo, y el modelo operativo puede
tener la forma append-only/offline-ready que necesita sin arrastrar restricciones fiscales.

Convención transversal: **dinero en céntimos**, modelo **PVP (IVA incluido)**, como el resto
de Kairos.

---

## 5. Modelo de datos

Todas las tablas llevan `salon_id` y RLS por salón. Migraciones nuevas en
`clients/projects/salon-os/supabase/migrations/`. Se aplican vía Management API (User-Agent de
navegador).

### 5.1 Carta (cimiento)
Reusamos `products` como **ítem vendible atómico** (ya trae `price_cents`, `vat_rate`, y lo
conocen TPV/facturación). Se le añade la estructura de restaurante:

- **`menu_categories`** — `(id, salon_id, name, sort_order, active)`. Categoría real (hoy
  `products` no tiene ni campo de categoría). Se añade `products.category_id` (FK).
- **`stations`** — centros de producción `(id, salon_id, name, type, sort_order, active)`.
  `type` ∈ {cocina, barra, plancha, horno, postres, …} (texto libre validado por el salón).
  Se añade `products.station_id` (FK, estación por defecto del producto).
- **`modifier_groups`** — `(id, salon_id, name, min_select, max_select, required, sort_order)`.
- **`modifiers`** — `(id, group_id, name, price_delta_cents, sort_order, active)`.
- **`product_modifier_groups`** — N:M `(product_id, group_id, sort_order)`: qué grupos aplican
  a cada producto.
- **`combo_components`** — un combo es un `product` marcado como combo; sus piezas se listan
  aquí `(id, combo_product_id, component_product_id, qty, station_id_override)`. El
  `station_id_override` permite el ruteo por pieza (comida→cocina, bebida→barra).
- Enriquecimiento del catálogo para futuro add-on online (barato, exigido igual por el PDF):
  `products.image_url`, `products.description`, **alérgenos** (los 14 del Reglamento UE
  1169/2011, como lista cerrada — tabla `product_allergens` o array validado), y un **flag de
  disponibilidad por canal** (`products.channels` o `product_channels`). **Precios
  diferenciados por canal quedan FUERA de v1** (v1 = un precio por producto).

### 5.2 Pedido / comanda (operativo, offline-ready)
- **`orders`** — `(id UUID [generado en cliente], salon_id, session_id, order_number, label,
  channel='mostrador', status, idempotency_key, created_at, created_by)`.
  - `status` ∈ {abierta, cobrada, cerrada, anulada}.
  - `label` — etiqueta de cuenta abierta ("Cuenta 3", un nombre…). Nullable.
  - `idempotency_key` — único por salón; reintentos no duplican pedidos.
- **`order_items`** — líneas **append-only** `(id UUID, order_id, product_id, qty,
  unit_price_cents, station_id, status, combo_group, modifiers_snapshot jsonb,
  void_of_item_id, void_reason, created_at, created_by)`.
  - `status` (por ítem) ∈ {pendiente, enviado, preparando, listo, entregado, anulado}.
  - **Append-only**: nunca se edita `qty`; anular = insertar línea con `void_of_item_id` +
    `void_reason` (requiere permiso). El estado sí transiciona (es la única mutación).
  - `combo_group` — agrupa las piezas de un combo para mostrarlas juntas en caja aunque
    enruten a estaciones distintas (patrón de 100M).
  - `modifiers_snapshot` — copia de los modificadores elegidos (nombre + precio) para que la
    comanda sea fiel aunque la carta cambie luego.
- **Enlace fiscal**: al cobrar, `settle_order` crea un `pos_sale` (+ líneas + pagos) y guarda
  `pos_sales.order_id`. El pedido pasa a `cobrada`.

### 5.3 KDS
La pantalla de cocina lee `order_items` filtrados por `station_id` + `status` ∈
{pendiente, enviado, preparando, listo}, en **tiempo real** (Supabase Realtime). Cronómetro
desde `created_at`. "Entregar" y "Entregado" son transiciones de estado.

> ⚠️ **Gotcha conocido:** hay que **añadir las tablas nuevas a la publicación
> `supabase_realtime`** (`ALTER PUBLICATION supabase_realtime ADD TABLE ...;`) o el Realtime no
> dispara. El RLS de Realtime usa la política SELECT del usuario.

### 5.4 Seguridad (RLS — reusa el patrón dental)
- **SELECT miembros**: `app.user_salon_ids()` (miembros ven lo de su salón).
- **Gestión de carta** (INSERT/UPDATE/DELETE en categorías, productos, modificadores, combos,
  estaciones): solo `owner`/`manager` vía
  `app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])`.
- **Operativa** (crear pedidos, añadir líneas, mover estados de ítems): cualquier miembro
  (`staff` incluido).
- **Anulación**: requiere permiso (staff con autorización / manager) — se modela como política
  + motivo obligatorio.
- **Guardián `DO`** en cada migración (verifica que las políticas quedaron creadas).

---

## 6. Flujo de venta y cocina

1. **Turno**: si no hay `pos_session` abierta, se abre (reusa arqueo existente).
2. **Rejilla**: categoría → producto. Con grupos de modificadores → mini-diálogo (elige punto,
   extras, respetando min/max). Combo → se expande en sus piezas con su ruteo. Se añade a
   `order_items` (UUID de cliente).
3. **Dos flujos** (misma base append-only, difieren en cuándo se paga):
   - **Pagar-primero** (por defecto en mostrador): un toque en **Cobrar** ejecuta, en una sola
     acción idempotente: cobro → `send_order_to_stations` → `settle_order` (materializa
     `pos_sale`) → impresión.
   - **Cuenta abierta**: **Mandar** (`send_order_to_stations`) enruta las líneas a cocina/barra
     dejando el pedido `abierta`; se pueden **añadir más líneas** en tandas; al final,
     **Cobrar** materializa el `pos_sale`. Una **lista de cuentas abiertas** permite reabrir,
     añadir y cobrar.
4. **Impresión**: ticket de cliente (térmico navegador, reusa) + comanda por estación. Con KDS,
   además aparece en pantalla (la pantalla es el respaldo si falla la impresión).
5. **Cocina (KDS)**: columnas por estación, cronómetro. **"Entregar"** = marca `listo` + avisa;
   **"Entregado"** = cierra la línea (labels calibrados en 100M).
6. **Anular** = línea de anulación con motivo (append-only); requiere permiso.
7. **Cierre**: arqueo / cierre Z reusa `pos_sessions`; informe del día reusa lo existente +
   **desglose por estación/categoría**.

---

## 7. Componentes y pantallas

Todo dentro de `(dashboard)`, visible solo cuando el sector del salón es `restauracion` y el
feature-flag correspondiente está activo.

| Pantalla | Ruta | Qué hace | Rol |
|---|---|---|---|
| **Backoffice de carta** | `/carta` | CRUD categorías, productos (foto/descripción/alérgenos/IVA/estación/canales), grupos de modificadores, combos, estaciones. **+ importador CSV** (valido contra 100M). | owner/manager |
| **Mostrador (rejilla)** | `/mostrador` | Táctil: categoría→producto→modificadores→pedido. Botones **Mandar** y **Cobrar**. Selector de cuenta abierta. | staff |
| **Cuentas abiertas** | panel en `/mostrador` | Lista de pedidos `abierta`: reabrir, añadir, cobrar. | staff |
| **Cocina (KDS)** | `/cocina` | Por estación, Realtime, columnas, cronómetro, Entregar/Entregado. Modo pantalla grande. | staff |
| *Reuso sin tocar* | `/arqueo`, `/facturacion` | Cierre de caja, tickets/facturas. | — |

**Capa servidor** (patrón Kairos):
- Migraciones nuevas: carta + `orders`/`order_items` + publicación Realtime.
- **RPCs `SECURITY DEFINER` idempotentes**: `create_order`, `add_order_items`,
  `send_order_to_stations`, `set_order_item_status`, `settle_order` (materializa `pos_sale`).
- Server actions + hooks React Query (`use-menu`, `use-order`, `use-open-orders`, `use-kds`).
- Registry: `restauracion.implemented = true` + módulos en la nav; feature-flags en
  `salon_features` (`restauracion_mostrador`, `kds`).

---

## 8. Alcance (blindaje)

### ✅ DENTRO de v1
Carta (categorías, productos con foto/descripción/alérgenos/IVA/estación/flag-de-canal, grupos
de modificadores con min/max y precio, combos con ruteo por pieza, estaciones, importador CSV);
mostrador (rejilla táctil, pedido append-only con UUID cliente + idempotencia, modificadores,
combos, anular con motivo); dos flujos (pagar-primero y cuenta abierta con estados/Mandar/lista
de cuentas/etiqueta); cobro (reusa efectivo/tarjeta/bizum/mixto/cambio → materializa
`pos_sale`); comanda impresa por estación + ticket cliente; KDS Realtime; cierre/arqueo +
informe del día con desglose por estación/categoría; activación del sector + feature-flags;
todo offline-ready por dentro (append-only, UUID cliente, idempotencia) **sin motor de sync**.

### ⛔ FUERA de v1 (diferido)
Offline **real** (BD local + sincronización); hardware ESC/POS directo, apertura de cajón,
datáfono integrado SumUp (sub-p. 3); **producto a peso / balanza / lector de código de barras**
(cuando haya un piloto que lo pida); login por **PIN** de 4 dígitos y cambio rápido de usuario
(v1 reusa el login ID+contraseña actual); **carta online / QR mesa** (sub-p. 5, a medida);
kiosko de restaurante (sub-p. 4); mesas / plano de sala / reservas de sala; reactivación de
VeriFactu (sigue off por decisión de producto hasta que la ley obligue); **precios
diferenciados por canal** (el *campo* de canal entra; precios distintos por canal, no).

---

## 9. Errores y robustez

- **Idempotencia** en `create_order`/`settle_order` (reintentos con red intermitente no
  duplican pedidos ni cobros) — vía `idempotency_key`.
- **Concurrencia KDS**: `set_order_item_status` seguro entre dos empleados marcando el mismo
  ítem (transición condicionada al estado esperado).
- **Combos con línea a 0 €**: la pieza interna del combo puede valer 0 € — el CHECK de precio
  debe ser `>= 0` (lección de 100M: un CHECK `> 0` abortaba el pedido completo). Contemplado de
  serie.
- **Anulación**: solo con motivo + permiso; nunca DELETE físico.
- **Realtime**: recordar `ALTER PUBLICATION supabase_realtime ADD TABLE ...` para cada tabla
  nueva que deba emitir.
- **Fallo de impresión**: la comanda no se pierde en silencio (regla del PDF); con KDS, la
  pantalla es el respaldo. El reintento/confirmación de impresión física queda para el
  sub-proyecto 3 (hardware).

---

## 10. Testing (TDD, Vitest + Testing Library, contra BD real — patrón Kairos)

- **Unit**: cálculo de totales con modificadores + combos + IVA; ruteo de líneas a estación
  (incl. ruteo por pieza de combo); transiciones de estado de ítem; idempotencia.
- **Integración**: crear pedido → mandar → cobrar → materializa `pos_sale` → **el arqueo
  cuadra**; cuenta abierta (añadir en dos tandas) → cobrar; anulación con motivo.
- **RLS**: staff crea pedidos y mueve estados pero **no** gestiona carta; manager/owner sí;
  aislamiento estricto por salón.

---

## 11. Criterios de aceptación (puertas de control de v1)

- [ ] Un `owner` carga la carta completa de 100M por CSV (con combos, modificadores y
      alérgenos) sin campos "notas" improvisados; el modelo la acepta limpia.
- [ ] Se cobra un pedido con un combo (comida→cocina + bebida→barra) y las líneas aparecen en
      la estación correcta del KDS.
- [ ] Flujo cuenta abierta: se abre una cuenta, se añaden líneas en dos tandas, se cobra al
      final y el `pos_sale` resultante cuadra en el arqueo.
- [ ] Anular una línea deja rastro (motivo + usuario), nunca la borra.
- [ ] El KDS refleja en tiempo real un pedido creado desde otra pantalla.
- [ ] Un usuario `staff` no puede editar la carta; un `manager` sí.
- [ ] `tsc` a 0 y suite verde.

---

## 12. Riesgos y decisiones abiertas

- **Cuenta abierta = semilla de sala.** Introducir cuentas abiertas nos acerca al servicio de
  mesa. Es deseable (Jose lo pidió), pero hay que vigilar no derivar hacia "mesas" sin querer:
  en v1 una cuenta abierta es solo una etiqueta, no una mesa con plano.
- **Reuso de `products` vs tablas nuevas.** Se decide reusar `products` como ítem atómico. Si
  la carga de la carta de 100M revela que el modelo se fuerza, se replantea en la fase de plan
  (regla del PDF: si algo no entra sin forzarlo, el modelo está mal — corregir en la hoja/plan,
  que es gratis).
- **VeriFactu.** Sigue desactivado por decisión. El argumento comercial del PDF (fecha límite
  2027) es real; cuando se reactive será su propio sub-proyecto, y el diseño fiscal actual
  (numeración por serie + snapshots) facilita reintroducir el encadenado por hash.
