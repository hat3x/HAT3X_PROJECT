# Kairos · Restauración — Servicio de sala: Mesas + Plano (spec)

**Fecha:** 2026-08-10
**Rama:** `feature/salon-os-multi-sector` (código en repo anidado `clients/projects/salon-os`, rama `hat3x/HAT3X-038`)
**Estado:** diseño aprobado (brainstorming), pendiente de plan de implementación.

---

## 1. Contexto

El vertical de restauración de Kairos ya tiene el **servicio de mostrador** completo (sub-proyecto 1: Carta + Venta + KDS). Este spec añade el **servicio de SALA**: un **plano de mesas** por zonas donde el personal abre mesas, ve la comanda y el tiempo de cada una, y cobra — reutilizando el pedido, la cocina (KDS) y el cobro ya construidos.

El servicio de sala se decidió (brainstorming) como **dos sub-proyectos encadenados**: **(A) Mesas / plano de sala** (este spec) y **(B) Reservas** (siguiente). Reservas se apoya en las mesas de aquí.

### Decisiones tomadas (brainstorming)
| Decisión | Elección |
|---|---|
| Orden | **Mesas / plano primero**; reservas después. |
| Tipo de plano | **Plano espacial arrastrable** (mesas colocadas en un lienzo como en el local real), no una simple rejilla. |
| Panel de mesa | Tocar una mesa → ver **comanda, tiempo sentados (cronómetro), total, nº de comensales, estado** + acciones. Extensible. |
| Reuso | El pedido (rejilla mostrador), la cocina (KDS `/cocina`) y el cobro (`settleOrder`) se reutilizan tal cual. |
| Estados de mesa | `libre` / `ocupada` / `cuenta_pedida` / `por_limpiar`. |
| Dividir cuenta / unir-separar-traspasar mesa | **Fuera de v1** (v1.1). |

---

## 2. Reencuadre / reuso

La sala **no reimplementa** ni el pedido ni el cobro ni la cocina. **Abrir una mesa = abrir una cuenta** (`orders`, como en mostrador) pero **atada a una mesa**. A partir de ahí:
- **Pedir** en la mesa = la rejilla de mostrador (`/mostrador`) con la cuenta de esa mesa → líneas a estaciones → **KDS `/cocina`** (ya hecho).
- **Cobrar** la mesa = `settleOrder` → `pos_sale` que cuadra en arqueo (ya hecho).

Lo **nuevo** de este sub-proyecto: **zonas + mesas con posición en un plano**, el **estado de mesa**, el **panel de mesa** (comanda + tiempo + total + comensales), y el **plano en tiempo real**.

---

## 3. Modelo de datos

Tablas nuevas con `salon_id` + RLS por salón. FKs de dominio **compuestas** `(fk_id, salon_id) → tabla(id, salon_id)`. Migraciones vía Management API (User-Agent navegador; ref `jztoyekixcziaicrnlce`).

### 3.1 `dining_zones`
`(id, salon_id, name, sort_order, active, created_at, updated_at)`. Ej.: Salón, Terraza, Barra. `unique (salon_id, name)`, `constraint dining_zones_id_salon_key unique (id, salon_id)`.

### 3.2 `dining_tables`
`(id, salon_id, zone_id, name, capacity_min, capacity_max, pos_x, pos_y, shape, status, sort_order, active, created_at, updated_at)`:
- `zone_id` — FK compuesta a `dining_zones`.
- `name` — número/nombre de la mesa ("M1", "T4"). `unique (salon_id, name)`.
- `capacity_min` / `capacity_max` — integer, `check (capacity_min >= 1 and capacity_max >= capacity_min)`.
- `pos_x`, `pos_y` — `numeric` (posición en el lienzo, p.ej. porcentaje 0–100). Editables arrastrando.
- `shape` — enum `table_shape ('round','square')` (default 'square').
- `status` — enum `table_status ('libre','ocupada','cuenta_pedida','por_limpiar')`, default `'libre'`.
- `constraint dining_tables_id_salon_key unique (id, salon_id)`.

### 3.3 Enlace con el pedido (columnas nuevas en `orders`)
- `orders.dining_table_id` (nullable) — FK compuesta a `dining_tables(id, salon_id)`. `null` para mostrador/QR. La **comanda de la mesa** = el `orders` abierto con ese `dining_table_id`.
- `orders.covers` (integer, nullable) — nº de comensales (se fija al abrir la mesa).

