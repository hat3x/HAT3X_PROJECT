-- =============================================================================
-- salon-os — Migración: un teléfono es de una FAMILIA, no de una persona
--
-- ── QUÉ SE RETIRA Y POR QUÉ ─────────────────────────────────────────────────
-- El índice único `(salon_id, phone_e164)` imponía "un teléfono = una ficha".
-- Se puso para evitar fichas duplicadas de la misma persona, y para eso servía;
-- pero la suposición de fondo es falsa en una clínica.
--
-- Kristel, higienista de Biodental, no podía rellenar los teléfonos que faltan:
-- la madre da su móvil para ella y para sus dos hijos, y cada uno tiene su
-- ficha, su odontograma y sus tratamientos. Al teclear el número en la segunda
-- ficha, la base lo rechazaba.
--
-- Lo que costaba: 397 de las 1.200 fichas de Biodental SIN teléfono, y 227 de
-- ellas comparten apellido con otra. Sin número no hay recordatorio de cita.
--
-- ── LO QUE SIGUE SIENDO ÚNICO ───────────────────────────────────────────────
-- `(salon_id, user_id)` y `(salon_id, email)`. Una CUENTA sigue enlazando con
-- UNA ficha: enlazarla a dos le daría a alguien el historial clínico de otra
-- persona. Compartir el teléfono de contacto es normal; compartir la cuenta,
-- no.
--
-- ── LA PREGUNTA QUE ESTO ABRE ───────────────────────────────────────────────
-- Si llama ese número, ¿quién llama? La responde la aplicación
-- (`resolveHouseholdMatch`): el nombre que se dice al reservar desempata, y
-- cuando no desempata NO se elige — se pregunta, que es lo que hace una
-- recepcionista humana. El código ya está preparado ANTES que esta migración,
-- para que ninguna consulta se encuentre con dos filas donde esperaba una.
--
-- ── EL ÍNDICE NO SE BORRA: SE SUSTITUYE ─────────────────────────────────────
-- Sigue haciendo falta buscar por teléfono, y es la consulta más caliente de la
-- recepcionista. Lo que cambia es que deja de ser único.
-- =============================================================================

begin;

drop index if exists public.idx_customers_salon_phone_e164;

-- Mismo par de columnas y mismo filtro parcial: lo único que se retira es la
-- unicidad. Las fichas sin teléfono siguen fuera del índice.
create index if not exists idx_customers_salon_phone_e164
  on public.customers (salon_id, phone_e164)
  where phone_e164 is not null;

comment on index public.idx_customers_salon_phone_e164 is
  'Búsqueda por teléfono canónico dentro del salón. NO es único a propósito: un teléfono es de una familia (la madre da su móvil para ella y para sus hijos) y exigir uno por ficha dejaba a un tercio de los pacientes sin número de contacto. Quién llama lo resuelve la aplicación con el nombre; ver resolveHouseholdMatch.';

