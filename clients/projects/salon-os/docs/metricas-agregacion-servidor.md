# salon-os — Capa de agregación en servidor (métricas del panel) · HAT3X-033 sub-2

> **Qué es.** El contrato de la migración
> `supabase/migrations/20260723100000_rpc_dashboard_metrics.sql` y su espejo TS
> `@/lib/metrics`: 8 funciones SQL que agregan facturación y agenda **en la base**
> (`date_trunc` + `group by`), pensadas para dashboards y gráficas con **miles de
> ventas**. Ninguna trae filas crudas al cliente.
>
> **Base de reconocimiento:** `docs/recon-tpv-facturacion-metricas.md` (esquema
> `pos_*`, fiscal, dinero en céntimos) y `docs/convenciones-rls-rpc-audit.md`
> (convenciones RLS/RPC). Estado: proyecto en desarrollo, sin datos de producción.

---

## 0. Principios (léelos antes de consumir las RPC)

1. **Dinero SIEMPRE en céntimos enteros.** Las columnas fuente son `*_cents integer`;
   las sumas se devuelven como `bigint` (`sum(integer) → bigint`), así que miles de
   ventas **no desbordan** y no hay coma flotante. La UI formatea con
   `formatMoney(cents)` de `@/lib/format`; **no** se recalculan importes.
2. **Facturación = ventas `status = 'completed'`.** Los tickets abiertos (`open`),
   anulados (`voided`) y devueltos (`refunded`) **no** cuentan como ingreso. Una
   venta devuelta sale de la foto (su estado deja de ser `completed`).
3. **Rango en fechas LOCALES del salón.** Los parámetros `p_from` / `p_to` son
   `date` (ISO `YYYY-MM-DD`) y se interpretan en `salons.timezone` (por defecto
   `Europe/Madrid`). `p_to` es **inclusivo** (día completo): internamente se
   traduce a `[from_ts, to_ts)` en UTC vía el helper `app.salon_period_bounds`.
   Los `date_trunc` (día/semana/mes/año) también cortan en hora local.
4. **Aislamiento "acotado por salon_id CON RLS".** Ver §3.

---

## 1. Catálogo de funciones

Todas: `stable`, `security invoker`, `set search_path = ''`, `grant execute` a
`authenticated` + `service_role`. Parámetros comunes `p_salon_id uuid, p_from date,
p_to date`. Importes en céntimos.

| # | Función `public.*` | Retorno | Cubre el brief |
|---|---|---|---|
| 1 | `salon_sales_summary(salon, from, to)` | 1 fila | facturación total, nº tickets, **ticket medio** |
| 2 | `salon_revenue_timeseries(salon, from, to, granularity)` | serie | **facturación en el tiempo**, **nº de tickets/ventas en el tiempo**, ticket medio por bucket |
| 3 | `salon_revenue_by_location(salon, from, to)` | filas | **ingresos por sede** |
| 4 | `salon_revenue_by_professional(salon, from, to, limit)` | ranking | **ingresos por profesional (ranking)** |
| 5 | `salon_top_items(salon, from, to, item_kind, limit)` | ranking | **top servicios y top productos** |
| 6 | `salon_payment_method_distribution(salon, from, to)` | filas | **distribución por método de pago** |
| 7 | `salon_new_vs_returning_customers(salon, from, to)` | 1 fila | **clientes nuevos vs recurrentes** |
| 8 | `salon_agenda_occupancy(salon, from, to, location)` | 1 fila | **ocupación de agenda** |

Helper interno (esquema `app`, no expuesto por PostgREST):
`app.salon_period_bounds(salon, from, to) → (tz, from_ts, to_ts)`.

### 1.1 Columnas de retorno

- **1 · salon_sales_summary** → `sales_count, customers_count,
  gross_revenue_cents, taxable_base_cents, discount_cents, tax_cents,
  avg_ticket_cents`. `avg_ticket_cents = round(gross/sales_count)` (0 si no hay
  ventas). `customers_count` = clientes distintos (excluye tickets anónimos).
