# Módulo Ortodoncia — Fase 4: Laboratorio y alineadores · Diseño

**Fecha:** 2026-08-11
**Sector:** odontología (Kairos)
**Rama:** `hat3x/HAT3X-038`
**Impulsora:** Nadia Ros (Clínica Dental Biodental)
**Depende de:** Fase 1 (sección `/ortodoncia`, ficha/tratamiento, `ortho_visit`), Fase 3 (tabs)
**Estado:** diseño aprobado, pendiente de plan de implementación

---

## 1. Contexto y objetivo

Cubre la **sección 4 del plan de Nadia** (Gestión de laboratorio y aparatología):
- **Control de pedidos a laboratorio**: registrar el envío y la recepción de modelos, retenedores,
  alineadores o aparatos de ortopedia, por paciente.
- **Trazabilidad de alineadores**: cuántos alineadores se han entregado y cuántos quedan pendientes
  por paciente.

Reutiliza lo que ya existe: la sección `/ortodoncia` con sus pestañas (Fase 3), y `ortho_visit`, que
**ya registra el nº de alineador entregado por visita** (`OrthoVisitActions.alignerDelivered`). No
existe ningún concepto de laboratorio todavía → se crea uno.

## 2. Alcance

### Dentro de Fase 4
- **A) Pedidos a laboratorio** — tabla nueva `lab_order` + pestaña **"Laboratorio"** en `/ortodoncia`.
- **B) Trazabilidad de alineadores** — un total en el tratamiento (JSONB) + resumen de progreso en la
  pestaña **"Ficha y tratamiento"**.

### Fuera de Fase 4 (siguientes)
- Stock/escandallo de materiales (ya existe aparte, no se toca).
- Integración con API de laboratorios externos.
- STL 3D, trazado cefalométrico, post-ajuste automático, cobro en TPV.

## 3. A) Pedidos a laboratorio

### 3.1 Tabla nueva `lab_order`

```
lab_order (
  id           uuid PK default gen_random_uuid(),
  salon_id     uuid NOT NULL references salons(id) on delete cascade,
  customer_id  uuid NOT NULL,
  kind         lab_order_kind NOT NULL,   -- modelo|retenedor|alineadores|ortopedia|otro
  lab_name     text,                      -- nombre del laboratorio (libre)
  sent_at      date NOT NULL,             -- fecha de envío
  received_at  date,                      -- recepción en la clínica (null hasta recibir)
  delivered_at date,                      -- entrega al paciente (null hasta entregar)
  notes        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL default now(),
  updated_at   timestamptz NOT NULL default now(),
  constraint lab_order_customer_fk
    foreign key (customer_id, salon_id) references clinical_records (customer_id, salon_id) on delete cascade
)
create index lab_order_customer_idx on lab_order (salon_id, customer_id, sent_at desc);
```

**Enum nuevo:** `lab_order_kind` (`modelo|retenedor|alineadores|ortopedia|otro`).

**Estado DERIVADO de las fechas** (no se almacena): `entregado` si `delivered_at`; si no, `recibido`
si `received_at`; si no, `enviado`. Lógica pura `labOrderStatus(order)`.

**RLS:** patrón por tenant (`for all using salon_id in (select app.user_salon_ids())`). El gate de rol
lo aplican las server actions (owner/manager/staff — el personal gestiona el laboratorio).

### 3.2 Server actions (`src/app/(dashboard)/ortodoncia/lab-actions.ts`)
Patrón `ActionResult<T>`, acotado por `salon_id`, gate sector odontología + rol (helper reutilizado):
- `createLabOrder(customerId, input)` — owner/manager/staff.
- `markLabOrderReceived(orderId, { receivedAt })` — pone `received_at` (default hoy).
- `markLabOrderDelivered(orderId, { deliveredAt })` — pone `delivered_at` (default hoy).
- `deleteLabOrder(orderId)` — owner/manager.

### 3.3 Lectura (`src/lib/queries/lab-orders.ts`)
- `fetchLabOrders(salonId, customerId)` → `LabOrder[]` (ordenados por `sent_at desc`).
- `labOrderKeys` (factory scoped por salonId).

### 3.4 UI — pestaña "Laboratorio"
Nueva pestaña en el `PillTabs` de `/ortodoncia` (id "laboratorio", label "Laboratorio"), componente
`src/components/dental/ortho-lab-card.tsx`:
- **Nuevo pedido**: tipo (`kind`), laboratorio, fecha de envío, notas.
- **Lista** de pedidos del paciente: chip de estado (enviado/recibido/entregado con color), tipo,
  laboratorio, fechas; botones **"Marcar recibido"** (si enviado) y **"Marcar entregado"** (si
  recibido); borrar (owner/manager). **UI con `ui-ux-pro-max`.**

## 4. B) Trazabilidad de alineadores

- **Total**: se añade `alignerTotal: number | null` a `clinical_records.data.ortho.treatment` (el
  JSONB de la ficha) — **sin migración**; extiende el tipo `OrthoTreatment` y el `orthoTreatmentSchema`
  (Zod).
- **Entregados** = el mayor `alignerDelivered` registrado en las `ortho_visit` del paciente (ya se
  guarda por visita). **Pendientes** = `alignerTotal − entregados` (≥ 0). Lógica pura
  `computeAlignerProgress(alignerTotal, visits) → { total, delivered, pending }`.
- **UI**: en la pestaña **"Ficha y tratamiento"**, cuando `applianceType === "alineadores"`, se
  muestra el input de `alignerTotal` (junto a los campos del tratamiento) + un resumen
  **"Alineadores: X de N entregados · N−X pendientes"** con barra de progreso. Si no es de alineadores
  o no hay total, no se muestra el resumen.

## 5. Capas técnicas y despliegue

- **Migración:** solo `lab_order` + enum + índice + RLS. La aplica el usuario (SQL editor). El
  `alignerTotal` NO lleva migración (vive en el JSONB).
- **Testing (TDD):** lógica pura (`labOrderStatus`, `computeAlignerProgress`) + validación Zod + server
  actions (gates, transiciones de fecha, acotado por salon). `tsc` 0 + suite verde antes del deploy.
- **UI con `ui-ux-pro-max`** en la pestaña "Laboratorio" y el bloque de alineadores.
- Rama `hat3x/HAT3X-038`. Deploy a `kairosmanager.app` por la API REST de Vercel al terminar.

## 6. Criterios de éxito

1. En `/ortodoncia`, pestaña **"Laboratorio"**: crear un pedido (p. ej. alineadores a "Lab X",
   enviado hoy), marcarlo recibido y luego entregado; el estado y las fechas se ven correctos.
2. En **"Ficha y tratamiento"** con tratamiento de alineadores: fijar el total (p. ej. 24) y ver
   "X de 24 entregados · pendientes" derivado de las visitas registradas.
3. Todo acotado a Biodental (RLS); sector no-odontología no ve nada de esto.
4. `tsc` 0, suite verde, build OK.
