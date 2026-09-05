-- =============================================================================
-- salon-os — ENFORCEMENT del OTP: register_my_customer_account exige el teléfono
--            CONFIRMADO de la cuenta cuando el salón lo requiere
--
-- Cierra —dentro de la RPC de autoservicio— el agujero de SUPLANTACIÓN POR
-- TELÉFONO que la válvula require_phone_verification (20260719110000_salon_
-- security_settings.sql) dejó gobernado pero SIN aplicar. Es la subtarea de
-- "enforcement" que anticipa la §"NOTAS PARA FUTUROS MANTENEDORES" de esa
-- migración y la ⚠️ "PROPIEDAD DEL TELÉFONO (OTP)" que arrastra esta RPC desde
-- 20260717140000_rpc_register_customer.sql.
--
-- ── EL AGUJERO Y CÓMO LO CIERRA ─────────────────────────────────────────────
-- El teléfono es la CLAVE NATURAL de identidad (customers.phone_e164). Sin
-- verificar que ese teléfono es REALMENTE del usuario que se registra, un
-- registrante malicioso podría declarar el número de OTRA persona y quedarse con
-- su ficha SIN cuenta (outcome 'linked' → robo de identidad + de puntos). La
-- verdad "este teléfono es tuyo" ya la establece Supabase/GoTrue vía OTP por SMS:
-- al confirmarlo, sella auth.users.phone (E.164) y auth.users.phone_confirmed_at.
--
-- Esta migración hace que la RPC EXIJA esa prueba: antes de enlazar/crear ficha,
-- lee phone y phone_confirmed_at de auth.users WHERE id = auth.uid() y comprueba
-- que el teléfono declarado (p_phone) coincide con el teléfono CONFIRMADO de la
-- propia cuenta. Ambos se comparan ya normalizados con app.normalize_phone, de
-- modo que el formato con el que se teclee da igual (mismo canónico E.164).
--   · sin teléfono confirmado (phone_confirmed_at null) → NO verificado.
--   · confirmado pero DISTINTO de p_phone               → NO verificado.
--   · confirmado y COINCIDE                             → verificado, continúa.
-- Si NO está verificado y el salón exige verificación:
--   raise exception 'PHONE_NOT_VERIFIED' using errcode = 'P0001';
-- Mismo SQLSTATE (P0001 / raise_exception) que el resto de errores de negocio de
-- esta función (PHONE_CONFLICT, FEATURE_NOT_ENABLED): la capa que la invoca los
-- discrimina por el MENSAJE, no por un código nuevo.
--
-- ── FAIL-CLOSED, GOBERNADO POR LA VÁLVULA ───────────────────────────────────
-- El enforcement se ENVUELVE en app.salon_requires_phone_verification(p_salon_id)
-- (el gate fail-closed de sub-1): si el salón NO tiene fila de seguridad, o la
-- tiene con require_phone_verification = true, el gate devuelve TRUE y se EXIGE la
-- verificación. Solo un salón con una fila EXPLÍCITA require_phone_verification =
-- false (acto de HAT3X/service_role, solo dev/staging) salta la comprobación —y
-- en ese caso ni siquiera se consulta auth.users—. Olvidarse de configurar nada
-- deja el salón PROTEGIDO; relajar el gate es lo que exige un acto auditable.
--
-- ── CÓMO — CREATE OR REPLACE idéntico salvo por insertar el gate ─────────────
-- Reescribe register_my_customer_account IDÉNTICA a su forma vigente
-- (20260718150000_rpc_feature_gate.sql) salvo por añadir el paso 3.2. NO cambia
-- la FIRMA (misma lista de argumentos y tipos) ni el CONTRATO DE SALIDA (mismo
-- jsonb {customer_id, qr_token, outcome}). Se conservan byte a byte: los gates de
-- auth (UNAUTHORIZED) y de feature (client_app + loyalty → FEATURE_NOT_ENABLED),
-- la validación de nombre/teléfono/salón, la identidad por teléfono y su
-- idempotencia (linked/created/already_linked), y el conflicto PHONE_CONFLICT.
--
-- DÓNDE va el gate (para NO alterar el orden de errores existente):
--   UNAUTHORIZED → INVALID_NAME → INVALID_PHONE → SALON_NOT_FOUND →
--   FEATURE_NOT_ENABLED → [PHONE_NOT_VERIFIED ← NUEVO] → (identidad por teléfono).
-- Tras el feature-gate (si el salón no tiene el add-on, FEATURE_NOT_ENABLED sigue
-- siendo el primer "no" que se ve) y ANTES de tocar/crear fichas: sin teléfono
-- verificado no se enlaza ni se crea nada.
--
-- ── POR QUÉ auth.users Y NO UN CLAIM DEL JWT ────────────────────────────────
-- phone_confirmed_at NO viaja en el JWT; el claim `phone` reflejaría el teléfono
-- de la cuenta pero no PRUEBA que esté confirmado. La fuente de verdad de "este
-- número está verificado" es auth.users.phone_confirmed_at. La función es
-- SECURITY DEFINER (owner = postgres, que tiene SELECT sobre auth.users en
-- Supabase) con search_path='', así que lee auth.users de forma controlada sin
-- exigirle al llamante acceso a ese esquema; y acota SIEMPRE por id = auth.uid()
-- (nunca por un parámetro): solo se puede probar la propiedad del PROPIO teléfono.
--
-- Idempotente y re-ejecutable: CREATE OR REPLACE conserva propietario y
-- privilegios (los grants existentes siguen), y aun así se re-afirman abajo.
-- Envuelto en transacción con un guardián de aserción final (patrón de la casa):
-- si una regresión futura reescribiera la función SIN este gate —o sin el
-- feature-gate— la migración (o su re-ejecución en CI) ABORTA de forma ruidosa.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- register_my_customer_account — + enforcement del OTP (paso 3.2)
--   (idéntica a 20260718150000_rpc_feature_gate.sql salvo el paso 3.2 y las tres
--    variables auxiliares que lee de auth.users)
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
  'Autoservicio app de cliente: enlaza/crea la ficha del usuario autenticado (auth.uid()) en un salón, identificando por teléfono (E.164). Replica linkOrCreateCustomerAccount. Feature-gate (productización): exige los add-ons client_app y loyalty activos (app.salon_has_feature); si falta alguno → FEATURE_NOT_ENABLED. OTP-gate (anti-suplantación): si app.salon_requires_phone_verification() es TRUE, p_phone debe coincidir con el teléfono CONFIRMADO de la cuenta (auth.users.phone/phone_confirmed_at), comparado ya normalizado; si no hay confirmado o no coincide → PHONE_NOT_VERIFIED. Ambos errores con errcode P0001.';

