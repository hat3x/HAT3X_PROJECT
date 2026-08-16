--
-- Tres capas:
--   0-7 días   → cada resultado individual, en check_resultados
--   7-90 días  → un agregado por hora
--   >90 días   → un agregado por día, sin caducidad
--
-- Sin esto, check_resultados agota los 500 MB del plan gratuito en unos meses,
-- y arreglarlo entonces es una migración dolorosa con la base ya llena.
--
-- La cifra de uptime NO cambia al consolidar: detalle y agregados alimentan los
-- mismos contadores (ver src/lib/uptime/calcular.ts).
--

create or replace function atlas_consolidar_retencion() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- 1) Detalle de más de 7 días → agregados horarios.
  insert into check_agregados (check_id, bucket, granularidad, total, ok,
                               latencia_p50, latencia_p95)
  select
    check_id,
    date_trunc('hour', ts) as bucket,
    'hora',
    count(*)::int,
    count(*) filter (where ok)::int,
    percentile_disc(0.50) within group (order by latencia_ms)::int,
    percentile_disc(0.95) within group (order by latencia_ms)::int
  from check_resultados
  where ts < now() - interval '7 days'
  group by check_id, date_trunc('hour', ts)
  -- Idempotente: relanzarla sobre datos ya consolidados no cambia nada.
  on conflict (check_id, bucket, granularidad) do nothing;

  delete from check_resultados where ts < now() - interval '7 days';

  -- 2) Agregados horarios de más de 90 días → diarios.
  insert into check_agregados (check_id, bucket, granularidad, total, ok,
                               latencia_p50, latencia_p95)
  select
    check_id,
    date_trunc('day', bucket) as bucket,
    'dia',
    sum(total)::int,
    sum(ok)::int,
    -- Media ponderada de las medianas horarias: no es el percentil exacto del
    -- día, y es honesto decirlo. A 90 días vista, la tendencia basta.
    (sum(coalesce(latencia_p50, 0) * total) / nullif(sum(total), 0))::int,
    max(latencia_p95)::int
  from check_agregados
  where granularidad = 'hora' and bucket < now() - interval '90 days'
  group by check_id, date_trunc('day', bucket)
  on conflict (check_id, bucket, granularidad) do nothing;

  delete from check_agregados
  where granularidad = 'hora' and bucket < now() - interval '90 days';
end $$;
