-- =============================================================================
-- salon-os — Migración: ENTITLEMENTS (salon_features) — productización
--
-- Introduce la capa de "qué ha contratado cada salón" como TABLA DEDICADA
-- (public.salon_features): la opción de "columnas dedicadas" que el roadmap
-- contempla FRENTE a salons.settings jsonb (ver docs/roadmap-productizacion.md
-- §Productización y docs/multitenant-loyalty-contract §nota 5). Una tabla
-- relacional —en vez de un jsonb suelto— aporta:
--   · integridad referencial (FK a salons, ON DELETE CASCADE),
--   · un catálogo TIPADO de add-ons (enum public.salon_feature ⇒ unión en TS),
--   · unicidad (salon_id, feature) garantizada por el motor,
--   · RLS por fila (cada salón solo ve SUS entitlements),
--   · un lookup indexado (el gate se evalúa en cada carga de UI / policy).
--
-- Modelo OPT-IN (allow-list, deny-by-default de negocio): un add-on está activo
-- para un salón SOLO si existe su fila y enabled = true. La AUSENCIA de fila =
-- no contratado. Así, "sin contratar el add-on → el módulo ni aparece" (roadmap)
-- es el estado por defecto y seguro: no hay que acordarse de apagar nada; hay
-- que ENCENDER explícitamente lo contratado.
--
-- La ESCRITURA de entitlements NO es del salón: la fija HAT3X (venta/alta del
-- plan) vía service_role o backoffice. Por eso RLS concede LECTURA a los
-- miembros y NINGUNA política de escritura a authenticated (deny-by-default): el
-- propio salón no puede auto-concederse add-ons desde el navegador.
--
-- Contenido:
--   1. Enum public.salon_feature (catálogo de add-ons contratables).
--   2. Tabla public.salon_features (+ unique, FK cascade, updated_at).
--   3. Helper app.salon_has_feature(uuid, text) — gate reutilizable (SECURITY
--      DEFINER, STABLE, search_path='').
--   4. RLS: SELECT = miembro del salón; SIN escritura a authenticated; nada a
--      anon/public.
--   5. Guardián de aserción (defensa en profundidad, patrón de la casa).
--
-- Aditiva y sin backfill: proyecto en desarrollo, sin datos de producción. Los
-- salones existentes quedan sin filas ⇒ sin add-ons activos hasta que HAT3X los
-- provisione (coherente con el opt-in). Un arranque masivo (p. ej. todos con
-- 'loyalty', hoy nativo) iría en una migración de datos aparte.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Catálogo de add-ons contratables (enum tipado)
--
-- Vocabulario CONTROLADO y consumido por el FRONTEND para mostrar/ocultar
-- módulos: un enum nativo (no text libre) da (a) tipado automático en
-- src/types/database.ts (unión TS `salon_feature`) y (b) imposibilita un feature
-- inválido a nivel de motor. En MINÚSCULAS, como el resto de enums de dominio
-- (member_role, appointment_status); NO como los enums de fidelización en
-- MAYÚSCULAS (aquellos replican un contrato externo de denueveanueve).
--
-- Catálogo v1 (== módulos del roadmap: base / +apps / +loyalty / +recepcionista
-- / TPV):
--   loyalty         — fidelización nativa (puntos, cupones, recompensas).
--   client_app      — PWA de cliente (reservas, QR, cartilla de puntos).
--   staff_app       — PWA de personal (agenda, check-in, acreditar visita).
--   ai_receptionist — recepcionista IA (Retell + Twilio + n8n).
--   pos             — TPV / punto de venta (tickets, pagos, VeriFactu).
--
-- Para AÑADIR un add-on en el futuro: `alter type public.salon_feature add value
-- 'nuevo';` en su propia migración (no usable en el mismo statement que lo crea).
-- Para RETIRAR uno hay que recrear el tipo (raro; no se hace aquí).
-- ------------------------------------------------------------------------------
create type public.salon_feature as enum (
  'loyalty',
  'client_app',
  'staff_app',
  'ai_receptionist',
  'pos'
);

comment on type public.salon_feature is
  'Catálogo de add-ons contratables por salón (entitlements): loyalty | client_app | staff_app | ai_receptionist | pos.';

-- ------------------------------------------------------------------------------
-- 2. Tabla de entitlements por salón
--
-- Una fila = un add-on de un salón, con su interruptor (enabled) y una nota
-- opcional de aprovisionamiento (plan de origen, cortesía, nº de contrato). FK
-- SIMPLE a salons: salons es la RAÍZ del árbol multi-tenant y NO tiene clave
-- compuesta (id, salon_id) —las demás tablas la referencian con salon_id →
-- salons(id) on delete cascade—. El UNIQUE (salon_id, feature) impide dos filas
-- del mismo add-on para un salón y —al LIDERAR por salon_id— sirve además al ON
-- DELETE CASCADE y al lookup del helper (§3): por eso NO se añade un índice extra
-- sobre salon_id (sería redundante con el índice del unique).
-- ------------------------------------------------------------------------------
create table public.salon_features (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references public.salons (id) on delete cascade,
  feature     public.salon_feature not null,
  enabled     boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Un add-on aparece como mucho una vez por salón (ancla de unicidad y del
  -- upsert de aprovisionamiento). Índice líder por salon_id ⇒ cubre FK + gate.
  constraint salon_features_feature_key unique (salon_id, feature)
);