- **2 · salon_revenue_timeseries** → `bucket_start timestamptz, sales_count,
  revenue_cents, avg_ticket_cents`. `granularity ∈ {day, week, month, year}`
  (cualquier otro valor se acota a `day`). `bucket_start` = inicio local del
  periodo, como `timestamptz`.
- **3 · salon_revenue_by_location** → `location_id uuid?, location_name,
  sales_count, revenue_cents`. Venta→sede vía `pos_sales.session_id →
  pos_sessions.location_id`. Sin sesión/sede ⇒ `location_id NULL`, `'Sin sede'`.
- **4 · salon_revenue_by_professional** → `professional_id uuid?,
  professional_name, sales_count, revenue_cents`. Sin profesional ⇒ NULL,
  `'Sin profesional'`. Orden desc por ingresos; `limit` acota el ranking (def. 20).
- **5 · salon_top_items** → `item_kind, item_id uuid?, name, quantity numeric,
  revenue_cents, lines_count`. `item_kind`: `'service'|'product'|'manual'` filtra;
  `NULL` (def.) = servicios + productos (excluye manuales). Ingresos =
  `Σ line_total_cents` (bruto IVA incl., tras descuento de línea). Agrupa por
  `(tipo, id de catálogo, nombre snapshot)`; `limit` def. 10.
- **6 · salon_payment_method_distribution** → `method, payments_count,
  amount_cents`. Suma `pos_payments` de ventas `completed` del periodo, por método
  base del enum. Cuadra con la facturación (pago mixto = varias filas).
- **7 · salon_new_vs_returning_customers** → `new_customers,
  returning_customers, anonymous_sales, new_revenue_cents,
  returning_revenue_cents, anonymous_revenue_cents`. Ver §2.1.
- **8 · salon_agenda_occupancy** → `capacity_minutes, booked_minutes,
  booked_appointments, occupancy_rate numeric`. Ver §2.2.

---

## 2. Definiciones que conviene fijar

### 2.1 Clientes nuevos vs recurrentes

Sobre las ventas `completed` del periodo, cada cliente se clasifica por su
**primera venta completed de toda su historia**:

- **NUEVO** → esa primera venta cae **dentro** del periodo (`first_sold_at ≥ from`).
- **RECURRENTE** → ya tenía una venta completed **antes** de `from`.
- **Anónimo** → tickets sin `customer_id` (no deduplicables): se cuentan aparte por
  ticket (`anonymous_sales`), no por cliente.

`new_customers` / `returning_customers` cuentan **clientes distintos**; los
`*_revenue_cents` reparten la facturación del periodo entre los tres grupos.

### 2.2 Ocupación de agenda

`occupancy_rate = booked_minutes / capacity_minutes` (0..1; puede superar 1 si hay
sobrerreserva).

- **Capacidad** (`capacity_minutes`): por cada día del rango y cada profesional
  **activo** (opcionalmente de una sede), minutos de trabajo =
  - excepción del día (`schedule_exceptions`) si existe: no disponible → 0;
    disponible → su horario especial `end_time − start_time`;
  - si no hay excepción → suma de tramos del horario semanal
    (`professional_schedules`) del **día de la semana** correspondiente
    (`weekday`, 0=domingo … 6=sábado == `extract(dow)`).
- **Reservado** (`booked_minutes`): suma de duraciones `ends_at − starts_at` de las
  citas cuyo `starts_at` cae en el periodo y cuyo estado **no** es `'cancelled'`
  (`pending`, `confirmed`, `completed` y `no_show` ocuparon hueco; `cancelled` lo
  liberó).
- `p_location_id` opcional acota capacidad y reservas a los profesionales de esa
  sede (las citas se filtran por la sede de su profesional).

---

## 3. Seguridad — por qué SECURITY INVOKER (desviación documentada)

