-- apps/atlas/supabase/migrations/20260829120000_periodos.sql
--
-- Cada mes de cada contrato activo, escrito.
--
-- Lo que no está registrado no se puede echar de menos: es la lección que dejó
-- el descubridor de tenants, donde una pasada que nunca ocurría se veía igual
-- que un sistema en calma. Aquí es lo mismo — un mes que nadie facturó no deja
-- rastro por sí solo.
--
-- El importe se CONGELA al materializar. Si se leyera de `contratos` al
-- consultar, subir la cuota reescribiría lo que se esperaba cobrar en meses
-- pasados, y el histórico dejaría de servir para comparar nada.
create or replace function atlas_materializar_periodos(mes date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  primero date := date_trunc('month', mes)::date;
  creados int := 0;
begin
  insert into periodos_contrato (contrato_id, periodo, importe_esperado)
  select c.id, primero, c.cuota_mensual
  from contratos c
  where c.estado = 'activo'
    and c.cuota_mensual is not null
    -- El contrato tiene que estar vivo ese mes: ni antes del alta ni después
    -- de la baja. Sin esto se materializarían meses de clientes que ya se
    -- fueron, y 2B perseguiría cobros que nadie debe.
    and c.alta <= (primero + interval '1 month - 1 day')::date
    and (c.baja is null or c.baja >= primero)
    and not exists (
      select 1 from periodos_contrato p
      where p.contrato_id = c.id and p.periodo = primero
    );

  get diagnostics creados = row_count;
  return creados;
end $$;

select cron.schedule('atlas-periodos-contrato', '13 6 1 * *',
                     $$select atlas_materializar_periodos(current_date)$$);
