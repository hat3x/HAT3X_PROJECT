# Módulo Ortodoncia — Fase 2 (económico: plan de pago) · Diseño

**Fecha:** 2026-08-11
**Sector:** odontología (Kairos)
**Rama:** `hat3x/HAT3X-038`
**Impulsora:** Nadia Ros (Clínica Dental Biodental)
**Depende de:** Fase 1 (núcleo clínico) — sección `/ortodoncia` ya existe
**Estado:** diseño aprobado, pendiente de plan de implementación

---

## 1. Contexto y objetivo

Cubre la **sección 3 del plan de Nadia** (Facturación y gestión financiera) para ortodoncia: el
tratamiento de ortodoncia es largo y de pago recurrente, así que la clínica necesita gestionar un
**presupuesto cerrado pagado a plazos** (entrada + mensualidades), ver el **saldo** de cada
paciente, y saber quién debe dinero **antes de atenderle**.

Kairos ya tiene TPV (`pos_sales`), facturación (`/facturacion`), planes de tratamiento
(`treatment_plan`) y una infra de cron (`/api/cron/reminders`). Esta fase **no** los toca: implementa
un plan de pago ligero y autónomo. La integración con caja/TPV se deja para una sub-fase futura.

## 2. Alcance

### Dentro de Fase 2
Un bloque **"Plan de pago"** en la sección `/ortodoncia` del paciente:
1. **Crear presupuesto cerrado**: total, entrada, nº de mensualidades, día de cobro, fecha de inicio.
2. **Calendario de cuotas** generado automáticamente al crear el plan (entrada + N cuotas).
3. **Cobro ligero**: marcar una cuota como cobrada (importe + método + fecha).
4. **Saldo**: total / pagado / pendiente / próxima cuota / nº de cuotas vencidas.
5. **Aviso de morosidad en la agenda**: en `/appointments`, cada cita de un paciente con cuotas
   vencidas muestra un aviso (solo sector odontología).

### Fuera de Fase 2 (sub-fases siguientes)
- Integración del cobro con **TPV/caja/facturación** (que la cuota cobrada aparezca en el arqueo).
- **Financiación externa** (enganche con financieras) y planes de pago con interés.
- **Recordatorio automático** de cuota (WhatsApp/SMS) — se añadiría reusando `/api/cron/reminders`.
- Laboratorio, post-ajuste automático, STL, cefalometría (otras fases del módulo).

## 3. Modelo de datos (opción aprobada: 2 tablas)

### 3.1 `ortho_payment_plan` (1 plan activo por paciente)

```
ortho_payment_plan (
  id                 uuid PK default gen_random_uuid(),
  salon_id           uuid NOT NULL references salons(id) on delete cascade,
  customer_id        uuid NOT NULL,
  total_cents        integer NOT NULL check (total_cents > 0),
  down_payment_cents integer NOT NULL default 0 check (down_payment_cents >= 0),
  installment_count  integer NOT NULL check (installment_count >= 1),
  day_of_month       smallint NOT NULL check (day_of_month between 1 and 31),
  start_date         date NOT NULL,
  currency           char(3) NOT NULL default 'EUR',
  status             ortho_plan_status NOT NULL default 'activo',  -- activo|completado|cancelado
  notes              text,
  created_by         uuid,
  created_at         timestamptz NOT NULL default now(),
  updated_at         timestamptz NOT NULL default now(),
  check (down_payment_cents <= total_cents),
  constraint ortho_payment_plan_customer_fk
    foreign key (customer_id, salon_id) references clinical_records (customer_id, salon_id) on delete cascade,
  unique (id, salon_id)  -- para que las cuotas puedan FK compuesta de vuelta
)
-- solo UN plan activo por paciente:
create unique index ortho_payment_plan_one_active
  on ortho_payment_plan (customer_id, salon_id) where status = 'activo';
```