La convención del proyecto (`docs/convenciones-rls-rpc-audit §5`) es "RPC nueva =
`security definer` + gate por pertenencia". Esas RPC (`register_my_customer_account`,
`staff_award_visit`) **escriben** y necesitan bypasar RLS de forma controlada.

Estas 8 funciones son de **solo lectura** y se declaran **`SECURITY INVOKER`**
adrede, alineado con el enunciado ("acotadas por `salon_id` **con RLS**"):

- Al ejecutarse con los privilegios del llamador, la **RLS existente** de
  `pos_sales` / `pos_payments` / `appointments` / … (`salon_id in (select
  app.user_salon_ids())`) se aplica **dentro** de la función. El aislamiento entre
  salones NO depende de un `WHERE` que se pudiera olvidar: un error en una consulta
  no puede filtrar datos de otro tenant.
- Además, cada consulta filtra explícitamente `salon_id = p_salon_id` para acotar a
  **una** sede (un usuario puede ser miembro de varias) y usar los índices
  `(salon_id, sold_at)` / `(salon_id, starts_at)`.
- `set search_path = ''` + objetos cualificados por esquema (anti-inyección).

El guardián `rls_multitenant_guard` no se ve afectado (comprueba políticas de
tablas, no funciones). Un no-miembro que invoque una RPC obtiene ceros / lista
vacía (la RLS filtra sus filas), nunca datos ajenos.

---

## 4. Rendimiento (pensado para miles de ventas)

- El coste de red/memoria del cliente es **O(nº de buckets/filas agregadas)**, no
  O(nº de ventas): el `group by` ocurre en Postgres.
- Índices aprovechados (ya existentes, sin migración nueva): `pos_sales
  (salon_id, sold_at desc)`, `pos_sale_lines (sale_id)`, `pos_payments (sale_id)`,
  `appointments (salon_id, starts_at)`, `professional_schedules
  (salon_id, professional_id, weekday)`, `schedule_exceptions
  (salon_id, professional_id, exception_date)`.
- La ocupación expande `días × profesionales` (acotado: p. ej. 90 × 20 = 1.800
  filas intermedias), no ventas.

---

## 5. Espejo TS — `@/lib/metrics`

- Tipado en el bloque `Functions` de `src/types/database.ts` (antes vacío) →
  `supabase.rpc("salon_*", …)` queda tipado (args y retorno).
- `src/lib/metrics/server.ts`: un helper por métrica (`getSalesSummary`,
  `getRevenueTimeseries`, `getRevenueByLocation`, `getRevenueByProfessional`,
  `getTopItems`/`getTopServices`/`getTopProducts`,
  `getPaymentMethodDistribution`, `getNewVsReturningCustomers`,
  `getAgendaOccupancy`). Reciben el cliente de `@/lib/supabase/server`.
- `src/lib/metrics/types.ts`: tipos derivados del contrato + valores a cero
  (`EMPTY_SALES_SUMMARY`, `EMPTY_NEW_VS_RETURNING`, `EMPTY_OCCUPANCY`).
- Uso e importación: `src/lib/metrics/README.md`.

## 6. Tests

- `src/tests/unit/metrics-sql-coherence.test.ts` — ancla en la migración real:
  existencia de las 8 RPC, agregación en servidor (`group by`/`date_trunc`),
  `security invoker` (no `definer`), `search_path=''`, `salon_id = p_salon_id`,
  permisos (`revoke public` + `grant authenticated`, nunca `anon`), sumas a
  `bigint` y filtro `completed`.
- `src/tests/unit/metrics-server.test.ts` — comportamiento de la capa TS con un
  doble de Supabase: cada helper llama a su RPC con los `p_*` correctos, resuelve
  1 fila / lista, cae a cero sin datos y propaga errores de PostgREST.

> No hay Postgres en el harness (Vitest): la corrección semántica del SQL se
> blinda por anclas sobre la migración, igual que `normalize-phone-sql-coherence`.
> Al provisionar el proyecto Supabase, conviene añadir un test de integración con
> datos sembrados que ejercite las cifras reales.
