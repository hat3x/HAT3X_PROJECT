-- =============================================================================
-- salon-os — RPC de staff: staff_award_visit
--
-- Puente para la APP DE STAFF (Vite → Supabase directo, FASE 3C). Replica la
-- Server Action `awardVisit` (@/lib/loyalty/server.ts) como RPC invocable por el
-- PERSONAL autenticado del salón vía supabase.rpc(). Acredita la visita: calcula
-- puntos, evalúa el hito 3/5/8/10, canjea el cupón de bienvenida e inserta el
-- movimiento EARN. Idempotente por (ref_type, ref_id).
--
-- Reglas replicadas EXACTAS (ver points.ts / server.ts):
--   · puntos de línea = coalesce(points_override, ceil(price_cents / 200))  [1 pto ≈ 2€]
--   · hitos: 3→SCALP_DIAGNOSIS, 5→EXPRESS_TREATMENT, 8→RETAIL_VOUCHER, 10→PACK_UPGRADE
--     (recompensa AVAILABLE, code 'RW-<3>-<6>', expira +90 días; a lo sumo UNA por visita)
--   · cupón: si redeem, marca el ACTIVE no caducado más antiguo como USED y calcula
--     descuento = round(precio_total * percent_off/100) saturado al total.
--   · idempotencia: si ya hay EARN con esta (ref_type, ref_id) → no-op (already_awarded).
--
-- SEGURIDAD:
--   · SECURITY DEFINER + search_path='' con GATE explícito: el que llama DEBE ser
--     MIEMBRO de p_salon_id (public.salon_members). Nunca escribe en otro salón.
--   · EXECUTE solo a `authenticated`.
-- =============================================================================

