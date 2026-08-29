-- apps/atlas/supabase/migrations/20260829110000_recurrentes.sql
--
-- Los doce recibos iguales del año.
--
-- «Los gastos entran a mano» solo es sostenible si a mano se meten los raros.
-- Vercel, Supabase, Twilio y Retell son siempre lo mismo, y teclearlos doce
-- veces al año acaba en que no se teclean y el coste sale bajo.
--
-- El mes entra POR PARÁMETRO y no se lee del reloj: así se puede probar
-- cualquier mes sin esperar a que llegue, igual que hace el resto de Atlas con
-- sus funciones de decisión.
create or replace function atlas_materializar_recurrentes(mes date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  primero date := date_trunc('month', mes)::date;
  creados int := 0;
begin
  insert into gastos (fecha, concepto, proveedor, base, iva, total, categoria,
                      cliente_id, proyecto_id, recurrente_id)
  select primero + (r.dia_del_mes - 1),
         r.concepto, r.proveedor, r.base, r.iva, r.base + r.iva, r.categoria,
         r.cliente_id, r.proyecto_id, r.id
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

-- El día 1 a las 6:07. Ni en punto ni a medianoche: los minutos redondos
-- concentran carga de tareas programadas en cualquier sistema.
select cron.schedule('atlas-gastos-recurrentes', '7 6 1 * *',
                     $$select atlas_materializar_recurrentes(current_date)$$);
