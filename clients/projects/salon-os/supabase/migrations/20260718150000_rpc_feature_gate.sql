-- =============================================================================
-- salon-os — Feature-gating de las RPC de fidelización (productización)
--
-- Cablea las DOS RPC de escritura del cliente/staff al catálogo de entitlements
-- (public.salon_features, ver 20260718100000_salon_features.sql) para que un
-- módulo NO opere si el salón no ha contratado —y activado— su add-on:
--
--   · public.register_my_customer_account  ⇒ exige 'client_app' Y 'loyalty'
--   · public.staff_award_visit             ⇒ exige 'staff_app'  Y 'loyalty'
--
-- Si falta CUALQUIERA de los dos add-ons (fila ausente o enabled=false):
--   raise exception 'FEATURE_NOT_ENABLED' using errcode = 'P0001';
-- Mismo SQLSTATE (P0001 / raise_exception) que el resto de errores de negocio de
-- estas funciones (p. ej. PHONE_CONFLICT), para que la capa que las invoca los
-- discrimine por el MENSAJE, no por un código nuevo.
--
-- CÓMO — CREATE OR REPLACE que reescribe cada función IDÉNTICA salvo por insertar
-- el gate. NO cambia la FIRMA (misma lista de argumentos y tipos) ni el CONTRATO
-- DE SALIDA (mismo jsonb). Todo lo demás se conserva byte a byte: identidad por
-- teléfono e idempotencia de register; puntos/hitos/canje de cupón e idempotencia
-- por (ref_type, ref_id) de award; y los gates de auth y de pertenencia.
--
-- DÓNDE va el gate (para NO alterar el orden de errores existente):
--   · register — DESPUÉS de comprobar que el salón existe (SALON_NOT_FOUND se
--     mantiene para salones inexistentes; app.salon_has_feature() sobre un salón
--     inexistente devolvería false y enmascararía ese error si fuera antes) y
--     ANTES de tocar/crear fichas: sin add-on no se crea ni enlaza nada.
--   · award — DESPUÉS del gate de pertenencia (auth + salon_members intactos) y
--     ANTES de resolver cliente o mover puntos: sin add-on no se escribe nada.
--
-- El gate usa app.salon_has_feature(p_salon_id, <feature>) — el helper del propio
-- catálogo (SECURITY DEFINER + STABLE), no una consulta suelta a salon_features:
-- así estas RPC (que ya son SECURITY DEFINER con search_path='') no dependen de
-- RLS ni duplican la semántica opt-in (fila presente Y enabled=true).
--
-- Idempotente y re-ejecutable: CREATE OR REPLACE conserva propietario y privilegios
-- (los grants existentes siguen), y aun así se re-afirman abajo por robustez.
-- Envuelto en transacción con un guardián de aserción final (patrón de la casa):
-- si una regresión futura reescribiera alguna función SIN el gate, la migración
-- (o su re-ejecución en CI) ABORTA de forma ruidosa.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1) register_my_customer_account — + gate 'client_app' Y 'loyalty'
--    (idéntica a 20260717140000_rpc_register_customer.sql salvo el paso 3.1)
-- ------------------------------------------------------------------------------
create or replace function public.register_my_customer_account(
  p_salon_id  uuid,
  p_phone     text,
  p_full_name text,
  p_email     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_phone     text;
  v_name      text;
  v_email     text;
  v_existing  public.customers%rowtype;
  v_customer  public.customers%rowtype;
  v_outcome   text;
begin
  -- 1) Autoservicio: hace falta sesión; el user_id SIEMPRE es el del JWT.
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  v_name := btrim(coalesce(p_full_name, ''));
  if v_name = '' then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  v_name := left(v_name, 120);

  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');

  -- 2) Teléfono → E.164; sin número real no hay identidad.
  v_phone := app.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;

  -- 3) El salón debe existir.
  perform 1 from public.salons where id = p_salon_id;
  if not found then
    raise exception 'SALON_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 3.1) GATE DE ENTITLEMENTS (productización): la app de cliente solo opera si el
  --      salón tiene contratados y ACTIVOS los add-ons 'client_app' y 'loyalty'.
  --      Va tras SALON_NOT_FOUND (así ese error se mantiene para salones que no
  --      existen) y antes de tocar/crear fichas: sin add-on no se enlaza ni crea.
  if not (app.salon_has_feature(p_salon_id, 'client_app')
          and app.salon_has_feature(p_salon_id, 'loyalty')) then
    raise exception 'FEATURE_NOT_ENABLED' using errcode = 'P0001';
  end if;

  -- 4) ¿Existe ya la persona (por teléfono) en este salón?
  select * into v_existing
    from public.customers
    where salon_id = p_salon_id and phone_e164 = v_phone;

  if found then
    if v_existing.user_id = v_uid then
      v_customer := v_existing;
      v_outcome  := 'already_linked';
    elsif v_existing.user_id is not null then
      raise exception 'PHONE_CONFLICT' using errcode = 'P0001';
    else
      -- Ficha sin cuenta → enlazar (condicional a que siga sin cuenta: guarda carreras).
      update public.customers
        set user_id = v_uid
        where id = v_existing.id and salon_id = p_salon_id and user_id is null
        returning * into v_customer;
      if found then
        v_outcome := 'linked';
      else
        select * into v_customer from public.customers where id = v_existing.id;
        if found and v_customer.user_id = v_uid then
          v_outcome := 'already_linked';
        else
          raise exception 'PHONE_CONFLICT' using errcode = 'P0001';
        end if;
      end if;
    end if;
  else
    -- 5) Sin ficha por teléfono: ¿la cuenta ya tiene ficha en este salón (otro teléfono)?
    select * into v_existing
      from public.customers
      where salon_id = p_salon_id and user_id = v_uid;
    if found then
      v_customer := v_existing;
      v_outcome  := 'already_linked';
    else
      insert into public.customers (salon_id, user_id, phone, full_name, email)
        values (p_salon_id, v_uid, p_phone, v_name, v_email)
        returning * into v_customer;
      v_outcome := 'created';
    end if;
  end if;

  return jsonb_build_object(
    'customer_id', v_customer.id,
    'qr_token',    v_customer.qr_token,
    'outcome',     v_outcome
  );