comment on table public.salon_features is
  'Entitlements por salón: qué add-ons ha contratado cada salón (productización). Opt-in: un add-on está activo solo si existe su fila y enabled=true (ausencia = no contratado). Lectura para los miembros del salón; la escritura la hace HAT3X (service_role/backoffice), no el salón.';

comment on column public.salon_features.feature is
  'Add-on contratable (enum public.salon_feature): loyalty | client_app | staff_app | ai_receptionist | pos.';

comment on column public.salon_features.enabled is
  'Interruptor del add-on. true = activo; false = contratado pero pausado/suspendido (p. ej. impago). El gate app.salon_has_feature() exige enabled=true.';

comment on column public.salon_features.notes is
  'Nota interna de aprovisionamiento (plan de origen, cortesía, nº de contrato). Irrelevante para la lógica de gate.';

-- updated_at automático (mismo trigger compartido que el resto del esquema).
create trigger trg_salon_features_updated_at
  before update on public.salon_features
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. Gate reutilizable: app.salon_has_feature(p_salon_id, p_feature)
--
-- Devuelve true SOLO si el salón tiene el add-on contratado Y activo (fila
-- presente y enabled=true); false en cualquier otro caso (sin fila, enabled=
-- false, o feature desconocido). Firma con p_feature TEXT (no el enum) para que
-- un valor fuera de catálogo ('typo') devuelva false en vez de lanzar "invalid
-- input value for enum": se compara feature::text = p_feature (se castea la
-- COLUMNA a texto, NUNCA el parámetro al enum).
--
-- SECURITY DEFINER + STABLE + search_path='' (mismo endurecimiento que
-- app.user_salon_ids() / app.has_salon_role()):
--   · DEFINER ⇒ puede usarse DENTRO de políticas RLS de OTRAS tablas
--     (feature-gating: p. ej. condicionar una escritura a que el salón tenga el
--     add-on) sin depender de que el llamante pueda leer salon_features y sin
--     recursión RLS.
--   · STABLE + envolver la llamada en `(select ...)` ⇒ el planner la evalúa una
--     vez por consulta (initPlan), como el resto de anclas.
--   · language sql, cuerpo `select exists(...)` — plantilla exacta de
--     app.has_salon_role().
--
-- NOTA de alcance (honesta): al ser DEFINER y tomar un p_salon_id ARBITRARIO (no
-- se auto-acota a auth.uid() como el resto de helpers), un authenticated podría
-- preguntar por el estado de un add-on de OTRO salón. La fuga se limita a un
-- BOOLEAN por (salón, feature) —no expone filas, notas ni datos de negocio— y es
-- el precio de un gate reutilizable en políticas. Si algún día se quisiera
-- acotar, se intersecaría con app.user_salon_ids() dentro del helper; hoy NO se
-- hace porque cambiaría la semántica para los usos en policy (que necesitan la
-- verdad del entitlement con independencia del llamante).
-- ------------------------------------------------------------------------------
create or replace function app.salon_has_feature(
  p_salon_id uuid,
  p_feature  text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.salon_features sf
    where sf.salon_id = p_salon_id
      and sf.feature::text = p_feature
      and sf.enabled
  );
$$;