-- Solo usuarios autenticados; nunca anon. (CREATE OR REPLACE conserva los grants;
-- se re-afirman por robustez e idempotencia.)
revoke all on function public.register_my_customer_account(uuid, text, text, text) from public;
grant execute on function public.register_my_customer_account(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- Guardián de aserción (defensa en profundidad — patrón de la casa: salon_features
-- §5 / rpc_feature_gate §3 / salon_security_settings §4). Verifica que la RPC
-- existe, sigue SECURITY DEFINER, y que su cuerpo cablea AMBOS gates:
--   (a) OTP-gate NUEVO: consulta el gate fail-closed y auth.users(phone_confirmed_at),
--       y levanta PHONE_NOT_VERIFIED.
--   (b) FEATURE-gate PREEXISTENTE: sigue exigiendo client_app + loyalty vía
--       app.salon_has_feature levantando FEATURE_NOT_ENABLED (que esta reescritura
--       NO debe haber perdido).
-- Si una regresión futura reescribiera la función perdiendo cualquiera de los dos,
-- esta comprobación ABORTA la migración (re-ejecutable en CI/entorno limpio).
-- ------------------------------------------------------------------------------
do $guard$
declare
  _reg constant text := 'public.register_my_customer_account(uuid, text, text, text)';
  _sd  boolean;
  _src text;
begin
  select p.prosecdef, p.prosrc into _sd, _src
  from pg_proc p
  where p.oid = to_regprocedure(_reg);

  if _sd is null then
    raise exception 'GUARDIÁN OTP-GATE: falta la RPC % (gate roto)', _reg
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception 'GUARDIÁN OTP-GATE: la RPC % ya no es SECURITY DEFINER (no podría leer auth.users ni el gate de seguridad)', _reg
      using errcode = 'raise_exception';
  end if;

  -- (a) OTP-gate: fail-closed + lectura de la confirmación + PHONE_NOT_VERIFIED.
  if _src not like '%salon_requires_phone_verification%'
     or _src not like '%PHONE_NOT_VERIFIED%'
     or _src not like '%phone_confirmed_at%'
     or _src not like '%auth.users%'
  then
    raise exception 'GUARDIÁN OTP-GATE: % ya no exige el teléfono confirmado vía app.salon_requires_phone_verification/auth.users(phone_confirmed_at)/PHONE_NOT_VERIFIED (enforcement OTP degradado)', _reg
      using errcode = 'raise_exception';
  end if;

  -- (b) FEATURE-gate preexistente intacto (esta reescritura no debe haberlo perdido).
  if _src not like '%salon_has_feature%'
     or _src not like '%FEATURE_NOT_ENABLED%'
     or _src not like '%client_app%'
     or _src not like '%''loyalty''%'
  then
    raise exception 'GUARDIÁN OTP-GATE: % perdió el feature-gate client_app + loyalty vía app.salon_has_feature/FEATURE_NOT_ENABLED (regresión al reescribir la función)', _reg
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN OTP-GATE: register_my_customer_account exige teléfono confirmado (PHONE_NOT_VERIFIED, fail-closed) y conserva client_app+loyalty (FEATURE_NOT_ENABLED); SECURITY DEFINER intacto.';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Contrato de error: PHONE_NOT_VERIFIED sale con SQLSTATE P0001 (raise_exception),
--   el MISMO que PHONE_CONFLICT y FEATURE_NOT_ENABLED. La capa cliente (app.ts /
--   server.ts o supabase.rpc()) debe distinguir por el MENSAJE, no por el código.
--   Es un error de negocio esperado (teléfono aún no verificado por OTP), no un bug:
--   la app debe llevar al usuario a confirmar su teléfono (Supabase phone auth) y
--   reintentar con el MISMO número.
--
-- • Semántica del enforcement (secure by default, fail-closed): el gate se aplica
--   salvo que exista fila en salon_security_settings con require_phone_verification
--   = false (solo dev/staging, acto de HAT3X/service_role — ver sub-1). En ese caso
--   la RPC ni consulta auth.users. "Verificado" = auth.users.phone_confirmed_at no
--   null Y app.normalize_phone(auth.users.phone) = app.normalize_phone(p_phone).
--
-- • Formato de auth.users.phone (GoTrue): se guarda en E.164 pero SIN el '+' de
--   cabecera ('34612345678'). Por eso se normaliza como app.normalize_phone('+' ||
--   phone): sin ese '+', normalize_phone lo tomaría por número nacional español y
--   antepondría otro '34' → '+3434…', y el gate rechazaría a TODOS los verificados.
--   El '+' antepuesto es robusto también si un GoTrue futuro guardara ya el '+'
--   (el doble '+' se colapsa al extraer dígitos). Si algún día se comparte esta
--   normalización del teléfono de la cuenta, extraerla a un helper app.*.
--
-- • Requisito de privilegios (Supabase): la función es SECURITY DEFINER; su owner
--   (postgres, en Supabase) debe conservar SELECT sobre auth.users para leer
--   phone_confirmed_at. Es el patrón estándar y no exige acceso al esquema auth por
--   parte del llamante (authenticated). Si en algún entorno se endureciera ese
--   acceso, habría que conceder SELECT(phone, phone_confirmed_at) sobre auth.users
--   al owner de la función.
--
-- • Gemela en app (linkOrCreateCustomerAccount, @/lib/customers/account.ts): esta
--   migración cierra el agujero en la RUTA RPC (app de cliente vía supabase.rpc()).
--   La Server Action equivalente debe recibir el MISMO gate leyendo la válvula y la
--   verificación del teléfono con el cliente de servidor. Fuera de esta subtarea.
--
-- • Coherencia TS↔SQL: sin cambio de firma ni de retorno ⇒ src/types/database.ts
--   NO necesita regenerarse por esta migración (el gap de RPCs no reflejadas sigue
--   siendo el ya anotado en docs/convenciones-rls-rpc-audit §0.1).
--
-- • Orden de comprobaciones (deliberado, para no romper el contrato existente):
--     UNAUTHORIZED → INVALID_NAME → INVALID_PHONE → SALON_NOT_FOUND →
--     FEATURE_NOT_ENABLED → PHONE_NOT_VERIFIED → (identidad por teléfono).
--
-- • Rollback manual (forward-only): re-aplicar 20260718150000_rpc_feature_gate.sql
--   (su CREATE OR REPLACE con feature-gate pero SIN el OTP-gate) revierte la función
--   a su forma previa a esta migración.
-- =============================================================================