### 3.2 `ortho_installment` (cada pago: entrada + cuotas)

```
ortho_installment (
  id                uuid PK default gen_random_uuid(),
  salon_id          uuid NOT NULL,
  plan_id           uuid NOT NULL,
  customer_id       uuid NOT NULL,                 -- DENORMALIZADO (para la query de morosidad de la agenda)
  seq               smallint NOT NULL,             -- 0 = Entrada, 1..N = cuotas
  due_date          date NOT NULL,
  amount_cents      integer NOT NULL check (amount_cents > 0),
  status            ortho_installment_status NOT NULL default 'pendiente',  -- pendiente|pagada
  paid_at           timestamptz,
  paid_method       text,                          -- efectivo|tarjeta|transferencia|otro (validado en app)
  paid_amount_cents integer,
  created_at        timestamptz NOT NULL default now(),
  constraint ortho_installment_plan_fk
    foreign key (plan_id, salon_id) references ortho_payment_plan (id, salon_id) on delete cascade,
  unique (plan_id, seq)
)
create index ortho_installment_plan_idx     on ortho_installment (salon_id, plan_id, seq);
-- query de morosidad por paciente (agenda): pendientes vencidas
create index ortho_installment_overdue_idx  on ortho_installment (salon_id, customer_id, status, due_date);
```

**Enums nuevos:** `ortho_plan_status` (`activo|completado|cancelado`), `ortho_installment_status`
(`pendiente|pagada`).

**RLS:** patrón de Fase 1 (`for all using salon_id in (select app.user_salon_ids())`), en ambas
tablas. El gate de rol lo aplican las server actions (no la RLS).

### 3.3 Creación atómica (RPC)

El calendario se **calcula en TypeScript** (puro, testeable) y se inserta de forma **atómica** con
una función `create_ortho_payment_plan(...)` `SECURITY DEFINER` (recibe la cabecera + el array de
cuotas como jsonb, inserta plan + cuotas en una transacción). Evita planes huérfanos sin cuotas y
respeta el índice de "un plan activo por paciente". Gateada por `salon_members` (owner/manager).

## 4. Cálculo del calendario (puro, en `src/lib/dental/ortho-payments.ts`)

Entrada: `total_cents`, `down_payment_cents`, `installment_count` (N), `day_of_month`, `start_date`.

- **Entrada** (`seq 0`): solo si `down_payment_cents > 0`; `due_date = start_date`; `amount = down_payment_cents`.
- **Financiado** = `total_cents − down_payment_cents`.
- `base = floor(financiado / N)`; `resto = financiado − base*N`.
- **Cuota k** (k = 1..N): `amount = base + (k <= resto ? 1 : 0)` (el resto en céntimos se reparte en
  las primeras `resto` cuotas → importes lo más iguales posible).
- **Vencimiento cuota k**: día `clamp(day_of_month, díasDelMes)` del mes = `mes(start_date) + k`.
  (Ej.: inicio 2026-08-20, día 5, N=24 → cuota 1 vence 2026-09-05, cuota 2 el 2026-10-05, …)
- **Invariante (test):** `Σ amount (entrada + cuotas) === total_cents`.

**Morosidad = derivada, no almacenada:** una cuota está *vencida* si `status = 'pendiente'` y
`due_date < hoy` (zona horaria del salón). **Sin cron.** Un recordatorio automático de cuota se
añadiría luego reusando la infra de reminders.

## 5. Server actions (`src/app/(dashboard)/ortodoncia/payment-actions.ts`)

Patrón `ActionResult<T>`, acotado por `salon_id`, gate sector `odontologia` + rol (helper
`assertOrthoAccess` reutilizado/extendido de Fase 1):

- `createOrthoPaymentPlan(customerId, input)` — owner/manager. Valida (Zod), calcula el calendario,
  llama a la RPC atómica. Rechaza si ya hay plan activo.