comment on function app.salon_has_feature(uuid, text) is
  'Gate de entitlements: true solo si el salón tiene el add-on contratado y activo (fila presente y enabled=true). p_feature es texto: un valor fuera de catálogo devuelve false (no error). SECURITY DEFINER + STABLE + search_path='''' — reutilizable en políticas RLS. Revocada a anon/public.';

-- Solo autenticados; nunca anon/public (mismo criterio que user_salon_ids()).
revoke execute on function app.salon_has_feature(uuid, text) from anon, public;
grant  execute on function app.salon_has_feature(uuid, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. RLS — LECTURA para los miembros del salón; NADA de escritura a authenticated
--
-- deny-by-default: al habilitar RLS SIN política de INSERT/UPDATE/DELETE, ningún
-- usuario autenticado (ni siquiera el owner) puede escribir entitlements desde el
-- navegador — la provisión la hace HAT3X con service_role (bypasa RLS) o el
-- backoffice. La única política es un SELECT acotado por app.user_salon_ids():
-- cada salón ve SUS add-ons y solo esos; nadie externo; nada a anon/public.
--
-- (No se conceden add-ons "de cortesía" editables por el owner: el entitlement es
-- un hecho comercial, no una preferencia del cliente.)
-- ------------------------------------------------------------------------------
alter table public.salon_features enable row level security;

create policy "members_select_salon_features"
  on public.salon_features for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

-- ------------------------------------------------------------------------------
-- 5. Guardián de aserción (defensa en profundidad — patrón de la casa)
--
-- Mismo espíritu que los guardianes de loyalty_base / rls_multitenant_guard /
-- rls_self_guard: si una migración futura debilitara el aislamiento o la regla
-- "el salón NO escribe sus entitlements", esta comprobación de catálogo ABORTA de
-- forma ruidosa (re-ejecutable en CI/entorno limpio). Verifica:
--   (0) el helper app.salon_has_feature(uuid,text) existe, sigue SECURITY DEFINER
--       y NO es ejecutable por anon (integridad del gate, como en rls_self_guard).
--   (a) RLS habilitada en salon_features.
--   (b) SELECT acotado por app.user_salon_ids() (aislamiento por salón intacto).
--   (c) NINGUNA política de escritura (INSERT/UPDATE/DELETE/ALL): la provisión es
--       exclusiva de service_role/HAT3X. (Un FOR ALL también otorga escritura ⇒
--       se veta aquí aunque su USING cite el ancla.)
--   (d) Ninguna política abierta a anon/public.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _helper constant text := 'app.salon_has_feature(uuid, text)';
  _sd  boolean;
  _cnt integer;
begin
  -- (0) Integridad del gate: existe, es DEFINER, no ejecutable por anon.
  select p.prosecdef into _sd
  from pg_proc p
  where p.oid = to_regprocedure(_helper);

  if _sd is null then
    raise exception 'GUARDIÁN ENTITLEMENTS: falta el helper de gate %', _helper
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception 'GUARDIÁN ENTITLEMENTS: el helper % ya no es SECURITY DEFINER (gate degradado)', _helper
      using errcode = 'raise_exception';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', _helper, 'execute')
  then
    raise exception 'GUARDIÁN ENTITLEMENTS: el rol anon puede EJECUTAR % (gate expuesto sin login)', _helper
      using errcode = 'raise_exception';
  end if;

  -- (a) RLS habilitada.
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'salon_features' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN ENTITLEMENTS: public.salon_features no tiene RLS habilitada'
      using errcode = 'raise_exception';
  end if;

  -- (b) SELECT acotado por app.user_salon_ids().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'salon_features'
    and cmd in ('SELECT', 'ALL') and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN ENTITLEMENTS: salon_features no tiene política SELECT acotada por app.user_salon_ids() (posible fuga cross-tenant)'
      using errcode = 'raise_exception';
  end if;

  -- (c) Sin escritura a authenticated (provisión solo service_role/HAT3X).
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'salon_features'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if _cnt > 0 then
    raise exception 'GUARDIÁN ENTITLEMENTS: salon_features tiene % política(s) de escritura — los entitlements solo los escribe HAT3X (service_role)', _cnt
      using errcode = 'raise_exception';
  end if;

  -- (d) Nada abierto a anon/public.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'salon_features'
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN ENTITLEMENTS: salon_features tiene % política(s) expuesta(s) a anon/public', _cnt
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN ENTITLEMENTS: salon_features verificada — gate DEFINER intacto, SELECT acotado por salón, sin escritura de authenticated, nada expuesto a anon/public.';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Semántica OPT-IN (allow-list): sin fila = add-on NO contratado. El gate
--   app.salon_has_feature() exige fila presente Y enabled=true. Para "suspender"
--   sin borrar el histórico, poner enabled=false (p. ej. impago); para "dar de
--   baja" definitiva, borrar la fila. Ambos dejan el gate en false.
--
-- • Aprovisionamiento (HAT3X / service_role), patrón de upsert idempotente:
--     insert into public.salon_features (salon_id, feature, enabled, notes)
--     values ('<uuid>', 'loyalty', true, 'plan Pro')
--     on conflict (salon_id, feature) do update
--       set enabled = excluded.enabled, notes = excluded.notes;
--   Al ser service_role, bypasa RLS (no necesita política de escritura).
--
-- • Uso desde el FRONTEND (gating de UI): el rol `authenticated` NO puede llamar
--   a app.salon_has_feature() vía supabase.rpc() —vive en el esquema `app`, no
--   expuesto por PostgREST—. El frontend GATEA leyendo la tabla (RLS se lo
--   permite como miembro):  select feature from salon_features where enabled;
--   El helper es para reutilización SERVIDOR/POLICY (feature-gating dentro de
--   otras políticas RLS o de funciones SECURITY DEFINER), no un endpoint público.
--
-- • Coherencia TS↔SQL (follow-up, fuera de esta subtarea de migración): regenerar
--   src/types/database.ts para incluir (1) el enum `salon_feature` en el bloque
--   `Enums`, y (2) la tabla `salon_features` en `Tables`. La función
--   app.salon_has_feature NO va en el bloque `Functions` (esquema `app`, no es
--   una RPC de PostgREST). Ver el GAP DE TIPOS ya anotado en
--   docs/convenciones-rls-rpc-audit §0.1.
--
-- • Rollback manual (forward-only; por si hubiera que revertir):
--     drop function if exists app.salon_has_feature(uuid, text);
--     drop table    if exists public.salon_features;   -- borra su trigger/policy
--     drop type     if exists public.salon_feature;
-- =============================================================================
