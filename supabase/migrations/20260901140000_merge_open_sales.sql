-- =============================================================================
-- salon-os — RPC: fundir varios tickets abiertos en uno
--
-- ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
-- José, describiendo el caso normal de una clínica: «una persona se hace una
-- limpieza y un blanqueamiento; a lo mejor un día se hace la limpieza y otro
-- día el blanqueamiento, y Nadia aprovecha a cobrar las dos cosas».
--
-- El tratamiento se hace por partes y se cobra de una vez. Cada parte dejó su
-- ticket abierto al pasar el presupuesto a caja, y al cobrar hay que juntarlos:
-- el paciente paga UNA vez, así que tiene que haber UN ticket y UNA factura.
--
-- ── POR QUÉ FUNDIR Y NO COBRAR VARIOS A LA VEZ ──────────────────────────────
-- Un cobro pertenece a una venta: los `pos_payments` cuelgan de un `sale_id`.
-- "Cobrar dos tickets con un pago de 500 €" no se puede representar sin
-- inventar un reparto —y ese reparto sería una mentira contable en cuanto los
-- importes no cuadren—. Fundir primero deja la caja como el caso de siempre.
--
-- ── POR QUÉ ES UNA FUNCIÓN Y NO CUATRO LLAMADAS ─────────────────────────────
-- Fundir son cuatro escrituras: mover las líneas, repuntar las líneas de
-- presupuesto, anular los tickets absorbidos y recalcular los totales del que
-- queda. Hechas por separado, un fallo entre medias deja dinero mal contado:
--
--   · si falla tras mover las líneas → un ticket con líneas de 500 € y un total
--     que sigue diciendo 200, y se le cobra de menos al paciente;
--   · si falla tras anular los otros → líneas de presupuesto colgando de un
--     ticket anulado, que el eje de cobro leerá como "sin pasar a caja" y
--     alguien volverá a mandar a caja.
--
-- Dentro de una función es una sola transacción: o pasa todo, o no pasa nada.
--
-- ── QUÉ NO HACE ─────────────────────────────────────────────────────────────
-- No cobra. Deja UN ticket abierto, y cobrarlo es el camino de siempre.
-- =============================================================================

begin;

create or replace function public.merge_open_sales(
  p_salon_id       uuid,
  p_sale_ids       uuid[],
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_tax_cents      integer,
  p_total_cents    integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_destino    uuid;
  v_cliente    uuid;
  v_clientes   integer;
  v_abiertas   integer;
begin
  if p_sale_ids is null or array_length(p_sale_ids, 1) is null then
    raise exception 'No se ha indicado ningún ticket que fundir';
  end if;
  if array_length(p_sale_ids, 1) < 2 then
    raise exception 'Hacen falta al menos dos tickets para fundirlos';
  end if;

  -- ── Bloquear y comprobar ─────────────────────────────────────────────────
  -- `security invoker`: las políticas RLS del usuario siguen aplicando, así que
  -- estas consultas no alcanzan tickets de otro salón aunque les pasen sus ids.
  --
  -- Bloqueo y recuento van en DOS sentencias: Postgres no admite `FOR UPDATE`
  -- junto a una función de agregado (error 0A000).
  perform 1
     from public.pos_sales s
    where s.id = any(p_sale_ids)
      and s.salon_id = p_salon_id
      for update;

  select count(*), count(distinct s.customer_id), min(s.customer_id)
    into v_abiertas, v_clientes, v_cliente
    from public.pos_sales s
   where s.id = any(p_sale_ids)
     and s.salon_id = p_salon_id
     and s.status = 'open';

  if v_abiertas <> array_length(p_sale_ids, 1) then
    raise exception 'Alguno de los tickets ya no está abierto. Actualiza la pantalla y vuelve a mirarlo.';
  end if;

  -- Un ticket es de una persona. Fundir los de dos pacientes mezclaría su
  -- histórico y su factura, que es exactamente lo que no puede pasar.
  if v_clientes <> 1 or v_cliente is null then
    raise exception 'No se pueden fundir tickets de pacientes distintos';
  end if;

  -- ── El que sobrevive: el más antiguo ─────────────────────────────────────
  -- Conserva la fecha en que empezó el tratamiento, que es la que el paciente
  -- reconoce. Y al ser determinista, dos personas pulsando a la vez funden
  -- hacia el mismo sitio en lugar de cruzarse.
  select s.id
    into v_destino
    from public.pos_sales s
   where s.id = any(p_sale_ids)
     and s.salon_id = p_salon_id
   order by s.sold_at asc, s.id asc
   limit 1;

  -- ── Mover las líneas ─────────────────────────────────────────────────────
  update public.pos_sale_lines
     set sale_id = v_destino
   where sale_id = any(p_sale_ids)
     and sale_id <> v_destino
     and salon_id = p_salon_id;

  -- ── Repuntar las líneas de presupuesto ───────────────────────────────────
  -- Sin esto, el presupuesto de la parte absorbida quedaría colgando de un
  -- ticket anulado y el eje de cobro lo leería como "sin pasar a caja".
  update public.plan_item
     set pos_sale_id = v_destino
   where pos_sale_id = any(p_sale_ids)
     and pos_sale_id <> v_destino
     and salon_id = p_salon_id;

  -- ── Anular los absorbidos ────────────────────────────────────────────────
  -- Anulados y no borrados: la fila cuenta lo que pasó. Un ticket que existió
  -- y se fundió en otro es información, no basura.
  update public.pos_sales
     set status = 'voided',
         notes  = trim(both from coalesce(notes, '') || ' [fundido en ' || v_destino::text || ']')
   where id = any(p_sale_ids)
     and id <> v_destino
     and salon_id = p_salon_id;

  -- ── Los totales del que queda ────────────────────────────────────────────
  -- Llegan ya calculados por `computeSaleTotals`, el mismo que usa el TPV, igual
  -- que en `create_sale_from_plan_items`. Repetir aquí el reparto del IVA sería
  -- tener dos implementaciones del mismo redondeo condenadas a divergir, y un
  -- céntimo de diferencia entre lo que enseña la pantalla y lo que guarda la
  -- base es un descuadre de caja.
  update public.pos_sales
     set subtotal_cents = p_subtotal_cents,
         discount_cents = p_discount_cents,
         tax_cents      = p_tax_cents,
         total_cents    = p_total_cents
   where id = v_destino
     and salon_id = p_salon_id;

  return v_destino;
end;
$$;

comment on function public.merge_open_sales is
  'Funde varios tickets ABIERTOS del mismo paciente en el más antiguo, de forma atómica: mueve sus líneas, repunta las líneas de presupuesto, anula los absorbidos y fija los totales que le pasa la aplicación. No cobra: deja un solo ticket abierto listo para caja.';

grant execute on function public.merge_open_sales(uuid, uuid[], integer, integer, integer, integer) to authenticated;

commit;