- `payInstallment(installmentId, { method })` — owner/manager/staff. Marca pagada (paid_at,
  paid_method, paid_amount = amount). Si no quedan cuotas pendientes → plan `completado`.
- `unpayInstallment(installmentId)` — owner/manager. Deshace el cobro; si el plan estaba
  `completado`, vuelve a `activo`.
- `cancelOrthoPaymentPlan(planId)` — owner/manager. Marca `cancelado` (conserva el histórico).

## 6. Lectura (`src/lib/queries/ortho-payments.ts`)

- `fetchOrthoPaymentPlan(salonId, customerId)` → `{ plan, installments } | null` (plan activo + sus
  cuotas ordenadas por `seq`).
- `fetchOverdueOrthoCounts(salonId, customerIds[])` → `Record<customerId, number>` (cuotas
  pendientes vencidas por paciente) — para la agenda. Query directa e indexada.
- `orthoPaymentKeys` (factory de query keys, scoped por salonId).

## 7. Integración con la agenda (aviso de morosidad)

- La página `/appointments` (server) calcula `isDental = sector === 'odontologia'` y lo pasa a la
  vista.
- Si `isDental`, la vista consulta `fetchOverdueOrthoCounts` para los pacientes del día (hook
  `useOverdueOrtho`) y muestra un aviso **"⚠ N cuota(s) vencida(s)"** en la tarjeta de cada cita
  afectada. En sectores no dentales no se consulta ni se muestra nada (cero coste).

## 8. UI (con la skill `ui-ux-pro-max` en implementación)

Componente nuevo `src/components/dental/ortho-payment-plan-card.tsx` (para no engordar
`ortodoncia-view.tsx`), montado como 5º bloque de `/ortodoncia`:
- **Sin plan** → formulario (total, entrada, nº cuotas, día de cobro, fecha de inicio) con
  **preview del calendario** antes de crear.
- **Con plan** → cabecera de saldo (barra de progreso pagado/pendiente, próxima cuota, aviso de
  morosidad) + tabla del calendario (Entrada + cuotas: fecha, importe, chip de estado, botón
  "Cobrar" en pendientes; filas vencidas resaltadas) + acción "Cancelar plan".
- Estados loading/empty/error cuidados; dinero formateado con el helper del repo; responsive.

## 9. Testing (TDD)

- **Cálculo del calendario** (puro): invariante de suma, reparto del resto, vencimientos (clamp de
  día, salto de mes), entrada incluida/excluida cuando la entrada es 0, validaciones de rango.
- **Server actions**: gates (sector/rol), creación atómica (rechaza 2º plan activo), pay/unpay
  (transiciones de estado + completado/activo), cancelar; todo acotado por `salon_id`.
- **Query de morosidad**: cuenta correcta de vencidas por paciente.
- `tsc` 0 y suite completa verde antes de desplegar.

## 10. Capas técnicas y despliegue

- **Migración** (enums + 2 tablas + RLS + índices + índice único de plan activo + RPC). La aplica el
  usuario (SQL editor) — en este entorno no hay token Management API ni conexión directa a Postgres.
- Zod (`src/lib/validations/ortho-payments.ts`), queries, actions, hooks (`use-ortho-payments.ts`),
  componentes UI; entrada en `/ortodoncia`.
- Rama `hat3x/HAT3X-038`. Deploy a `kairosmanager.app` por la API REST de Vercel al terminar.

## 11. Criterios de éxito

1. Nadia crea un plan (p. ej. 3.000 € = 600 entrada + 24×100) y ve el calendario completo.
2. Marca la entrada y las cuotas como cobradas; el saldo y "próxima cuota" se actualizan.
3. Una cuota pasada sin pagar aparece como **vencida** y el paciente sale marcado como moroso.
4. En la agenda, al abrir el día, las citas de pacientes morosos muestran el aviso.
5. Todo acotado a Biodental (RLS); sector no-odontología no ve nada de esto.