create or replace function public.staff_award_visit(
  p_salon_id      uuid,
  p_customer_id   uuid    default null,
  p_qr_token      text    default null,
  p_line_items    jsonb   default '[]'::jsonb,
  p_redeem_coupon boolean default false,
  p_ref_type      text    default null,
  p_ref_id        text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_customer   public.customers%rowtype;
  v_account    public.loyalty_accounts%rowtype;
  v_coupon     public.welcome_coupons%rowtype;
  v_line       jsonb;
  v_line_pts   int;
  v_pts_total  int := 0;
  v_price_tot  int := 0;
  v_new_bal    int;
  v_new_vis    int;
  v_ref_id     uuid := null;
  v_reason     text;
  v_labels     text;
  v_mtype      text;
  v_code       text;
  v_reward_id  uuid;
  v_reward     jsonb := null;
  v_redeemed   jsonb := null;
  v_discount   int := 0;
  v_now        timestamptz := now();
  v_exp        timestamptz;
  i            int;
begin
  -- 1) Auth + pertenencia al salón.
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  perform 1 from public.salon_members where user_id = v_uid and salon_id = p_salon_id;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 2) Resolver cliente por id o qr_token, SIEMPRE dentro del salón.
  if p_customer_id is not null then
    select * into v_customer from public.customers
      where id = p_customer_id and salon_id = p_salon_id;
  elsif p_qr_token is not null then
    select * into v_customer from public.customers
      where qr_token = p_qr_token and salon_id = p_salon_id;
  else
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 3) ref_id → uuid (ancla de idempotencia); si no parsea, se ignora.
  if p_ref_id is not null and p_ref_id <> '' then
    begin
      v_ref_id := p_ref_id::uuid;
    exception when others then
      v_ref_id := null;
    end;
  end if;

  -- 4) Idempotencia: EARN previo con esta referencia → devolver estado sin re-sumar.
  if v_ref_id is not null then
    perform 1 from public.points_movements
      where salon_id = p_salon_id and customer_id = v_customer.id and type = 'EARN'
        and ref_id = v_ref_id and (ref_type is not distinct from p_ref_type);
    if found then
      select * into v_account from public.loyalty_accounts
        where salon_id = p_salon_id and customer_id = v_customer.id;
      return jsonb_build_object(
        'points_earned', 0,
        'points_balance', coalesce(v_account.points_balance, 0),
        'visits_total',  coalesce(v_account.visits_total, 0),
        'redeemed_coupon', null, 'discount_cents', 0, 'reward', null,
        'already_awarded', true
      );
    end if;
  end if;

  -- 5) Puntos + precio total desde las líneas.
  if jsonb_typeof(p_line_items) <> 'array' or jsonb_array_length(p_line_items) = 0 then
    raise exception 'NO_LINES' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(p_line_items) loop
    if (v_line ? 'points') and (v_line->>'points') is not null then
      v_line_pts := (v_line->>'points')::int;
      if v_line_pts < 0 then raise exception 'INVALID_LINE' using errcode = '22023'; end if;
    else
      v_line_pts := ceil( ((v_line->>'price_cents')::int) / 200.0 )::int;
    end if;
    v_pts_total := v_pts_total + v_line_pts;
    v_price_tot := v_price_tot + (v_line->>'price_cents')::int;
  end loop;

  -- 6) Cuenta (asegurar) + nuevos totales.
  insert into public.loyalty_accounts (salon_id, customer_id)
    values (p_salon_id, v_customer.id)
    on conflict (salon_id, customer_id) do nothing;
  select * into v_account from public.loyalty_accounts
    where salon_id = p_salon_id and customer_id = v_customer.id;

  v_new_bal := v_account.points_balance + v_pts_total;
  v_new_vis := v_account.visits_total + 1;

  update public.loyalty_accounts
    set points_balance = v_new_bal, visits_total = v_new_vis,
        last_visit_at = v_now, last_activity_at = v_now
    where id = v_account.id and salon_id = p_salon_id;

  -- 7) Movimiento EARN (motivo con etiquetas de línea).
  select string_agg(x.label, ', ') into v_labels
    from (
      select nullif(btrim(e->>'label'), '') as label
      from jsonb_array_elements(p_line_items) e
    ) x
    where x.label is not null;
  v_reason := left(
    'Visita verificada: ' || coalesce(nullif(v_labels, ''), jsonb_array_length(p_line_items)::text || ' línea(s)'),
    500);

  insert into public.points_movements (salon_id, customer_id, type, points, reason, ref_type, ref_id)
    values (p_salon_id, v_customer.id, 'EARN', v_pts_total, v_reason, p_ref_type, v_ref_id);

  -- 8) Hito 3/5/8/10 → recompensa AVAILABLE (reintenta si choca el code único).
  v_mtype := case v_new_vis
    when 3  then 'SCALP_DIAGNOSIS'
    when 5  then 'EXPRESS_TREATMENT'
    when 8  then 'RETAIL_VOUCHER'
    when 10 then 'PACK_UPGRADE'
    else null end;
  if v_mtype is not null then
    v_exp := v_now + interval '90 days';
    for i in 1..5 loop
      v_code := 'RW-' || upper(left(v_mtype, 3)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
      begin
        insert into public.rewards (salon_id, customer_id, type, code, status, expires_at)
          values (p_salon_id, v_customer.id, v_mtype, v_code, 'AVAILABLE', v_exp)
          returning id into v_reward_id;
        v_reward := jsonb_build_object('id', v_reward_id, 'type', v_mtype, 'code', v_code, 'expires_at', v_exp);
        exit;
      exception when unique_violation then
        -- colisión (astronómicamente improbable): reintentar con otro sufijo.
      end;
    end loop;
  end if;

  -- 9) Canje del cupón de bienvenida (el ACTIVE no caducado más antiguo).
  if p_redeem_coupon then
    select * into v_coupon from public.welcome_coupons
      where salon_id = p_salon_id and customer_id = v_customer.id
        and status = 'ACTIVE' and expires_at > v_now
      order by created_at asc
      limit 1;
    if found then
      update public.welcome_coupons set status = 'USED', used_at = v_now
        where id = v_coupon.id and status = 'ACTIVE';
      if found then
        v_discount := least( round(v_price_tot * v_coupon.percent_off / 100.0)::int, v_price_tot );
        v_redeemed := jsonb_build_object('id', v_coupon.id, 'percent_off', v_coupon.percent_off, 'expires_at', v_coupon.expires_at);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'points_earned',   v_pts_total,
    'points_balance',  v_new_bal,
    'visits_total',    v_new_vis,
    'redeemed_coupon', v_redeemed,
    'discount_cents',  v_discount,
    'reward',          v_reward,
    'already_awarded', false
  );
end;
$$;

comment on function public.staff_award_visit(uuid, uuid, text, jsonb, boolean, text, text) is
  'App de staff: acredita una visita de fidelización (puntos + hito + canje de cupón) para un cliente del salón. Gate por pertenencia (salon_members). Replica awardVisit. Idempotente por (ref_type, ref_id).';

revoke all on function public.staff_award_visit(uuid, uuid, text, jsonb, boolean, text, text) from public;
grant execute on function public.staff_award_visit(uuid, uuid, text, jsonb, boolean, text, text) to authenticated;
