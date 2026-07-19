-- =============================================================================
-- salon-os — Migración: VÁLVULA DE SEGURIDAD por salón (public.salon_security_settings)
--
-- Introduce la primera "válvula de seguridad" AUDITABLE por salón:
-- require_phone_verification — el interruptor que decide si el autoservicio del
-- cliente EXIGE que el teléfono esté verificado (OTP) antes de fiarse de él como
-- identidad.
--
-- ── EL AGUJERO QUE ESTA VÁLVULA GOBIERNA ────────────────────────────────────
-- El teléfono es la CLAVE NATURAL de identidad del cliente (ver
-- 20260717110000_customers_phone_e164). Pero public.register_my_customer_account
-- (RPC de autoservicio, FASE 3B) y su gemela linkOrCreateCustomerAccount
-- (@/lib/customers/account.ts) ASUMEN que el teléfono ya se verificó aguas arriba
-- (OTP por SMS). Sin esa verificación, un registrante malicioso puede RECLAMAR el
-- teléfono de OTRA persona y apropiarse de su ficha SIN cuenta (outcome 'linked'
-- → robo de identidad + de puntos de fidelización). Es la ⚠️ nota "PROPIEDAD DEL
-- TELÉFONO (OTP) — PENDIENTE ANTES DE CLIENTES REALES" que ya llevan esa RPC, su
-- comentario y docs/convenciones-rls-rpc-audit §"register".
--
-- Esta migración NO implementa el OTP (eso vive en la app/RPC, aguas arriba): crea
-- el INTERRUPTOR de base de datos —tipado, con RLS y guardián— que la capa de
-- enforcement debe CONSULTAR para saber si, en un salón dado, se permite saltarse
-- la verificación. El default cierra el agujero; abrirlo es un acto explícito,
-- registrado y solo de desarrollo.
--
-- ── SECURE BY DEFAULT — Y, SOBRE TODO, FAIL-CLOSED ──────────────────────────
-- Dos capas de "seguro por defecto", INTENCIONADAMENTE distintas del opt-in de
-- salon_features (donde AUSENCIA de fila = add-on apagado):
--   1. Columna: require_phone_verification boolean NOT NULL DEFAULT TRUE. Si se
--      inserta una fila sin especificar el valor, nace exigiendo verificación.
--   2. AUSENCIA de fila = EXIGIR verificación (fail-closed). El gate
--      app.salon_requires_phone_verification() devuelve TRUE salvo que exista una
--      fila que diga EXPLÍCITAMENTE require_phone_verification = false. Así, un
--      salón sin fila de seguridad —el estado por defecto de todos los salones—
--      queda PROTEGIDO sin tener que acordarse de crear nada. Lo peligroso (saltar
--      la verificación) exige un acto explícito y auditable; olvidarse NUNCA abre
--      el agujero.
--
-- ⚠️ PONER require_phone_verification = FALSE REABRE EL AGUJERO DE SUPLANTACIÓN.
--    Solo tiene sentido en DESARROLLO/staging (p. ej. probar el flujo de registro
--    sin montar un proveedor de SMS). En un salón con clientes reales, false =
--    cualquiera puede reclamar el teléfono de otro y quedarse con su ficha/puntos.
--    Por eso la ESCRITURA de esta tabla NO la puede hacer el salón desde el
--    navegador (deny-by-default en RLS): solo HAT3X vía service_role/backoffice, o
--    un seed de desarrollo. El owner de un salón no puede auto-abrirse el agujero.
--
-- ── POR QUÉ TABLA DEDICADA 1:1 (no salons.settings jsonb, no una columna suelta) ─
-- Misma disyuntiva —y misma respuesta— que salon_branding (ver
-- docs/salon-branding-design.md) y salon_features: una válvula de seguridad tiene
-- FORMA FIJA y conocida (un boolean) y se beneficia de tipado, comentarios por
-- columna, updated_at auditable, una política de escritura propia y VERIFICABLE
-- (guardián) y —clave— un gate reutilizable en servidor/policy. salons.settings
-- (jsonb) queda para lo abierto/variable; un interruptor del que depende que no
-- roben identidades no debe vivir enterrado en un jsonb sin CHECK ni RLS propia.
-- La tabla, además, deja sitio a futuras válvulas (p. ej. require_email_verification,
-- límites de intentos) sin otra migración de esquema.
--
-- Relación 1:1 con salons (salon_id = PK y FK), calcada de salon_branding: como
-- mucho una fila de seguridad por salón (unicidad por la PK, sin índice extra) y el
-- borrado del salón la arrastra en cascada. FK SIMPLE salon_id → salons(id) (salons
-- es la raíz del tenant; no tiene clave compuesta).
--
-- Estado: proyecto en desarrollo, sin datos de producción. Tabla nueva y vacía →
-- aditiva, sin backfill. Todos los salones existentes quedan SIN fila ⇒ por
-- fail-closed, todos exigen verificación (el estado seguro), coherente con el
-- default.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Tabla de ajustes de seguridad por salón (1:1 con salons)
-- ------------------------------------------------------------------------------
create table public.salon_security_settings (
  -- PK = FK: fuerza la relación 1:1 (una fila de seguridad por salón), ya viene
  -- indexada por la PK (sin idx_..._salon_id aparte) y cascada al borrar el salón.
  -- Mismo patrón exacto que salon_branding.
  salon_id                   uuid primary key references public.salons (id) on delete cascade,
  -- LA VÁLVULA. NOT NULL DEFAULT TRUE = secure by default: si se crea la fila sin
  -- especificar el valor, exige verificación. Ponerla a false REABRE el agujero de
  -- suplantación por teléfono (ver cabecera); solo válido en desarrollo/staging.
  require_phone_verification boolean not null default true,
  -- Nota de auditoría: quién relajó la válvula, por qué y hasta cuándo (p. ej.
  -- "DEV: sin proveedor SMS en staging — reactivar antes de clientes reales").
  -- Irrelevante para la lógica del gate; existe para dejar RASTRO de por qué un
  -- salón tiene la verificación desactivada.
  notes                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

comment on table public.salon_security_settings is
  'Válvulas de seguridad por salón (1:1 con salons; salon_id es PK y FK). Hoy solo require_phone_verification. Secure by default y FAIL-CLOSED: la AUSENCIA de fila equivale a exigir verificación. La escritura la hace HAT3X (service_role), no el salón: relajar una válvula es un acto explícito, auditable y solo de desarrollo.';

comment on column public.salon_security_settings.salon_id is
  'Salón dueño de esta configuración de seguridad. PK y FK simple a salons(id) (raíz del tenant); la PK garantiza la relación 1:1.';

comment on column public.salon_security_settings.require_phone_verification is
  'VÁLVULA: si el autoservicio del cliente exige teléfono verificado (OTP) antes de fiarse de él como identidad. TRUE (default, seguro) = exigir verificación; FALSE = saltarla → REABRE el agujero de suplantación por teléfono (register_my_customer_account / linkOrCreateCustomerAccount podrían enlazar la ficha de otra persona). false SOLO en desarrollo/staging. Consúltese vía app.salon_requires_phone_verification(), que además trata la AUSENCIA de fila como TRUE (fail-closed).';

comment on column public.salon_security_settings.notes is
  'Nota de auditoría: motivo/alcance de haber relajado una válvula (quién, por qué, hasta cuándo). Sin efecto sobre la lógica del gate.';

-- updated_at automático (mismo trigger compartido que el resto del esquema).
create trigger trg_salon_security_settings_updated_at
  before update on public.salon_security_settings
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. Gate FAIL-CLOSED: app.salon_requires_phone_verification(p_salon_id)
--
-- Devuelve TRUE (exigir verificación) SALVO que exista una fila para el salón con
-- require_phone_verification = false. Es decir:
--   · sin fila                                    → TRUE  (seguro por defecto)
--   · fila con require_phone_verification = true  → TRUE  (seguro)
--   · fila con require_phone_verification = false → FALSE (relajado — solo DEV)
-- Se implementa como `not exists (… = false)` a propósito: cualquier estado que NO
-- sea "hay una fila que dice false explícitamente" resuelve a exigir verificación.
-- Fail-closed: si la fila desapareciera, si el dato fuera NULL (imposible: NOT
-- NULL) o si la consulta no encontrara nada, el resultado es el SEGURO (TRUE).
--
-- SECURITY DEFINER + STABLE + search_path='' (mismo endurecimiento que
-- app.salon_has_feature / app.user_salon_ids):
--   · DEFINER ⇒ el gate puede leer salon_security_settings DENTRO de una RPC
--     SECURITY DEFINER (register_my_customer_account) o de una política de otra
--     tabla, sin que el llamante tenga que poder leer la tabla y sin recursión RLS.
--   · STABLE + envolver la llamada en `(select …)` ⇒ el planner la evalúa una vez
--     por consulta (initPlan), como el resto de anclas.
--   · language sql, cuerpo `select not exists(...)` — plantilla de salon_has_feature.
--
-- NOTA de alcance (honesta, igual que salon_has_feature): al ser DEFINER y tomar un
-- p_salon_id ARBITRARIO, un authenticated podría preguntar por el estado de la
-- válvula de OTRO salón. La fuga se limita a un BOOLEAN por salón —no expone filas,
-- notas ni datos— y es el precio de un gate reutilizable en servidor/policy.
-- ------------------------------------------------------------------------------
create or replace function app.salon_requires_phone_verification(
  p_salon_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.salon_security_settings s
    where s.salon_id = p_salon_id
      and s.require_phone_verification = false
  );
$$;

comment on function app.salon_requires_phone_verification(uuid) is
  'Gate de seguridad FAIL-CLOSED: TRUE (exigir OTP del teléfono) salvo que exista fila en salon_security_settings con require_phone_verification=false. Sin fila = TRUE (seguro por defecto). SECURITY DEFINER + STABLE + search_path='''' — reutilizable en RPC/políticas. La capa que registra/enlaza la ficha del cliente por teléfono debe consultarlo y, si es TRUE, rechazar el enlace de un teléfono no verificado. Revocada a anon/public.';

-- Solo autenticados; nunca anon/public (mismo criterio que salon_has_feature). La
-- RPC de autoservicio, al ser SECURITY DEFINER, lo llama con sus propios privilegios.
revoke execute on function app.salon_requires_phone_verification(uuid) from anon, public;
grant  execute on function app.salon_requires_phone_verification(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. RLS — LECTURA para los miembros del salón; NADA de escritura a authenticated
--
-- Mismo criterio que salon_features (NO salon_branding): la escritura de una
-- válvula de seguridad NO es una preferencia del salón, es una decisión operativa
-- de HAT3X. deny-by-default: al habilitar RLS SIN política de INSERT/UPDATE/DELETE,
-- ningún autenticado (ni el owner) puede TOCAR la válvula desde el navegador —solo
-- service_role/backoffice (bypasa RLS)—. Esto es lo que impide que un salón se
-- auto-abra el agujero poniendo require_phone_verification=false por su cuenta.
-- La única política es un SELECT acotado por app.user_salon_ids(): el salón puede
-- LEER (p. ej. mostrar en el panel "verificación por SMS: activa") pero no cambiar.
-- ------------------------------------------------------------------------------
alter table public.salon_security_settings enable row level security;

create policy "members_select_salon_security_settings"
  on public.salon_security_settings for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

-- ------------------------------------------------------------------------------
-- 4. Guardián de aserción (defensa en profundidad — patrón de la casa)
--
-- Hermano de los guardianes de salon_features §5 / rls_self_guard /
-- rls_multitenant_guard, más UN check propio de esta válvula: el DEFAULT de la
-- columna debe seguir siendo TRUE (secure by default). Si una migración futura
-- debilitara el aislamiento, concediera escritura al salón, o —lo más sutil—
-- cambiara el default a false, esta comprobación de catálogo ABORTA de forma
-- ruidosa (re-ejecutable en CI/entorno limpio). Verifica:
--   (0) el gate app.salon_requires_phone_verification(uuid) existe, sigue SECURITY
--       DEFINER y NO es ejecutable por anon (integridad del gate).
--   (a) RLS habilitada en salon_security_settings.
--   (b) SELECT acotado por app.user_salon_ids() (aislamiento por salón intacto).
--   (c) NINGUNA política de escritura (INSERT/UPDATE/DELETE/ALL): relajar la válvula
--       es exclusivo de service_role/HAT3X; el salón NUNCA se abre el agujero solo.
--   (d) Ninguna política abierta a anon/public.
--   (e) SECURE BY DEFAULT: el DEFAULT de require_phone_verification sigue siendo
--       true. Un default false haría que una fila creada sin valor naciera con el
--       agujero abierto — se veta aquí.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _gate    constant text := 'app.salon_requires_phone_verification(uuid)';
  _sd      boolean;
  _cnt     integer;
  _default text;
begin
  -- (0) Integridad del gate: existe, es DEFINER, no ejecutable por anon.
  select p.prosecdef into _sd
  from pg_proc p
  where p.oid = to_regprocedure(_gate);

  if _sd is null then
    raise exception 'GUARDIÁN SEGURIDAD: falta el gate de verificación %', _gate
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception 'GUARDIÁN SEGURIDAD: el gate % ya no es SECURITY DEFINER (gate degradado)', _gate
      using errcode = 'raise_exception';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', _gate, 'execute')
  then
    raise exception 'GUARDIÁN SEGURIDAD: el rol anon puede EJECUTAR % (gate de seguridad expuesto sin login)', _gate
      using errcode = 'raise_exception';
  end if;

  -- (a) RLS habilitada.
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'salon_security_settings' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN SEGURIDAD: public.salon_security_settings no tiene RLS habilitada'
      using errcode = 'raise_exception';
  end if;

  -- (b) SELECT acotado por app.user_salon_ids().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'salon_security_settings'
    and cmd in ('SELECT', 'ALL') and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN SEGURIDAD: salon_security_settings no tiene política SELECT acotada por app.user_salon_ids() (posible fuga cross-tenant)'
      using errcode = 'raise_exception';
  end if;

  -- (c) Sin escritura a authenticated (relajar la válvula solo service_role/HAT3X).
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'salon_security_settings'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if _cnt > 0 then
    raise exception 'GUARDIÁN SEGURIDAD: salon_security_settings tiene % política(s) de escritura — un salón no debe poder auto-abrirse el agujero; la válvula solo la escribe HAT3X (service_role)', _cnt
      using errcode = 'raise_exception';
  end if;

  -- (d) Nada abierto a anon/public.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'salon_security_settings'
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN SEGURIDAD: salon_security_settings tiene % política(s) expuesta(s) a anon/public', _cnt
      using errcode = 'raise_exception';
  end if;

  -- (e) SECURE BY DEFAULT: el DEFAULT de la válvula sigue siendo true. Se lee del
  --     catálogo (pg_attrdef → pg_get_expr); un default 'false' significaría que una
  --     fila insertada sin valor nacería con el agujero abierto.
  select pg_get_expr(ad.adbin, ad.adrelid) into _default
  from pg_attribute a
  join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where a.attrelid = 'public.salon_security_settings'::regclass
    and a.attname  = 'require_phone_verification';

  if _default is null then
    raise exception 'GUARDIÁN SEGURIDAD: require_phone_verification perdió su DEFAULT (secure by default roto: una fila sin valor no exigiría verificación)'
      using errcode = 'raise_exception';
  elsif lower(_default) not in ('true', 'true::boolean') then
    raise exception 'GUARDIÁN SEGURIDAD: el DEFAULT de require_phone_verification es "%" y no true (secure by default roto)', _default
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN SEGURIDAD: salon_security_settings verificada — gate DEFINER intacto, SELECT acotado por salón, sin escritura de authenticated, nada a anon/public, y válvula secure-by-default (DEFAULT true).';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • CONTRATO CON EL CONSUMIDOR (enforcement del OTP — fuera de ESTA migración):
--   Esta migración crea la VÁLVULA; NO cierra el agujero por sí sola. La capa que
--   registra/enlaza la ficha del cliente por teléfono debe CONSULTARLA:
--     - public.register_my_customer_account (RPC, SECURITY DEFINER): antes del
--       outcome 'linked' (enlazar una ficha AJENA sin cuenta), comprobar
--         if app.salon_requires_phone_verification(p_salon_id)
--            and <el teléfono NO viene verificado por OTP aguas arriba> then
--           raise exception 'PHONE_NOT_VERIFIED' using errcode = '...';
--         end if;
--       Cómo llega "verificado" a la RPC (claim del JWT, phone_confirmed_at de
--       auth.users, o un parámetro firmado) es la decisión de integración OTP de la
--       app (Supabase phone auth / Twilio) — esa es la subtarea de enforcement.
--     - @/lib/customers/account.ts (linkOrCreateCustomerAccount): mismo gate en la
--       Server Action, leyendo la tabla con el cliente de servidor.
--   Mientras el enforcement no exista, la válvula queda registrada y auditable; el
--   ⚠️ de register_my_customer_account sigue siendo el recordatorio operativo.
--
-- • Aprovisionamiento (HAT3X / service_role). Por defecto NO hace falta tocar nada:
--   sin fila, el gate ya exige verificación (fail-closed). Solo para DESARROLLO/
--   staging, y a sabiendas de que REABRE el agujero, se relaja con un upsert:
--     insert into public.salon_security_settings (salon_id, require_phone_verification, notes)
--     values ('<uuid>', false, 'DEV: sin SMS en staging — reactivar antes de real')
--     on conflict (salon_id) do update
--       set require_phone_verification = excluded.require_phone_verification,
--           notes = excluded.notes;
--   Al ser service_role bypasa RLS (no necesita política de escritura). Para volver
--   al estado seguro: poner require_phone_verification=true (o borrar la fila).
--
-- • Coherencia TS↔SQL (follow-up, fuera de esta subtarea de migración): regenerar
--   src/types/database.ts para incluir la tabla `salon_security_settings` en
--   `Tables`. La función app.salon_requires_phone_verification NO va en `Functions`
--   (vive en el esquema `app`, no es una RPC de PostgREST). Mismo GAP DE TIPOS ya
--   anotado para salon_features en docs/convenciones-rls-rpc-audit §0.1.
--
-- • Guardián: esta migración lleva su guardián INLINE (§4), como salon_features §5.
--   Es de MAYOR timestamp que el guardián standalone de productización
--   (20260718160000_rls_productization_guard), así que aquel no cubre esta tabla.
--   Si algún día se consolida un guardián standalone posterior, añadir
--   salon_security_settings a su lista y conservar los invariantes (a)-(e), en
--   especial (c) "sin escritura de authenticated" y (e) "DEFAULT true".
--
-- • Rollback manual (forward-only; por si hubiera que revertir):
--     drop function if exists app.salon_requires_phone_verification(uuid);
--     drop table    if exists public.salon_security_settings;  -- borra trigger/policy
--   (En este orden solo por claridad; no hay dependencia dura entre ambos.)
-- =============================================================================