end;
$$;

comment on function public.register_my_customer_account(uuid, text, text, text) is
  'Autoservicio app de cliente: enlaza/crea la ficha del usuario autenticado (auth.uid()) en un salón, identificando por teléfono (E.164). Replica linkOrCreateCustomerAccount. Asume teléfono verificado por OTP aguas arriba. Feature-gate (productización): exige los add-ons client_app y loyalty activos (app.salon_has_feature); si falta alguno → FEATURE_NOT_ENABLED (errcode P0001).';

-- Solo usuarios autenticados; nunca anon. (CREATE OR REPLACE conserva los grants;
-- se re-afirman por robustez e idempotencia.)
revoke all on function public.register_my_customer_account(uuid, text, text, text) from public;
grant execute on function public.register_my_customer_account(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 2) staff_award_visit — + gate 'staff_app' Y 'loyalty'
--    (idéntica a 20260717150000_rpc_staff_award_visit.sql salvo el paso 1.1)
-- ------------------------------------------------------------------------------
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

  -- 1.1) GATE DE ENTITLEMENTS (productización): la app de staff solo acredita
  --      visitas si el salón tiene contratados y ACTIVOS los add-ons 'staff_app' y
  --      'loyalty'. Va tras el gate de pertenencia (auth + salon_members intactos)
  --      y antes de resolver cliente o mover puntos: sin add-on no se escribe nada.
  if not (app.salon_has_feature(p_salon_id, 'staff_app')
          and app.salon_has_feature(p_salon_id, 'loyalty')) then
    raise exception 'FEATURE_NOT_ENABLED' using errcode = 'P0001';
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
  'App de staff: acredita una visita de fidelización (puntos + hito + canje de cupón) para un cliente del salón. Gate por pertenencia (salon_members). Replica awardVisit. Idempotente por (ref_type, ref_id). Feature-gate (productización): exige los add-ons staff_app y loyalty activos (app.salon_has_feature); si falta alguno → FEATURE_NOT_ENABLED (errcode P0001).';

revoke all on function public.staff_award_visit(uuid, uuid, text, jsonb, boolean, text, text) from public;
grant execute on function public.staff_award_visit(uuid, uuid, text, jsonb, boolean, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 3) Guardián de aserción (defensa en profundidad — patrón de la casa: loyalty_base
--    §6 / rls_multitenant_guard / salon_features §5 / get_salon_branding). Verifica
--    que AMBAS RPC existen, siguen SECURITY DEFINER, y su cuerpo cablea el gate al
--    catálogo (app.salon_has_feature) levantando FEATURE_NOT_ENABLED con los
--    add-ons correctos. Si una regresión futura las reescribiera SIN el gate, esta
--    comprobación ABORTA la migración (re-ejecutable en CI/entorno limpio).
-- ------------------------------------------------------------------------------
do $guard$
declare
  _reg constant text := 'public.register_my_customer_account(uuid, text, text, text)';
  _awd constant text := 'public.staff_award_visit(uuid, uuid, text, jsonb, boolean, text, text)';
  _sd  boolean;
  _src text;