### 3.4 Estados y transiciones (máquina)
`libre → ocupada` (abrir mesa) → `cuenta_pedida` (pedir cuenta) → `por_limpiar` (tras cobrar) → `libre` (limpiar). También `ocupada → por_limpiar` (cobrar sin pedir cuenta antes). Una mesa `ocupada`/`cuenta_pedida` tiene exactamente **una** cuenta abierta enlazada; `libre`/`por_limpiar` no tienen cuenta abierta.

### 3.5 RLS
- **SELECT**: miembros (`salon_id in (select app.user_salon_ids())`).
- **Gestión de layout** (crear/borrar zonas y mesas, renombrar, capacidad): `owner`/`manager` (`app.has_salon_role`). En la práctica el **modo edición del plano** solo se ofrece a owner/manager.
- **Operativa** (abrir mesa, cambiar `status`, mover posición): cualquier miembro (`staff`). Guardián `do $guard$`.

---

## 4. Flujo en `/sala`

1. **Vista de plano** (por zona, tiempo real): las mesas se dibujan en su `pos_x`/`pos_y`, con **color por `status`** (libre=neutro, ocupada=activo, cuenta_pedida=ámbar, por_limpiar=gris). Selector de zona.
2. **Mesa libre** → *Abrir mesa* (pide nº de comensales) → crea `orders` (channel `'mesa'`, `dining_table_id`, `covers`, `label` = nombre de mesa, status `abierta`); mesa → `ocupada`.
3. **Mesa ocupada/cuenta_pedida** → **panel de mesa**:
   - **Comanda** (líneas del pedido de la mesa — reusa `useOrderItems`).
   - **Tiempo sentados** (cronómetro desde `orders.created_at` — reusa `elapsedMinutes` de `lib/restauracion/kds.ts`).
   - **Total** (reusa `settleTotals`), **comensales**, **estado**.
   - Acciones: **Añadir** (abre la rejilla de pedido para esa mesa → `addOrderItems` + `sendOrderToStations` → KDS), **Pedir cuenta** (→ `cuenta_pedida`), **Cobrar** (`settleOrder` → mesa `por_limpiar`), **Limpiar** (→ `libre`).
4. **Modo edición** (owner/manager): arrastrar mesas para fijar `pos_x`/`pos_y`, añadir/quitar mesas, crear zonas, capacidad y forma. Se guarda al soltar.

---

## 5. Componentes

Todo bajo `(dashboard)`, sector restauración, visible a **staff** (sin gate de rol para operar; el modo edición se gatea a owner/manager).

| Pieza | Ruta / fichero | Qué hace |
|---|---|---|
| **Plano de sala** | `(dashboard)/sala/{layout,page,sala-view}.tsx` | Lienzo por zona, mesas por color, Realtime, modo edición. |
| **Nodo de mesa** | `sala/table-node.tsx` | Ficha de mesa (posición, forma, color, arrastrable en edición). |
| **Panel de mesa** | `sala/table-panel.tsx` | Comanda + cronómetro + total + comensales + acciones. |
| **Editor de plano** | `sala/floor-editor.tsx` (o modo dentro de sala-view) | Arrastrar/añadir/quitar mesas y zonas (owner/manager). |
| **Datos/servidor** | `queries/tables.ts`, `hooks/use-tables.ts`, `sala/actions.ts` | fetch zonas/mesas + estado; `openTable`, `setTableStatus`, `saveTablePosition`, CRUD de zonas/mesas. |
| **Lógica pura** | `lib/restauracion/tables.ts` | Transiciones de estado válidas, derivación de estado, validación de posición/capacidad. |
| **Realtime** | `hooks/use-tables-realtime.ts` | Patrón `useDayPanelRealtime` sobre `dining_tables` + `orders` (invalida cache del plano). |
| *Reuso* | rejilla mostrador, KDS, `settleOrder`, arqueo | Pedir / cocina / cobrar. |

**Nav:** item "Sala" (`/sala`) para restauración, visible a staff (junto a Mostrador/Cocina/Carta).

**Realtime:** añadir `dining_tables` y `orders` a la publicación `supabase_realtime` (migración; `order_items` ya está de Plan C). El plano se refresca solo cuando otro camarero abre/cobra/mueve.

