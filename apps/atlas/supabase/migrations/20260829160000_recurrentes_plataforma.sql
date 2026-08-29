--
-- Ajusta la materialización de recibos fijos al cambio de `proveedor` por
-- `plataforma_id`.
--
-- La migración anterior eliminó `gastos.proveedor` sin caer en que
-- `atlas_materializar_recurrentes` lo escribía. La función quedó rota: su
-- `insert` nombraba una columna que ya no existe.
--
-- Se corrige con un `create or replace` encima, no editando la migración ya
-- aplicada. Y es justo lo que los tests existen para cazar: el fallo se vio en
-- la batería, no el día 1 del mes que viene, que es cuando el cron habría
-- intentado materializar y habría fallado sin que nadie mirara.
create or replace function atlas_materializar_recurrentes(mes date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  primero date := date_trunc('month', mes)::date;
  creados int := 0;
begin
  insert into gastos (fecha, concepto, plataforma_id, base, iva, total,
                      categoria, cliente_id, proyecto_id, recurrente_id)
  select primero + (r.dia_del_mes - 1),
         r.concepto, r.plataforma_id, r.base, r.iva, r.base + r.iva,
         r.categoria, r.cliente_id, r.proyecto_id, r.id
  from gastos_recurrentes r
  where r.activo
    -- Idempotente: si la pasada de este mes ya ocurrió, no duplica. Un cron
    -- que se dispara dos veces no puede doblar los gastos del mes.
    and not exists (
      select 1 from gastos g
      where g.recurrente_id = r.id
        and date_trunc('month', g.fecha) = primero
    );

  get diagnostics creados = row_count;
  return creados;
end $$;

-- El `create or replace` restablece los privilegios por defecto de Postgres,
-- que conceden EXECUTE a PUBLIC. Sin volver a revocarlo, PostgREST expondría
-- otra vez la función a cualquier autenticado y, por ser `security definer`,
-- se saltaría la seguridad de fila de `gastos`.
revoke all on function atlas_materializar_recurrentes(date) from public;
revoke all on function atlas_materializar_recurrentes(date) from anon;
revoke all on function atlas_materializar_recurrentes(date) from authenticated;
