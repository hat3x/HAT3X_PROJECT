-- =============================================================================
-- salon-os — Migración: guardián RLS de la PRODUCTIZACIÓN (última palabra)
--
-- Cierre defensivo, en UN solo punto y como "última palabra", del contrato de
-- aislamiento de toda la superficie de PRODUCTIZACIÓN (entitlements/planes +
-- white-label). Hermano de:
--   · 20260714110000_rls_multitenant_guard  (lado TPV / facturación),
--   · 20260717130000_rls_self_guard          (lado autoservicio del cliente),
-- y consolidación de los guardianes EN LÍNEA de la tanda de productización:
--   · 20260718100000_salon_features          (entitlements + helper de gate),
--   · 20260718110000_salon_branding          (white-label por salón),
--   · 20260718140000_rpc_get_salon_branding  (lectura pública por RPC, sub-5).
--
-- Es un GUARDIÁN DE ASERCIÓN PURO: NO crea ni redefine tablas, políticas, funciones
-- ni triggers (sería "already exists" y duplicaría lógica). Solo:
--   1. Reafirma RLS habilitada (idempotente: no-op si ya lo está).
--   2. Un bloque DO que verifica, a nivel de CATÁLOGO (pg_class / pg_policies /
--      pg_proc / pg_roles), que el aislamiento sigue intacto y ABORTA la migración
--      si detecta CUALQUIER debilitamiento.
--
-- Al ser la migración de MAYOR timestamp de la tanda de productización, actúa como
-- gate único re-ejecutable en CI/entorno limpio: si una migración futura (o una
-- edición de las de arriba en un rebuild limpio) degradara el aislamiento, este
-- bloque falla de forma RUIDOSA en lugar de filtrar en silencio.
--
-- Invariantes verificados (los tres de esta subtarea):
--   (a) RLS habilitada en salon_features y salon_branding (deny-by-default). Se
--       reafirma además en salons —raíz del tenant— porque su fila lleva los datos
--       MÁS sensibles del esquema (tax_id, legal_name, fiscal_address, email, phone,
--       address, settings): si su RLS cayera, PostgREST los serviría a cualquiera.
--   (b) NINGUNA política de salons / salon_features / salon_branding abierta a
--       anon/public. RLS filtra FILAS, no COLUMNAS: cualquier política anon sobre
--       estas tablas expondría también sus campos sensibles. La única lectura
--       pública legítima del white-label entra por la RPC public.get_salon_branding
--       (5 columnas de marca acotadas por tipo), NUNCA por la tabla.
--   (c) El helper de gate app.salon_has_feature(uuid,text) SIGUE existiendo, como
--       SECURITY DEFINER y NO ejecutable por anon. Es el ancla reutilizable del
--       feature-gating en servidor/policy; si desapareciera o se degradara, todo
--       gate construido sobre él quedaría sin suelo.
--
-- Sin efectos sobre datos ni sobre otras tablas: solo re-afirma RLS (idempotente)
-- y lee catálogo (pg_class / pg_policies / pg_proc / pg_roles).
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Reafirmar RLS (deny-by-default). Idempotente: si ya está activa, no-op.
--    Las tablas NOMBRADAS por la tarea son salon_features y salon_branding; salons
--    entra como raíz del tenant (defensa en profundidad): su fila es la que lleva
--    los campos fiscales/PII del emisor de facturas.
-- ------------------------------------------------------------------------------
alter table public.salons          enable row level security;
alter table public.salon_features  enable row level security;
alter table public.salon_branding  enable row level security;

-- ------------------------------------------------------------------------------
-- 2. Guardián de aserción de la productización.
-- ------------------------------------------------------------------------------
do $guard$
declare
  -- Ancla del feature-gating reutilizable (entitlements). Se localiza por su firma
  -- textual EXACTA: si el helper cambiara de firma (p. ej. ganara un parámetro),
  -- to_regprocedure lo dará por ausente y el guardián abortará — intencional:
  -- obliga a revisar el gate.
  _helper constant text := 'app.salon_has_feature(uuid, text)';
  -- Tablas cuya fila lleva campos sensibles: NINGUNA se expone a anon/public y
  -- todas conservan RLS. salon_features/salon_branding son las de la tarea; salons
  -- es la raíz del tenant (tax_id, legal_name, fiscal_address, email, phone,
  -- address, settings).
  _prod_tables constant text[] := array[
    'salons',
    'salon_features',
    'salon_branding'
  ];
  _t   text;
  _sd  boolean;
  _cnt integer;
