-- =============================================================================
-- salon-os — RPC de autoservicio: register_my_customer_account
--
-- Puente para la APP DE CLIENTE (Vite → Supabase directo, FASE 3B). La app no
-- puede llamar a la Server Action `linkOrCreateCustomerAccount` (@/lib/customers/
-- account.ts, solo Next.js); esta función replica esa MISMA lógica de "identidad
-- por teléfono" como RPC invocable por el cliente autenticado vía supabase.rpc().
--
-- Contrato de identidad (idéntico a account.ts):
--   · El teléfono es la clave natural. Se normaliza a E.164 con app.normalize_phone.
--   · Si ya hay ficha con ese teléfono en el salón:
--       - misma cuenta   → no-op idempotente        (outcome 'already_linked')
--       - sin cuenta      → se ENLAZA a esta cuenta   (outcome 'linked')
--       - otra cuenta     → CONFLICTO (no robar ficha) (error PHONE_CONFLICT)
--   · Si no hay ficha pero la cuenta ya tiene una en el salón (otro teléfono)
--       → se devuelve esa (already_linked); si no, se CREA (outcome 'created').
--     Al crear, la BD hace el resto sola: qr_token (default), phone_e164 (columna
--     generada) y el trigger de bootstrap crea cuenta de puntos + cupón.
--
-- SEGURIDAD:
--   · SECURITY DEFINER + search_path='' → omite RLS de forma CONTROLADA (quien se
--     registra en la app NO es miembro del salón y su ficha nace con user_id null:
--     bajo RLS no podría verla ni enlazarla). Se acota SIEMPRE por salon_id y el
--     user_id se toma del JWT (auth.uid()), NUNCA de un parámetro: un cliente solo
--     puede enlazar/crear SU PROPIA ficha.
--   · EXECUTE concedido solo a `authenticated` (nunca anon).
--
--   ⚠️ PROPIEDAD DEL TELÉFONO (OTP) — PENDIENTE ANTES DE CLIENTES REALES:
--     Esta función asume que el teléfono ya ha sido VERIFICADO como del usuario
--     (OTP por SMS) por la capa que la invoca. Sin esa verificación, un registrante
--     malicioso podría reclamar el teléfono de otra persona y apropiarse de su
--     ficha SIN cuenta (caso 'linked' → robo de identidad/puntos). La app (FASE 3B)
--     debe verificar el teléfono por OTP (Supabase phone auth o Twilio) antes de
--     llamar a esta RPC. Documentado también en account.ts.
-- =============================================================================

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
  'Autoservicio app de cliente: enlaza/crea la ficha del usuario autenticado (auth.uid()) en un salón, identificando por teléfono (E.164). Replica linkOrCreateCustomerAccount. Asume teléfono verificado por OTP aguas arriba.';

-- Solo usuarios autenticados; nunca anon.
revoke all on function public.register_my_customer_account(uuid, text, text, text) from public;
grant execute on function public.register_my_customer_account(uuid, text, text, text) to authenticated;