-- ── El alta por cuenta propia, a salvo ──────────────────────────────────────
-- `register_my_customer_account` buscaba la ficha con `select ... into`, que con
-- varias filas coge la PRIMERA en silencio: enlazaría la cuenta a un hermano
-- cualquiera. Ahora, si hay más de una, se niega en claro y lo resuelve la
-- clínica — que es la única que sabe quién es quién.
create or replace function app.household_size(p_salon_id uuid, p_phone_e164 text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.customers
   where salon_id = p_salon_id
     and phone_e164 = p_phone_e164;
$$;

comment on function app.household_size(uuid, text) is
  'Cuántas fichas del salón comparten ese teléfono canónico. Más de una = familia: quien enlace cuentas debe negarse en vez de elegir, porque elegir mal da acceso al historial de otra persona.';

-- La función se re-declara ENTERA a partir de su definición viva en la base (no
-- de la del fichero original, que podría haber derivado), con un solo cambio: el
-- guardarraíl de arriba. `PHONE_AMBIGUOUS` es un error nuevo del contrato: "hay
-- varias fichas con ese teléfono, que la clínica enlace la tuya".
CREATE OR REPLACE FUNCTION public.register_my_customer_account(p_salon_id uuid, p_phone text, p_full_name text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid            uuid := auth.uid();
  v_phone          text;
  v_name           text;
  v_email          text;
  v_auth_phone     text;         -- teléfono crudo de la cuenta (auth.users.phone)
  v_auth_confirmed timestamptz;  -- sello de verificación (auth.users.phone_confirmed_at)
  v_verified_phone text;         -- teléfono CONFIRMADO ya en E.164 (o null si no lo hay)
  v_existing       public.customers%rowtype;
  v_customer       public.customers%rowtype;
  v_outcome        text;
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

  -- 3.2) GATE OTP (propiedad del teléfono): si el salón exige verificación, el
  --      teléfono declarado (p_phone) debe COINCIDIR con el teléfono CONFIRMADO de
  --      la cuenta (auth.users.phone_confirmed_at sellado por el OTP de GoTrue).
  --      Fail-closed vía app.salon_requires_phone_verification(): sin fila o con
  --      require_phone_verification=true → se exige; solo un false EXPLÍCITO (dev/
  --      staging) lo salta y ni consulta auth.users. Se compara ya normalizado a
  --      E.164, así el formato con que se tecleó p_phone es irrelevante. Va tras el
  --      feature-gate (FEATURE_NOT_ENABLED sigue primero) y antes de la identidad:
  --      sin teléfono verificado no se enlaza (robo de ficha ajena) ni se crea.
  if app.salon_requires_phone_verification(p_salon_id) then
    select u.phone, u.phone_confirmed_at
      into v_auth_phone, v_auth_confirmed
      from auth.users u
      where u.id = v_uid;

    -- Solo cuenta como "confirmado" si hay sello de verificación; entonces se
    -- canonicaliza a E.164 para compararlo con p_phone en la misma forma.
    -- ⚠️ GoTrue almacena auth.users.phone en E.164 pero SIN el '+' de cabecera (p.
    -- ej. '34612345678'). app.normalize_phone, al no ver prefijo internacional,
    -- lo tomaría por número NACIONAL y le antepondría OTRO '34' → '+3434612345678'
    -- (basura), y NINGÚN usuario verificado coincidiría (el gate rechazaría a
    -- todos). Como el teléfono de la cuenta SIEMPRE trae ya su código de país, le
    -- anteponemos '+' para que se normalice como el E.164 internacional que es.
    -- Robusto además si algún día GoTrue guardara el '+': el doble '+' se colapsa
    -- al extraer dígitos ('++34…' → '+34…'). p_phone (tecleado por el usuario) sí
    -- puede ser nacional, por eso ese se normaliza tal cual (default ES).
    v_verified_phone := case
      when v_auth_confirmed is not null then app.normalize_phone('+' || v_auth_phone)
      else null
    end;

    -- No hay teléfono confirmado, o el confirmado NO es el que se declara → NO
    -- verificado. (v_phone ya es non-null: pasó INVALID_PHONE arriba.)
    if v_verified_phone is null or v_verified_phone <> v_phone then
      raise exception 'PHONE_NOT_VERIFIED' using errcode = 'P0001';
    end if;
  end if;

  -- 4) ¿Existe ya la persona (por teléfono) en este salón?
  -- Un teléfono puede ser de toda una FAMILIA desde que se retiró el índice
  -- único (migración 20260905100000). Con varias fichas, `select ... into`
  -- cogería la PRIMERA en silencio y enlazaría esta cuenta a un hermano
  -- cualquiera — dándole acceso a su historial clínico. Se niega en claro.
  if app.household_size(p_salon_id, v_phone) > 1 then
    raise exception 'PHONE_AMBIGUOUS' using errcode = 'P0001';
  end if;

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
$function$
;

commit;
