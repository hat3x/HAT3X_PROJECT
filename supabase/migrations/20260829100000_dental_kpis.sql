-- =============================================================================
-- salon-os — Migración: indicadores propios de clínica dental (B5)
--
-- `/analitica` cuenta hoy lo que cuenta un comercio: facturación, tickets,
-- ticket medio, métodos de pago. Un director de clínica mira otras cosas, y el
-- dato ya está en la base — solo que nadie lo suma.
--
-- Las tres funciones devuelven RECUENTOS EN CRUDO, no porcentajes. La decisión
-- de qué cuenta como aceptado y sobre qué se divide vive en
-- `src/lib/metrics/dental.ts`, donde está probada y documentada; repetirla aquí
-- en SQL sería tenerla en dos sitios y que un día dejen de coincidir.
--
-- Todas `security invoker`: el aislamiento por salón lo hace la RLS de las
-- tablas, igual que en `salon_sales_summary`. Y todas resuelven el periodo con
-- `app.salon_period_bounds`, que traduce las fechas locales a instantes en la
-- zona del salón: comparar un `timestamptz` contra una fecha desnuda desplaza
-- el corte y mueve citas de un día a otro.
-- =============================================================================

begin;

-- ── 1. Aceptación de presupuestos ───────────────────────────────────────────
-- Se filtra por `created_at` porque `treatment_plan` no guarda cuándo se
-- presentó: se mide "de los planes hechos en este periodo, cuántos cuajaron".
create or replace function public.salon_dental_plan_acceptance(
  p_salon_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  draft       bigint,
  proposed    bigint,
  accepted    bigint,
  in_progress bigint,
  completed   bigint,
  cancelled   bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where t.status = 'draft')::bigint,
    count(*) filter (where t.status = 'proposed')::bigint,
    count(*) filter (where t.status = 'accepted')::bigint,
    count(*) filter (where t.status = 'in_progress')::bigint,
    count(*) filter (where t.status = 'completed')::bigint,
    count(*) filter (where t.status = 'cancelled')::bigint
  from public.treatment_plan t
  cross join app.salon_period_bounds(p_salon_id, p_from, p_to) b
  where t.salon_id = p_salon_id
    and t.created_at >= b.from_ts
    and t.created_at <  b.to_ts;
$$;

comment on function public.salon_dental_plan_acceptance(uuid, date, date) is
  'Planes de tratamiento por estado, creados en [p_from, p_to] (fechas locales). Devuelve recuentos en crudo; la tasa se calcula en src/lib/metrics/dental.ts. SECURITY INVOKER (aislamiento por RLS).';

-- ── 2. Trabajo vendido y sin agendar ────────────────────────────────────────
-- SIN periodo a propósito: no es una estadística del mes, es una bolsa viva.
-- Un ítem propuesto en marzo y todavía sin fecha en agosto es justo el que hay
-- que rescatar, y un filtro por fechas lo escondería.
create or replace function public.salon_dental_unscheduled_work(
  p_salon_id uuid
)
returns table (
  items       bigint,
  patients    bigint,
  value_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::bigint,
    count(distinct t.customer_id)::bigint,
    coalesce(sum(i.line_total_cents), 0)::bigint
  from public.plan_item i
  join public.treatment_plan t
    on t.id = i.plan_id and t.salon_id = i.salon_id
  where i.salon_id = p_salon_id
    and i.state = 'propuesto'
    and i.scheduled_appointment_id is null
    -- Un plan anulado no deja trabajo pendiente: sus ítems ya no cuentan.
    and t.status <> 'cancelled';
$$;

comment on function public.salon_dental_unscheduled_work(uuid) is
  'Cartera viva: ítems de plan en estado propuesto y sin cita asignada, con su valor en céntimos y a cuántos pacientes afecta. Sin ventana temporal: lo antiguo es precisamente lo que hay que rescatar. SECURITY INVOKER.';

-- ── 3. Desenlace de las citas ───────────────────────────────────────────────
create or replace function public.salon_dental_appointment_outcomes(
  p_salon_id uuid,
  p_from     date,
  p_to       date
)
returns table (
  no_show   bigint,
  completed bigint,
  cancelled bigint,
  pending   bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where a.status = 'no_show')::bigint,
    count(*) filter (where a.status = 'completed')::bigint,
    count(*) filter (where a.status = 'cancelled')::bigint,
    count(*) filter (where a.status in ('pending', 'confirmed'))::bigint
  from public.appointments a
  cross join app.salon_period_bounds(p_salon_id, p_from, p_to) b
  where a.salon_id = p_salon_id
    and a.starts_at >= b.from_ts
    and a.starts_at <  b.to_ts;
$$;

comment on function public.salon_dental_appointment_outcomes(uuid, date, date) is
  'Citas por desenlace en [p_from, p_to] (fechas locales). Recuentos en crudo: la tasa de ausencias se calcula en src/lib/metrics/dental.ts, que excluye del denominador las canceladas (avisar no es faltar) y las pendientes (la agenda futura no mide nada). SECURITY INVOKER.';

commit;
