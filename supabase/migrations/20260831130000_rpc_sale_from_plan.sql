-- =============================================================================
-- salon-os — RPC: pasar líneas de un presupuesto a caja
--
-- ── POR QUÉ ES UNA FUNCIÓN Y NO TRES LLAMADAS DESDE LA APLICACIÓN ───────────
-- Pasar un presupuesto a caja son tres escrituras: crear la venta, crear sus
-- líneas y marcar las líneas del plan con esa venta. Hechas por separado desde
-- el cliente, cualquier fallo entre medias deja el sistema mintiendo:
--
--   · si falla tras crear la venta → un ticket vacío en la caja;
--   · si falla tras crear las líneas → un ticket cobrable cuyo presupuesto
--     sigue diciendo "sin pasar a caja", así que alguien lo manda otra vez y al
--     paciente se le cobra dos veces.
--
-- Dentro de una función es una sola transacción: o pasa todo, o no pasa nada.
--
-- ── LA CARRERA QUE CIERRA EL `FOR UPDATE` ───────────────────────────────────
-- Entre que la pantalla lee "esta línea se puede cobrar" y que se pulsa el
-- botón pueden pasar segundos, y en una recepción hay dos personas con la misma
-- ficha abierta. Sin bloqueo, las dos crearían su ticket con las mismas líneas.
-- El `select ... for update` serializa: la segunda espera, ve que las líneas ya
-- tienen venta y falla con un mensaje en vez de duplicar el cobro.
--
-- ── LA ARITMÉTICA NO SE REHACE AQUÍ ─────────────────────────────────────────
-- Los importes llegan ya calculados por `computeSaleTotals`, que está probado y
-- es el mismo que usa el TPV. Repetir aquí el reparto de IVA sería tener dos
-- implementaciones del mismo redondeo destinadas a divergir, y un céntimo de
-- diferencia entre lo que enseña la pantalla y lo que guarda la base es un
-- descuadre de caja.
-- =============================================================================

begin;

create or replace function app.create_sale_from_plan_items(
  p_salon_id        uuid,
  p_customer_id     uuid,
  p_item_ids        uuid[],
  p_lines           jsonb,
  p_subtotal_cents  integer,
  p_discount_cents  integer,
  p_tax_cents       integer,
  p_total_cents     integer,
  p_professional_id uuid default null,
  p_notes           text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sale_id    uuid;
  v_bloqueadas integer;
  v_ocupadas   integer;
begin
  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'No se ha indicado ninguna línea que cobrar';
  end if;

  -- ── Bloquear las líneas y comprobar que siguen siendo cobrables ──────────
  -- `security invoker`: las políticas de RLS del usuario siguen aplicando, así
  -- que estas consultas no pueden alcanzar líneas de otro salón aunque le pasen
  -- sus ids.
  --
  -- Bloqueo y recuento van en DOS sentencias porque Postgres no admite
  -- `FOR UPDATE` junto a una función de agregado: `select count(*) ... for
  -- update` es un error 0A000. Primero se toman los cerrojos, después se cuenta
  -- sobre las filas ya bloqueadas.
  perform 1
     from public.plan_item pi
    where pi.id = any(p_item_ids)
      and pi.salon_id = p_salon_id
      for update;

  select count(*)
    into v_bloqueadas
    from public.plan_item pi
   where pi.id = any(p_item_ids)
     and pi.salon_id = p_salon_id;

  if v_bloqueadas <> array_length(p_item_ids, 1) then
    raise exception 'Alguna línea no existe o no es de esta clínica';
  end if;

  -- Ya bloqueadas: ahora sí se puede mirar su estado sin que cambie debajo.
  -- Una venta anulada NO cuenta como ocupada — la línea volvió a estar libre.
  select count(*)
    into v_ocupadas
    from public.plan_item pi
    join public.pos_sales s on s.id = pi.pos_sale_id
   where pi.id = any(p_item_ids)
     and s.status <> 'voided';

  if v_ocupadas > 0 then
    raise exception 'Alguna línea ya está en un ticket. Actualiza la pantalla y vuelve a intentarlo.';
  end if;

  -- ── La venta, abierta ────────────────────────────────────────────────────
  -- `open` y no `completed`: esto crea el ticket, no lo cobra. Cobrar es un
  -- acto que ocurre en la caja, con el paciente delante y un método de pago.
  insert into public.pos_sales (
    salon_id, customer_id, professional_id, status,
    subtotal_cents, discount_cents, tax_cents, total_cents,
    sold_by, notes
  ) values (
    p_salon_id, p_customer_id, p_professional_id, 'open',
    p_subtotal_cents, p_discount_cents, p_tax_cents, p_total_cents,
    auth.uid(), p_notes
  )
  returning id into v_sale_id;

  -- ── Las líneas ───────────────────────────────────────────────────────────
  insert into public.pos_sale_lines (
    salon_id, sale_id, service_id, description,
    quantity, unit_price_cents, discount_cents, vat_rate, line_total_cents
  )
  select
    p_salon_id,
    v_sale_id,
    nullif(l->>'service_id', '')::uuid,
    l->>'description',
    (l->>'quantity')::numeric,
    (l->>'unit_price_cents')::integer,
    (l->>'discount_cents')::integer,
    (l->>'vat_rate')::numeric,
    (l->>'line_total_cents')::integer
  from jsonb_array_elements(p_lines) as l;

  -- ── Marcar el presupuesto ────────────────────────────────────────────────
  update public.plan_item
     set pos_sale_id = v_sale_id
   where id = any(p_item_ids)
     and salon_id = p_salon_id;

  return v_sale_id;
end;
$$;

comment on function app.create_sale_from_plan_items is
  'Pasa líneas de un presupuesto a un ticket ABIERTO del TPV, de forma atómica. Bloquea las líneas para que dos personas no puedan crear dos tickets con las mismas y cobrarle dos veces al paciente. Los importes llegan calculados por la aplicación: la aritmética de IVA vive en un solo sitio.';

grant execute on function app.create_sale_from_plan_items(
  uuid, uuid, uuid[], jsonb, integer, integer, integer, integer, uuid, text
) to authenticated;

commit;
