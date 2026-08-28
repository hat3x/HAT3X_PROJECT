-- ───────────────────────────────────────────────────────────────────────────
-- FIX: el Histórico de caja consulta la vista public.v_pedidos_agregados que
-- no existía (error PGRST205 "Could not find the table ... in the schema cache").
-- Esta vista agrega los pedidos por hora/día/mes/año (en horario Europe/Madrid)
-- con nº de tickets e ingresos, que es justo lo que pide Historico.tsx.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_pedidos_agregados AS
SELECT
  date_trunc('hour',  created_at AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid' AS hora,
  date_trunc('day',   created_at AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid' AS dia,
  date_trunc('month', created_at AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid' AS mes,
  date_trunc('year',  created_at AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid' AS anio,
  estado,
  count(*)::int                    AS tickets,
  coalesce(sum(total), 0)::numeric AS ingresos
FROM public.pedidos
GROUP BY 1, 2, 3, 4, 5;

-- Solo el personal autenticado (dashboard) puede leer los agregados.
GRANT SELECT ON public.v_pedidos_agregados TO authenticated;