begin

  -- =========================================================================
  -- (c) Integridad del helper de gate app.salon_has_feature — ancla del
  --     feature-gating reutilizable en servidor/policy. Mismo criterio que el
  --     check (0) de rls_self_guard y de salon_features §5: existe + sigue siendo
  --     SECURITY DEFINER + no ejecutable por anon.
  -- =========================================================================
  select p.prosecdef into _sd
  from pg_proc p
  where p.oid = to_regprocedure(_helper);

  if _sd is null then
    raise exception
      'GUARDIÁN PRODUCTIZACIÓN: falta el helper de gate % (feature-gating sin suelo)', _helper
      using errcode = 'raise_exception';
  elsif not _sd then
    raise exception
      'GUARDIÁN PRODUCTIZACIÓN: el helper % ya no es SECURITY DEFINER (gate degradado: no usable dentro de políticas de otras tablas sin recursión RLS)', _helper
      using errcode = 'raise_exception';
  end if;

  -- has_function_privilege('anon', …) es true tanto si se concedió a anon
  -- directamente como a PUBLIC (todo rol pertenece a PUBLIC): cubre también el
  -- GRANT-a-public por defecto de CREATE FUNCTION si un rebuild olvidara el revoke.
  -- Se guarda con la existencia del rol para no depender de entornos no-Supabase.
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', _helper, 'execute')
  then
    raise exception
      'GUARDIÁN PRODUCTIZACIÓN: el rol anon puede EJECUTAR % (gate de entitlements expuesto sin login)', _helper
      using errcode = 'raise_exception';
  end if;

  -- =========================================================================
  -- (a) + (b) por cada tabla sensible de la productización.
  -- =========================================================================
  foreach _t in array _prod_tables loop

    -- (a) RLS debe estar habilitada (deny-by-default). Sin ella, las tablas
    --     públicas quedan a merced de los GRANT de PostgREST (anon/authenticated).
    select count(*) into _cnt
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = _t
      and c.relrowsecurity;
    if _cnt = 0 then
      raise exception
        'GUARDIÁN PRODUCTIZACIÓN: la tabla public.% no tiene RLS habilitada (deny-by-default roto; sus campos sensibles quedarían servidos por PostgREST)', _t
        using errcode = 'raise_exception';
    end if;

    -- (b) Ninguna política abierta a anon/public. RLS filtra FILAS, no COLUMNAS:
    --     una política anon aquí expondría también tax_id/legal_name/fiscal_address/
    --     email/phone/address/settings. La lectura pública del branding entra SOLO
    --     por la RPC public.get_salon_branding (superficie cerrada por tipo).
    select count(*) into _cnt
    from pg_policies
    where schemaname = 'public'
      and tablename  = _t
      and (roles && array['anon', 'public']::name[]);
    if _cnt > 0 then
      raise exception
        'GUARDIÁN PRODUCTIZACIÓN: public.% tiene % política(s) a anon/public — expone campos sensibles; la lectura pública debe pasar SOLO por la RPC get_salon_branding, nunca por la tabla', _t, _cnt
        using errcode = 'raise_exception';
    end if;

  end loop;

  raise notice 'GUARDIÁN PRODUCTIZACIÓN: helper app.salon_has_feature DEFINER e inaccesible a anon; RLS activa y sin políticas anon/public en % tablas (salons, salon_features, salon_branding).',
    array_length(_prod_tables, 1);
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Migración FORWARD-ONLY sin objetos que revertir: no crea políticas/funciones/
--   triggers, solo re-afirma RLS (idempotente) y comprueba catálogo. Su "rollback"
--   es un no-op; eliminarla no revierte nada, solo retira la red de seguridad.
--
-- • Solape INTENCIONADO con los guardianes en línea de salon_features §5,
--   salon_branding y rpc_get_salon_branding: defensa en profundidad (belt &
--   suspenders). Un guardián standalone es más descubrible y sirve de gate único
--   re-ejecutable en CI que cubre los TRES objetos (salons + las dos tablas de
--   productización) y el helper a la vez. Si se refactorizan/unifican, conservar
--   AL MENOS un guardián que cubra estos mismos invariantes, incluida la
--   integridad del helper (que las migraciones de tabla no re-comprueban aquí).
--
-- • La lectura PÚBLICA de datos que viven en salons/salon_branding debe entrar
--   SIEMPRE por una RPC SECURITY DEFINER con columnas whitelisted (hoy:
--   public.get_salon_branding — 5 columnas de marca), NUNCA por una política anon
--   sobre la tabla. Si un día se añadiera una política anon "solo de columnas
--   seguras", este guardián abortaría (correcto): RLS no filtra columnas, así que
--   esa política expondría igualmente los campos sensibles de la fila.
--
-- • El check (c) localiza el helper por su firma EXACTA ('app.salon_has_feature
--   (uuid, text)'). Si el helper cambiara de firma, actualizar esa cadena o el
--   guardián lo dará por "ausente" y abortará. Es intencional: fuerza revisar el
--   feature-gating.
-- =============================================================================