---

## 6. Alcance (blindaje)

### ✅ DENTRO de v1
Zonas + mesas + **plano espacial arrastrable** (posición/forma/capacidad); estados de mesa en **tiempo real**; **abrir mesa** (comensales); **panel de mesa** (comanda + cronómetro de tiempo sentados + total + comensales + estado); acciones **Añadir / Pedir cuenta / Cobrar / Limpiar** (reusan pedido/KDS/`settleOrder`); modo edición del plano gateado a owner/manager; nav "Sala".

### ⛔ FUERA de v1 (v1.1 / después)
**Dividir cuenta** (por comensal/producto/importe); **unir / separar / traspasar mesa**; **reservas** (sub-proyecto B, siguiente); asignación de camarero por mesa; QR en mesa (es el sub-proyecto de carta online, ya diseñado y en pausa); rotación/cubiertos analítica avanzada.

---

## 7. Errores, tiempo real y concurrencia

- **Concurrencia entre camareros**: abrir/cobrar/cambiar estado de una mesa es seguro por transición condicionada (`.eq("status", from)` como en `setOrderItemStatus`); dos camareros sobre la misma mesa → el segundo recibe CONFLICTO y el Realtime refresca.
- **Una cuenta por mesa ocupada**: abrir una mesa ya `ocupada` no crea una segunda cuenta (idempotente/guardado por estado).
- **Aislamiento multi-tenant**: todas las lecturas/escrituras acotadas por `salon_id` (server-side, no del cliente), como en mostrador.
- **Cobro**: reusa `settleOrder` (cobertura exacta de pagos + idempotencia con índice único + rollback ya probados en mostrador). Al cobrar, la mesa pasa a `por_limpiar` (no se libera hasta "Limpiar").

---

## 8. Testing (patrón Kairos: Vitest, sin BD real)

- **Unit puros** (`src/tests/unit/`): transiciones de estado de mesa (válidas/inválidas), derivación de estado, validación de posición/capacidad, cronómetro (reusa `elapsedMinutes`).
- **sql-coherence**: migraciones (zonas/mesas + FKs compuestas + RLS + guardián; columnas nuevas de `orders`; publicación Realtime).
- **Integración** (`makeSupabaseMock`): `openTable` (crea la cuenta + marca ocupada; rechaza si ya ocupada), `setTableStatus` (transición segura + CONFLICTO), `saveTablePosition`.
- **Componentes** (mock de hooks `use-*`): `table-panel` (muestra comanda + total + tiempo + acciones), `table-node` (color por estado; arrastrable en edición).

---

## 9. Criterios de aceptación

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Migraciones aplicadas en prod (`(201, [])`, guardianes OK).
- [ ] En `/sala`: se ve el plano por zona; una mesa libre se **abre** (comensales) y pasa a ocupada; se **añaden** productos y aparecen en `/cocina` en su estación.
- [ ] Tocar una mesa ocupada muestra su **comanda, el tiempo sentados y el total**.
- [ ] **Cobrar** la mesa materializa un `pos_sale` que cuadra en arqueo y la mesa pasa a `por_limpiar`; **Limpiar** la deja `libre`.
- [ ] El plano se **actualiza en tiempo real** entre dos pantallas (una abre/cobra, la otra lo ve).
- [ ] En **modo edición** (owner/manager) se arrastra una mesa y su posición persiste; un `staff` no ve el modo edición.

---

## 10. Riesgos y decisiones abiertas

- **Editor de arrastre**: se implementa con eventos de puntero nativos + posiciones absolutas (sin librería pesada de canvas), guardando `pos_x`/`pos_y` al soltar. Si se queda corto (rotación, formas complejas), se amplía en v1.1.
- **RLS a nivel de columna**: RLS es por fila, no por columna; el split "staff cambia estado / manager edita layout" se refuerza **a nivel de action** (la de layout comprueba `canManageSettings`), con RLS de miembro permisiva en UPDATE. Aceptable para v1.
- **Dividir cuenta**: es una necesidad real de sala pero compleja (por comensal/producto/importe con VeriFactu). Diferida a v1.1 a propósito; el modelo append-only de `order_items` la soporta cuando se aborde.
- **`covers` (comensales)**: se guarda en `orders.covers`; base para pacing/rotación de las reservas (sub-proyecto B).
