-- =============================================================================
-- salon-os — Migración: capa de AGREGACIÓN en servidor para métricas / gráficas
--
-- Objetivo (HAT3X-033, sub-2): mover TODA la agregación del panel al servidor.
-- Nunca traer miles de ventas al cliente para sumarlas en el navegador: cada
-- métrica es una función SQL que hace `date_trunc` + `group by` y devuelve solo
-- las filas ya agregadas (una serie temporal, un ranking, una distribución…).
--
-- Métricas cubiertas (el brief, una función por concepto):
--   1. salon_sales_summary               — KPIs del periodo (facturación, nº tickets, ticket medio)
--   2. salon_revenue_timeseries          — facturación / nº de tickets / ticket medio EN EL TIEMPO
--   3. salon_revenue_by_location         — ingresos por sede
--   4. salon_revenue_by_professional     — ingresos por profesional (ranking)
--   5. salon_top_items                   — top servicios y top productos
--   6. salon_payment_method_distribution — distribución por método de pago
--   7. salon_new_vs_returning_customers  — clientes nuevos vs recurrentes
--   8. salon_agenda_occupancy            — ocupación de agenda (reservado / capacidad)
--
-- ── INVARIANTES respetadas ───────────────────────────────────────────────────
--   · Dinero SIEMPRE en céntimos enteros (columnas *_cents). Las sumas se
--     devuelven como `bigint` (sum(integer) → bigint en Postgres): miles de
--     ventas no desbordan. La UI formatea con `formatMoney(cents)`; NO se
--     recalculan importes aquí (se suman los snapshots ya calculados por el TPV).
--   · Facturación = ventas con `status = 'completed'` (las abiertas/anuladas/
--     devueltas NO cuentan como ingreso). Documentado en cada función.
--   · Huso horario del salón: los cortes de día/semana/mes y los límites del
--     rango se calculan en la zona de `salons.timezone` (por defecto Europe/Madrid),
--     no en UTC, para que "hoy" signifique el día local del salón.
--
-- ── SEGURIDAD — aislamiento multi-tenant "acotado por salon_id CON RLS" ───────
--   Estas funciones son de SOLO LECTURA y se declaran **SECURITY INVOKER** (NO
--   `definer`), a diferencia de las RPC de escritura del proyecto
--   (register_my_customer_account / staff_award_visit, que SÍ son definer para
--   bypasar RLS de forma controlada). Motivo, alineado con el enunciado de la
--   tarea ("acotadas por salon_id con RLS"):
--     · Al ejecutarse con los privilegios del llamador, la RLS de pos_sales /
--       pos_payments / appointments / … SIGUE aplicándose dentro de la función.
--       El aislamiento entre salones lo garantiza la RLS existente
--       (`salon_id in (select app.user_salon_ids())`), no un `WHERE` frágil: un
--       error en una consulta NO puede filtrar datos de otro tenant.
--     · Además, cada consulta filtra explícitamente `salon_id = p_salon_id` para
--       acotar a UNA sede concreta (un usuario puede ser miembro de varias) y
--       aprovechar los índices `(salon_id, sold_at)` / `(salon_id, starts_at)`.
--   `set search_path = ''` + todo objeto cualificado por esquema (anti-inyección
--   de search_path). Es una DESVIACIÓN DELIBERADA y documentada de la convención
--   "RPC nueva = definer" (docs/convenciones-rls-rpc-audit §5): para lecturas
--   analíticas, apoyarse en RLS es estrictamente más seguro.
--
--   GRANT execute a `authenticated` (panel con sesión del usuario) y a
--   `service_role` (usos administrativos de servidor); REVOKE a public/anon.
--
-- Estado: proyecto en desarrollo, sin datos de producción → sin backfill.
-- Reflejado en el bloque `Functions` de src/types/database.ts (antes vacío).
-- =============================================================================

