-- =============================================================================
-- salon-os — Migración: RLS SELF de citas (el cliente ve SUS citas) — FASE 3
--
-- DEFENSA EN PROFUNDIDAD, PURAMENTE ADITIVA. Extiende el autoservicio del cliente
-- (partes A/B/C/D de FASE 3; ver docs/roadmap-productizacion.md y docs/convenciones-
-- rls-rpc-audit.md) a la tabla de CITAS: cuando una persona registrada en la app de
-- cliente (customers.user_id = auth.users.id) consulta "mis próximas citas", debe ver
-- EXCLUSIVAMENTE las citas de SU(S) ficha(s), nunca las de otro cliente ni las de otro
-- salón.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISIÓN: política RLS SELF de SOLO LECTURA (no una RPC). Por qué:
--
--   • MÍNIMA y ADITIVA. Reutiliza el ancla YA existente app.user_customer_ids()
--     (parte C) — el mismo mecanismo que ya expone al cliente su fidelización. Es
--     UNA sola política `for select`, sin nueva superficie RPC que versionar, sin
--     otra función SECURITY DEFINER que mantener, sin re-implementar la selección de
--     columnas. Copia exacta del patrón de self_select_own_loyalty_account &co.
--   • IDIOMÁTICA / PostgREST-nativa. La app de cliente consulta `appointments`
--     directamente (filtros por fecha, estado, orden) con el SDK y solo recibe lo
--     suyo; no hay que inventar la firma y los parámetros de una RPC de listado.
--   • SOLO LECTURA por deny-by-default. Se AÑADE únicamente `for select`. El cliente
--     NO gana INSERT/UPDATE/DELETE sobre citas: reservar/cancelar desde la app (si
--     algún día se abre) irá por una RPC SECURITY DEFINER controlada, fuera del
--     alcance de esta subtarea. Coherente con "el cliente lee, el staff/las RPC
--     escriben" del resto de la superficie de autoservicio.
--
--   Una RPC de listado (SECURITY DEFINER) sería MÁS código y MÁS riesgo: bypasa RLS
--   y por tanto tendría que re-implementar a mano el acotado por cuenta + salón, más
--   validación de parámetros de paginación/orden; y divergiría del patrón asentado.
--   La política RLS es estrictamente menos superficie y menos que auditar.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ BASTA CON customer_id (no hace falta filtrar también por salon_id):
--
--   appointments.customer_id es NOT NULL y su FK es COMPUESTA (integridad multi-
--   tenant de 20260712120000_tenant_integrity.sql):
--       appointments_customer_id_fkey (customer_id, salon_id)
--         references public.customers (id, salon_id)
--   ⇒ la cita y su ficha comparten SIEMPRE el mismo salón, garantizado por la BD.
--   Como customers.id es PK GLOBAL (única) y cada id pertenece a UN solo salón,
--   `customer_id in (mis fichas)` jamás casa una cita de otro cliente NI de otro
--   salón: el customer_id ya lo determina todo. Añadir un `and salon_id in (select
--   app.user_salon_ids())` sería INCORRECTO: el cliente no es miembro de ningún salón
--   (user_salon_ids() es vacío para él) y anularía la política. El acotado correcto
--   del autoservicio es por CUENTA (customer_id), no por pertenencia de staff.
--
--   Multi-salón: una persona puede tener una ficha por salón (mismo user_id);
--   app.user_customer_ids() devuelve TODAS sus fichas, así que ve sus citas en los N
--   salones donde es cliente. Correcto por diseño.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CONVIVENCIA CON LAS POLÍTICAS DE STAFF (nada se toca ni se debilita):
--
--   Las políticas de miembros de 20260711100100_rls_policies.sql
--   (members_select_appointments / members_insert_… / members_update_… /
--   managers_delete_…) quedan INTACTAS. RLS combina las políticas permisivas con OR:
--   una fila es visible si la satisface la de staff (salon_id ∈ mis salones) O la
--   nueva SELF (customer_id ∈ mis fichas). Para un cliente que NO es staff de ningún
--   salón, la rama de staff es falsa y solo aplica la rama SELF ⇒ ve exclusivamente
--   sus citas. El guardián del final verifica que ese OR NO expone datos ajenos.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 0. Reafirmar RLS (deny-by-default). Idempotente: ya está activa desde la
--    migración 2 (rls_policies); esto solo documenta la dependencia y protege ante
--    un rebuild que la hubiera dejado desactivada.
-- ------------------------------------------------------------------------------
alter table public.appointments enable row level security;

-- ------------------------------------------------------------------------------
-- 1. appointments — el cliente LEE (SELECT) las citas de SU propio customer
--
-- Política permisiva `to authenticated`, acotada por app.user_customer_ids() (ancla
-- SELF, SECURITY DEFINER + STABLE ⇒ initPlan: se evalúa una vez por consulta). NO se
-- crea ninguna política SELF de INSERT/UPDATE/DELETE: por deny-by-default el cliente
-- no puede escribir citas desde el navegador. Prefijo `self` por convención (ver
-- docs/convenciones-rls-rpc-audit.md §1.2).
--
-- Rendimiento: el filtro `customer_id in (...)` es un semi-join que se apoya en el
-- índice ya existente idx_appointments_customer_id (appointments(customer_id)); no
-- hace falta índice nuevo.
-- ------------------------------------------------------------------------------
create policy "self_select_own_appointments"
  on public.appointments for select to authenticated
  using (customer_id in (select app.user_customer_ids()));