begin
  -- register: existe, SECURITY DEFINER, y exige client_app + loyalty vía el gate.
  select p.prosecdef, p.prosrc into _sd, _src
  from pg_proc p
  where p.oid = to_regprocedure(_reg);

  if _sd is null then
    raise exception 'GUARDIÁN FEATURE-GATE: falta la RPC % (gate roto)', _reg
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception 'GUARDIÁN FEATURE-GATE: la RPC % ya no es SECURITY DEFINER (el gate no podría leer salon_features)', _reg
      using errcode = 'raise_exception';
  end if;
  if _src not like '%salon_has_feature%'
     or _src not like '%FEATURE_NOT_ENABLED%'
     or _src not like '%client_app%'
     or _src not like '%''loyalty''%'
  then
    raise exception 'GUARDIÁN FEATURE-GATE: % ya no exige client_app + loyalty vía app.salon_has_feature/FEATURE_NOT_ENABLED (gate degradado)', _reg
      using errcode = 'raise_exception';
  end if;

  -- staff_award_visit: existe, SECURITY DEFINER, y exige staff_app + loyalty vía el gate.
  select p.prosecdef, p.prosrc into _sd, _src
  from pg_proc p
  where p.oid = to_regprocedure(_awd);

  if _sd is null then
    raise exception 'GUARDIÁN FEATURE-GATE: falta la RPC % (gate roto)', _awd
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception 'GUARDIÁN FEATURE-GATE: la RPC % ya no es SECURITY DEFINER (el gate no podría leer salon_features)', _awd
      using errcode = 'raise_exception';
  end if;
  if _src not like '%salon_has_feature%'
     or _src not like '%FEATURE_NOT_ENABLED%'
     or _src not like '%staff_app%'
     or _src not like '%''loyalty''%'
  then
    raise exception 'GUARDIÁN FEATURE-GATE: % ya no exige staff_app + loyalty vía app.salon_has_feature/FEATURE_NOT_ENABLED (gate degradado)', _awd
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN FEATURE-GATE: register exige client_app+loyalty y staff_award_visit exige staff_app+loyalty; ambos SECURITY DEFINER y levantan FEATURE_NOT_ENABLED (P0001).';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Contrato de error: FEATURE_NOT_ENABLED sale con SQLSTATE P0001 (raise_exception),
--   el MISMO que PHONE_CONFLICT en register. La capa cliente (app.ts / server.ts o
--   supabase.rpc()) debe distinguir por el MENSAJE ('FEATURE_NOT_ENABLED'), no por
--   el código. Es un error de negocio esperado (add-on no contratado), no un bug.
--
-- • Semántica del gate (opt-in, ver salon_features §3): app.salon_has_feature()
--   es true SOLO si existe la fila del add-on Y enabled=true. Para HABILITAR estas
--   apps en un salón, HAT3X (service_role) provisiona sus entitlements:
--     insert into public.salon_features (salon_id, feature, enabled)
--     values ('<uuid>','loyalty',true), ('<uuid>','client_app',true),
--            ('<uuid>','staff_app',true)
--     on conflict (salon_id, feature) do update set enabled = excluded.enabled;
--   'loyalty' es requisito de AMBAS (es el núcleo de puntos/cupones); 'client_app'
--   habilita el autoservicio y 'staff_app' la acreditación de visitas.
--
-- • Orden de comprobaciones (deliberado, para no romper el contrato existente):
--     register: UNAUTHORIZED → INVALID_NAME → INVALID_PHONE → SALON_NOT_FOUND →
--               FEATURE_NOT_ENABLED → (identidad por teléfono).
--     award:    UNAUTHORIZED → FORBIDDEN → FEATURE_NOT_ENABLED → (resto).
--
-- • Coherencia TS↔SQL: sin cambio de firma ni de retorno ⇒ src/types/database.ts
--   NO necesita regenerarse por esta migración (el gap de RPCs no reflejadas sigue
--   siendo el mismo ya anotado en audit §0.1; se resolverá en bloque).
--
-- • Rollback manual (forward-only): re-aplicar 20260717140000_rpc_register_customer.sql
--   y 20260717150000_rpc_staff_award_visit.sql (sus CREATE OR REPLACE sin el gate)
--   revierte estas funciones a su forma previa.
-- =============================================================================