begin;

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper interno de rango: convierte [p_from, p_to] (fechas en la zona del salón)
-- al intervalo semiabierto de instantes UTC [from_ts, to_ts). `p_to` es INCLUSIVO
-- (día completo): to_ts = medianoche local del día siguiente a p_to.
--
-- Vive en el esquema `app` (no expuesto por PostgREST). Es STABLE porque depende
-- de la fila de `salons` (huso horario). SECURITY INVOKER: respeta la RLS de
-- `salons` (un no-miembro no ve el huso → cae al valor por defecto y, aguas
-- arriba, la RLS de las tablas de negocio devuelve 0 filas de todos modos).
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function app.salon_period_bounds(
  p_salon_id uuid,
  p_from     date,
  p_to       date,
  out tz       text,
  out from_ts  timestamptz,
  out to_ts    timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    z.tz,
    (p_from::timestamp)      at time zone z.tz as from_ts,
    ((p_to + 1)::timestamp)  at time zone z.tz as to_ts
  from (
    select coalesce(
      (select s.timezone from public.salons s where s.id = p_salon_id),
      'Europe/Madrid'
    ) as tz
  ) z;
$$;

comment on function app.salon_period_bounds(uuid, date, date) is
  'Convierte [p_from, p_to] (fechas locales del salón) a [from_ts, to_ts) en UTC usando salons.timezone. p_to inclusivo. Uso interno de las funciones de métricas.';

-- ==============================================================================
-- 1. salon_sales_summary — KPIs del periodo (cabecera del dashboard)
--    Facturación total, nº de tickets, clientes distintos y TICKET MEDIO.
--    Siempre devuelve UNA fila (agregado sobre conjunto posiblemente vacío → 0).
-- ==============================================================================
create or replace function public.salon_sales_summary(
  p_salon_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  sales_count          bigint,   -- nº de tickets/ventas completados
  customers_count      bigint,   -- clientes distintos (excluye tickets anónimos)
  gross_revenue_cents  bigint,   -- Σ total_cents (IVA incluido)
  taxable_base_cents   bigint,   -- Σ subtotal_cents (base imponible)
  discount_cents       bigint,   -- Σ discount_cents (informativo)
  tax_cents            bigint,   -- Σ tax_cents (IVA)
  avg_ticket_cents     bigint    -- ticket medio = gross / sales_count (redondeado)
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::bigint,
    count(distinct s.customer_id)::bigint,
    coalesce(sum(s.total_cents), 0)::bigint,
    coalesce(sum(s.subtotal_cents), 0)::bigint,
    coalesce(sum(s.discount_cents), 0)::bigint,
    coalesce(sum(s.tax_cents), 0)::bigint,
    case
      when count(*) > 0
        then round(coalesce(sum(s.total_cents), 0)::numeric / count(*))::bigint
      else 0
    end
  from public.pos_sales s
  cross join app.salon_period_bounds(p_salon_id, p_from, p_to) b
  where s.salon_id = p_salon_id
    and s.status   = 'completed'
    and s.sold_at >= b.from_ts
    and s.sold_at <  b.to_ts;
$$;

comment on function public.salon_sales_summary(uuid, date, date) is
  'KPIs de facturación del salón en [p_from, p_to] (fechas locales): nº de tickets, clientes distintos, importes en céntimos y ticket medio. Solo ventas completed. SECURITY INVOKER (aislamiento por RLS).';

-- ==============================================================================
-- 2. salon_revenue_timeseries — facturación / nº de tickets / ticket medio EN EL
--    TIEMPO. `date_trunc` en la zona del salón; granularidad day|week|month|year
--    (se acota a 'day' si llega otra cosa). Bucket devuelto como timestamptz del
--    inicio LOCAL del periodo (listo para el eje X de una gráfica).
-- ==============================================================================
create or replace function public.salon_revenue_timeseries(
  p_salon_id    uuid,
  p_from        date,
  p_to          date,
  p_granularity text default 'day'
)
returns table (
  bucket_start     timestamptz,  -- inicio del periodo (día/semana/mes/año local)
  sales_count      bigint,       -- nº de tickets en el bucket
  revenue_cents    bigint,       -- Σ total_cents en el bucket
  avg_ticket_cents bigint        -- ticket medio del bucket
)
language sql
stable
security invoker
set search_path = ''
as $$
  with g as (
    select case
      when lower(coalesce(p_granularity, 'day')) in ('day', 'week', 'month', 'year')
        then lower(p_granularity)
      else 'day'
    end as grain
  )
  select
    (date_trunc(g.grain, s.sold_at at time zone b.tz) at time zone b.tz) as bucket_start,
    count(*)::bigint,
    coalesce(sum(s.total_cents), 0)::bigint,
    round(coalesce(sum(s.total_cents), 0)::numeric / count(*))::bigint
  from public.pos_sales s
  cross join app.salon_period_bounds(p_salon_id, p_from, p_to) b
  cross join g
  where s.salon_id = p_salon_id
    and s.status   = 'completed'
    and s.sold_at >= b.from_ts
    and s.sold_at <  b.to_ts
  group by 1
  order by 1;
$$;

comment on function public.salon_revenue_timeseries(uuid, date, date, text) is
  'Serie temporal de facturación y nº de tickets del salón, agrupada por date_trunc(granularidad) en la zona horaria local. Granularidad: day|week|month|year. Solo ventas completed.';

-- ==============================================================================
-- 3. salon_revenue_by_location — ingresos por sede
--    La venta se ata a la sede a través de su sesión de caja
--    (pos_sales.session_id → pos_sessions.location_id). Ventas sin sesión o sin
--    sede asignada se agrupan como 'Sin sede' (location_id NULL).
-- ==============================================================================
create or replace function public.salon_revenue_by_location(
  p_salon_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  location_id   uuid,
  location_name text,
  sales_count   bigint,
  revenue_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    loc.id,
    coalesce(loc.name, 'Sin sede'),
    count(*)::bigint,
    coalesce(sum(s.total_cents), 0)::bigint
  from public.pos_sales s
  cross join app.salon_period_bounds(p_salon_id, p_from, p_to) b
  left join public.pos_sessions sess
    on sess.id = s.session_id and sess.salon_id = s.salon_id
  left join public.locations loc
    on loc.id = sess.location_id and loc.salon_id = s.salon_id
  where s.salon_id = p_salon_id
    and s.status   = 'completed'
    and s.sold_at >= b.from_ts
    and s.sold_at <  b.to_ts
  group by loc.id, loc.name
  -- ORDER BY por posición: revenue_cents (4), sales_count (3). Los nombres de
  -- RETURNS TABLE no están en el ámbito del cuerpo de una función LANGUAGE sql.
  order by 4 desc, 3 desc;
$$;

comment on function public.salon_revenue_by_location(uuid, date, date) is
  'Ingresos y nº de tickets por sede (vía pos_sessions.location_id). Ventas sin sede → fila location_id NULL "Sin sede". Solo ventas completed.';

-- ==============================================================================
-- 4. salon_revenue_by_professional — ingresos por profesional (RANKING)
--    Atribución por pos_sales.professional_id. Ventas sin profesional → NULL
--    "Sin profesional". Ordenado por facturación desc y acotado por p_limit.
-- ==============================================================================
create or replace function public.salon_revenue_by_professional(
  p_salon_id uuid,
  p_from     date,
  p_to       date,
  p_limit    integer default 20
)
returns table (
  professional_id   uuid,
  professional_name text,
  sales_count       bigint,
  revenue_cents     bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pro.id,
    coalesce(pro.full_name, 'Sin profesional'),
    count(*)::bigint,
    coalesce(sum(s.total_cents), 0)::bigint
  from public.pos_sales s
  cross join app.salon_period_bounds(p_salon_id, p_from, p_to) b
  left join public.professionals pro
    on pro.id = s.professional_id and pro.salon_id = s.salon_id
  where s.salon_id = p_salon_id
    and s.status   = 'completed'
    and s.sold_at >= b.from_ts
    and s.sold_at <  b.to_ts
  group by pro.id, pro.full_name
  -- ORDER BY por posición: revenue_cents (4), sales_count (3).
  order by 4 desc, 3 desc
  limit greatest(coalesce(p_limit, 20), 0);
$$;

comment on function public.salon_revenue_by_professional(uuid, date, date, integer) is
  'Ranking de ingresos y nº de tickets por profesional (pos_sales.professional_id). Sin profesional → NULL "Sin profesional". Solo ventas completed. p_limit acota el ranking.';

-- ==============================================================================
-- 5. salon_top_items — top SERVICIOS y top PRODUCTOS
--    Agrega las líneas de ventas completed. p_item_kind:
--      · 'service' | 'product' | 'manual' → filtra a ese tipo.
--      · NULL (por defecto) → servicios + productos (excluye cargos manuales).
--    Agrupa por (tipo, id de catálogo, nombre snapshot): si el catálogo cambia de
--    nombre entre ventas, cuenta líneas distintas (predecible; sin recomputar).
--    Ingresos = Σ line_total_cents (bruto IVA incl., tras descuento de línea).
-- ==============================================================================
create or replace function public.salon_top_items(
  p_salon_id   uuid,
  p_from       date,
  p_to         date,
  p_item_kind  text    default null,
  p_limit      integer default 10
)
returns table (
  item_kind     text,
  item_id       uuid,      -- service_id | product_id | NULL (manual / catálogo borrado)
  name          text,      -- snapshot de pos_sale_lines.description
  quantity      numeric,   -- Σ quantity (admite fracciones)
  revenue_cents bigint,    -- Σ line_total_cents
  lines_count   bigint     -- nº de líneas agregadas
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.item_kind,
    coalesce(l.service_id, l.product_id) as item_id,
    l.description as name,
    coalesce(sum(l.quantity), 0)::numeric,
    coalesce(sum(l.line_total_cents), 0)::bigint,
    count(*)::bigint
  from public.pos_sale_lines l
  join public.pos_sales s
    on s.id = l.sale_id and s.salon_id = l.salon_id
  cross join app.salon_period_bounds(p_salon_id, p_from, p_to) b
  where l.salon_id = p_salon_id
    and s.status   = 'completed'
    and s.sold_at >= b.from_ts
    and s.sold_at <  b.to_ts
    and (
      (p_item_kind is not null and l.item_kind = p_item_kind)
      or (p_item_kind is null and l.item_kind in ('service', 'product'))
    )
  group by l.item_kind, coalesce(l.service_id, l.product_id), l.description
  -- ORDER BY por posición: revenue_cents (5), quantity (4).
  order by 5 desc, 4 desc
  limit greatest(coalesce(p_limit, 10), 0);
$$;

comment on function public.salon_top_items(uuid, date, date, text, integer) is
  'Top de líneas vendidas (servicios/productos) por ingresos en el periodo. p_item_kind: service|product|manual, o NULL = servicios+productos. Ingresos = Σ line_total_cents. Solo ventas completed.';

-- ==============================================================================
-- 6. salon_payment_method_distribution — distribución por método de pago
--    Suma los pagos (pos_payments) de las ventas completed del periodo, por
--    método base del enum (efectivo/tarjeta/bizum/transferencia/otro). Se filtra
--    por la venta (status + sold_at) para que la distribución cuadre con la
--    facturación total (pago mixto = varias filas que suman el total del ticket).
-- ==============================================================================
create or replace function public.salon_payment_method_distribution(
  p_salon_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  method         text,    -- valor del enum pos_payment_method
  payments_count bigint,  -- nº de cobros de ese método
  amount_cents   bigint   -- Σ amount_cents del método
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pm.method::text,
    count(*)::bigint,
    coalesce(sum(pm.amount_cents), 0)::bigint
  from public.pos_payments pm
  join public.pos_sales s
    on s.id = pm.sale_id and s.salon_id = pm.salon_id
  cross join app.salon_period_bounds(p_salon_id, p_from, p_to) b
  where pm.salon_id = p_salon_id
    and s.status    = 'completed'
    and s.sold_at  >= b.from_ts
    and s.sold_at  <  b.to_ts
  group by pm.method
  -- ORDER BY por posición: amount_cents (3).
  order by 3 desc;
$$;

comment on function public.salon_payment_method_distribution(uuid, date, date) is
  'Distribución de cobros por método de pago (pos_payments.method) de las ventas completed del periodo. Cuadra con la facturación (pago mixto = varias filas). Importes en céntimos.';

-- ==============================================================================
-- 7. salon_new_vs_returning_customers — clientes NUEVOS vs RECURRENTES
--    Sobre las ventas completed del periodo, clasifica cada cliente:
--      · NUEVO      → su PRIMERA venta completed (de toda su historia) cae dentro
--                     del periodo.
--      · RECURRENTE → ya tenía una venta completed ANTES de from_ts.
--    Los tickets anónimos (customer_id NULL) se contabilizan aparte (no se pueden
--    deduplicar). Devuelve nº de clientes distintos e ingresos de cada grupo.
--    Siempre UNA fila.
-- ==============================================================================
create or replace function public.salon_new_vs_returning_customers(
  p_salon_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  new_customers           bigint,
  returning_customers     bigint,
  anonymous_sales         bigint,
  new_revenue_cents       bigint,
  returning_revenue_cents bigint,
  anonymous_revenue_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select * from app.salon_period_bounds(p_salon_id, p_from, p_to)
  ),
  first_seen as (
    -- Primera venta completed de cada cliente en TODA su historia (para saber si
    -- su estreno cae dentro del periodo).
    select s.customer_id, min(s.sold_at) as first_sold_at
    from public.pos_sales s
    where s.salon_id = p_salon_id
      and s.status = 'completed'
      and s.customer_id is not null
    group by s.customer_id
  ),
  classified as (
    select
      s.customer_id,
      s.total_cents,
      case
        when s.customer_id is null           then 'anon'
        when fs.first_sold_at >= b.from_ts   then 'new'
        else                                      'returning'
      end as bucket
    from public.pos_sales s
    cross join b
    left join first_seen fs on fs.customer_id = s.customer_id
    where s.salon_id = p_salon_id
      and s.status   = 'completed'
      and s.sold_at >= b.from_ts
      and s.sold_at <  b.to_ts
  )
  select
    -- count(...) ya devuelve bigint; sum(int) también, pero se explicita con cast.
    count(distinct customer_id) filter (where bucket = 'new'),
    count(distinct customer_id) filter (where bucket = 'returning'),
    count(*)                    filter (where bucket = 'anon'),
    coalesce(sum(total_cents)   filter (where bucket = 'new'), 0)::bigint,
    coalesce(sum(total_cents)   filter (where bucket = 'returning'), 0)::bigint,
    coalesce(sum(total_cents)   filter (where bucket = 'anon'), 0)::bigint
  from classified;
$$;

comment on function public.salon_new_vs_returning_customers(uuid, date, date) is
  'Clientes nuevos (primera venta completed dentro del periodo) vs recurrentes (ya compraron antes) + tickets anónimos. Cuenta clientes distintos e ingresos por grupo. Solo ventas completed.';

-- ==============================================================================
-- 8. salon_agenda_occupancy — OCUPACIÓN DE AGENDA
--    Ocupación = minutos reservados / minutos de capacidad, en el periodo.
--      · CAPACIDAD: por cada día del rango y cada profesional ACTIVO, minutos de
--        trabajo = excepción del día (schedule_exceptions) si existe (no disponible
--        → 0; disponible → su horario especial), o si no la suma de tramos del
--        horario semanal (professional_schedules) del día de la semana correspondiente.
--        Convención de weekday: 0=domingo … 6=sábado (== extract(dow)).
--      · RESERVADO: suma de duraciones (ends_at − starts_at) de las citas cuyo
--        starts_at cae en el periodo y cuyo estado NO es 'cancelled' (pending,
--        confirmed, completed y no_show ocuparon hueco; cancelled lo liberó).
--    Filtro opcional por sede (p_location_id): capacidad y reservas de los
--    profesionales de esa sede. Siempre UNA fila.
-- ==============================================================================
create or replace function public.salon_agenda_occupancy(
  p_salon_id    uuid,
  p_from        date,
  p_to          date,
  p_location_id uuid default null
)
returns table (
  capacity_minutes    bigint,
  booked_minutes      bigint,
  booked_appointments bigint,
  occupancy_rate      numeric   -- reservado / capacidad (0..1; puede >1 si sobrerreserva)
)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select * from app.salon_period_bounds(p_salon_id, p_from, p_to)
  ),
  days as (
    select generate_series(p_from::timestamp, p_to::timestamp, interval '1 day')::date as d
  ),
  pros as (
    select pr.id, pr.location_id
    from public.professionals pr
    where pr.salon_id = p_salon_id
      and pr.active
      and (p_location_id is null or pr.location_id = p_location_id)
  ),
  capacity as (
    select coalesce(sum(
      case
        when ex.professional_id is not null then
          case
            when ex.is_available
              then round(extract(epoch from (ex.end_time - ex.start_time)) / 60.0)
            else 0
          end
        else coalesce(sched.mins, 0)
      end
    ), 0) as minutes
    from days d
    cross join pros p
    left join public.schedule_exceptions ex
      on ex.salon_id = p_salon_id
     and ex.professional_id = p.id
     and ex.exception_date = d.d
    left join lateral (
      select sum(round(extract(epoch from (ps.end_time - ps.start_time)) / 60.0)) as mins
      from public.professional_schedules ps
      where ps.salon_id = p_salon_id
        and ps.professional_id = p.id
        and ps.weekday = extract(dow from d.d)::int
    ) sched on true
  ),
  booked as (
    select
      coalesce(sum(round(extract(epoch from (a.ends_at - a.starts_at)) / 60.0)), 0) as minutes,
      count(*) as appts
    from public.appointments a
    cross join b
    where a.salon_id = p_salon_id
      and a.status <> 'cancelled'
      and a.starts_at >= b.from_ts
      and a.starts_at <  b.to_ts
      and (
        p_location_id is null
        or exists (
          select 1 from public.professionals pr
          where pr.id = a.professional_id
            and pr.salon_id = p_salon_id
            and pr.location_id = p_location_id
        )
      )
  )
  select
    capacity.minutes::bigint,
    booked.minutes::bigint,
    booked.appts::bigint,
    case
      when capacity.minutes > 0
        then round((booked.minutes::numeric / capacity.minutes::numeric), 4)
      else 0
    end
  from capacity, booked;
$$;

comment on function public.salon_agenda_occupancy(uuid, date, date, uuid) is
  'Ocupación de agenda = minutos reservados (citas no canceladas) / minutos de capacidad (horario semanal + excepciones) en el periodo. Filtro opcional por sede. Ratio 0..1 (puede superar 1 con sobrerreserva).';

-- ──────────────────────────────────────────────────────────────────────────────
-- Permisos: solo usuarios autenticados (panel con sesión) y service_role
-- (usos administrativos de servidor). Nunca anon/public.
-- El helper app.salon_period_bounds también se acota a authenticated/service_role.
-- ──────────────────────────────────────────────────────────────────────────────
revoke all on function app.salon_period_bounds(uuid, date, date)                       from public;
revoke all on function public.salon_sales_summary(uuid, date, date)                     from public;
revoke all on function public.salon_revenue_timeseries(uuid, date, date, text)         from public;
revoke all on function public.salon_revenue_by_location(uuid, date, date)              from public;
revoke all on function public.salon_revenue_by_professional(uuid, date, date, integer) from public;
revoke all on function public.salon_top_items(uuid, date, date, text, integer)         from public;
revoke all on function public.salon_payment_method_distribution(uuid, date, date)      from public;
revoke all on function public.salon_new_vs_returning_customers(uuid, date, date)       from public;
revoke all on function public.salon_agenda_occupancy(uuid, date, date, uuid)           from public;

grant execute on function app.salon_period_bounds(uuid, date, date)                       to authenticated, service_role;
grant execute on function public.salon_sales_summary(uuid, date, date)                     to authenticated, service_role;
grant execute on function public.salon_revenue_timeseries(uuid, date, date, text)         to authenticated, service_role;
grant execute on function public.salon_revenue_by_location(uuid, date, date)              to authenticated, service_role;
grant execute on function public.salon_revenue_by_professional(uuid, date, date, integer) to authenticated, service_role;
grant execute on function public.salon_top_items(uuid, date, date, text, integer)         to authenticated, service_role;
grant execute on function public.salon_payment_method_distribution(uuid, date, date)      to authenticated, service_role;
grant execute on function public.salon_new_vs_returning_customers(uuid, date, date)       to authenticated, service_role;
grant execute on function public.salon_agenda_occupancy(uuid, date, date, uuid)           to authenticated, service_role;

commit;