-- ------------------------------------------------------------------------------
-- 2. Guardián de aserción — el OR de políticas NO filtra a otros clientes/salones
--
-- Mismo espíritu que los guardianes de rls_self_customer §4 y rls_self_guard: si una
-- migración futura (o esta misma) rompiera el aislamiento de las citas, esta
-- comprobación de catálogo ABORTA de forma ruidosa en lugar de filtrar en silencio.
-- Verifica, sobre las políticas ACUMULADAS de public.appointments:
--   (0) el ancla SELF app.user_customer_ids() sigue existiendo, SECURITY DEFINER y
--       no ejecutable por anon (base de esta política).
--   (a) RLS habilitada.
--   (b) barrera de STAFF intacta: SELECT acotada por app.user_salon_ids().
--   (c) política SELF de SELECT acotada por app.user_customer_ids().
--   (d) SIN escritura SELF: 0 políticas que referencien user_customer_ids con cmd
--       distinto de SELECT (el cliente jamás crea/edita/borra citas desde la app).
--   (e) ninguna política abierta a anon/public.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _helper constant text := 'app.user_customer_ids()';
  _sd     boolean;
  _cnt    integer;
begin
  -- (0) Integridad del ancla SELF sobre la que se apoya esta política.
  select p.prosecdef into _sd
  from pg_proc p
  where p.oid = to_regprocedure(_helper);

  if _sd is null then
    raise exception
      'GUARDIÁN RLS SELF citas: falta el helper de aislamiento % (base de self_select_own_appointments)', _helper
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception
      'GUARDIÁN RLS SELF citas: el helper % ya no es SECURITY DEFINER (aislamiento degradado)', _helper
      using errcode = 'raise_exception';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', _helper, 'execute')
  then
    raise exception
      'GUARDIÁN RLS SELF citas: el rol anon puede EJECUTAR % (ancla SELF expuesta sin login)', _helper
      using errcode = 'raise_exception';
  end if;

  -- (a) RLS habilitada en appointments.
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'appointments' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF citas: public.appointments no tiene RLS habilitada'
      using errcode = 'raise_exception';
  end if;

  -- (b) Barrera de STAFF intacta: SELECT acotada por app.user_salon_ids().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'appointments'
    and cmd in ('SELECT', 'ALL') and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF citas: appointments perdió la política SELECT de staff (user_salon_ids) — barrera multi-tenant rota'
      using errcode = 'raise_exception';
  end if;

  -- (c) Barrera SELF de SELECT acotada por app.user_customer_ids().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'appointments'
    and cmd in ('SELECT', 'ALL') and qual like '%user_customer_ids%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN RLS SELF citas: appointments no tiene política SELF de SELECT acotada por app.user_customer_ids()'
      using errcode = 'raise_exception';
  end if;

  -- (d) SIN escritura SELF: nada que referencie user_customer_ids fuera de SELECT
  --     (el cliente no crea/edita/borra citas desde el navegador; eso es RPC/staff).
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'appointments'
    and cmd <> 'SELECT'
    and (coalesce(qual, '') || coalesce(with_check, '')) like '%user_customer_ids%';
  if _cnt > 0 then
    raise exception 'GUARDIÁN RLS SELF citas: appointments tiene % política(s) de escritura SELF (el cliente no debe escribir citas)', _cnt
      using errcode = 'raise_exception';
  end if;

  -- (e) Ninguna política de appointments abierta a anon/public.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'appointments'
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN RLS SELF citas: appointments tiene % política(s) expuesta(s) a anon/public', _cnt
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN RLS SELF citas: autoservicio de citas verificado (appointments); el OR de políticas no expone citas de otros clientes ni de otros salones.';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS DE SEGURIDAD Y ALCANCE (para futuros mantenedores)
--
-- • SELECT de la cita propia expone TODA la fila, incluidas notes y cancelled_reason,
--   que pueden contener observaciones internas del staff. No es una fuga cross-tenant
--   (son citas de SU ficha), pero si se quisiera OCULTAR columnas al cliente en la
--   LECTURA (RLS no filtra columnas), hágase en la capa de app (PostgREST: seleccionar
--   solo las columnas necesarias) o con una vista/RPC dedicada. Mismo criterio que la
--   nota de columnas de 20260717120000_rls_self_customer.sql. Fuera del alcance aquí.
--
-- • Escritura del cliente (reservar/cancelar desde la app): INTENCIONADAMENTE fuera de
--   alcance. Cuando se aborde, hágase con una RPC SECURITY DEFINER que valide
--   pertenencia por auth.uid()/user_customer_ids() y las reglas de negocio (horarios,
--   solape, antelación de cancelación), NUNCA abriendo una política SELF de escritura
--   sobre appointments. Si se añadiera tal política, deberá seguir acotada por
--   app.user_customer_ids() en qual Y with_check (o el guardián (d) abortará: correcto).
--
-- • Este guardián es hermano de los de rls_self_customer §4 y rls_self_guard, pero
--   cubre appointments, que NO está en el barrido genérico `_all_tables` de la parte D
--   (aquella lista es customers + 4 tablas de fidelización). Por eso appointments trae
--   aquí su propio guardián inline. Si en el futuro se unifican, conservar los
--   invariantes (a)-(e) para las citas.
--
-- • Rollback manual (forward-only; por si hubiera que revertir):
--     drop policy if exists "self_select_own_appointments" on public.appointments;
-- =============================================================================
