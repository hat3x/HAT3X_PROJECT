-- =============================================================================
-- salon-os — Migración: claves de servicio por salón (public.service_api_keys)
--
-- Introduce la primera vía de autenticación NO-humana del sistema: una clave de
-- API por salón para integraciones externas (webhooks, ERP, portales de terceros)
-- que llaman a HAT3X sin un usuario de auth detrás. Es el equivalente en Salón OS
-- del patrón `api_keys` documentado en docs/loyalty-rules-reference.md §"Auth"
-- (cabecera `x-api-key`, clave validada por SHA-256 hex contra key_hash con
-- is_active = true, actor de auditoría = SYSTEM), que hasta ahora estaba anotado
-- como "no existe (todavía) en Salón OS".
--
-- ── LA REGLA DE ORO: NUNCA SE GUARDA LA CLAVE EN CLARO ──────────────────────
-- Una clave de API es una CREDENCIAL. Igual que una contraseña, se almacena solo
-- su HASH y jamás el secreto en claro:
--   · key_hash  = SHA-256 (hex, 64 chars minúsculas) de la clave completa. Es lo
--     ÚNICO que permite verificar una petición: HAT3X hashea la clave entrante y
--     busca `where key_hash = $1 and is_active`. Si la base de datos se filtrara,
--     el atacante obtiene hashes irreversibles, no claves usables.
--   · key_prefix = un fragmento CORTO y no secreto del inicio de la clave (p. ej.
--     "sk_live_a1b2"), solo para que un humano identifique la clave en un panel
--     ("¿cuál revoco?") sin poder reconstruirla.
-- La clave COMPLETA en claro existe UNA sola vez: en la respuesta del endpoint que
-- la crea (se le muestra al integrador y no se vuelve a poder recuperar). La BD
-- nunca la ve. Dos defensas de esquema refuerzan esta regla y la vuelven
-- estructural, no una convención:
--   (1) CHECK key_hash ~ '^[a-f0-9]{64}$' — solo cabe un digest SHA-256 hex; una
--       clave en claro (con guiones, mayúsculas, longitud distinta) es RECHAZADA.
--   (2) El guardián (§3) ABORTA si algún día aparece una columna con nombre de
--       secreto en claro (key, secret, plaintext, token, password…).
--
-- ── SUPERFICIE DE ACCESO: SOLO service_role (NI SIQUIERA LOS MIEMBROS LEEN) ──
-- A diferencia de las tablas de dominio (que dejan LEER a los miembros del salón
-- vía app.user_salon_ids), esta tabla es de SECRETOS: un key_hash no debe salir
-- nunca al navegador, ni siquiera al owner del salón. Por eso la postura es la más
-- estricta posible, en dos capas:
--   1. RLS habilitada SIN NINGUNA política (deny-by-default total). authenticated y
--      anon no tienen forma de leer/escribir; service_role bypasa RLS y es el único
--      que opera la tabla desde el backend de HAT3X.
--   2. REVOKE de todo privilegio de tabla a anon y authenticated (defensa en
--      profundidad sobre la RLS): la tabla desaparece de la superficie PostgREST de
--      esos roles: un intento devuelve error de permiso, no una lista vacía.
-- El listado "administrable" de claves de un salón (nombre, prefijo, is_active,
-- last_used_at — NUNCA el hash) es responsabilidad de una RPC/endpoint de servidor
-- con service_role que exponga solo columnas seguras; no de un SELECT directo.
--
-- ── POR QUÉ salon_id (FK indexada) Y on delete cascade ──────────────────────
-- Cada clave pertenece a UN salón (multi-tenant): identifica en nombre de quién
-- actúa la integración. FK simple a salons(id) (raíz del tenant) indexada, como
-- toda tabla de dominio (ver 20260711100000 §cabecera). Al borrar el salón se
-- borran sus claves (cascade): una credencial huérfana no tiene sentido.
--
-- Estado: proyecto en desarrollo, sin datos de producción. Tabla nueva y vacía →
-- aditiva, sin backfill.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Tabla de claves de servicio por salón
-- ------------------------------------------------------------------------------
create table public.service_api_keys (
  id           uuid primary key default gen_random_uuid(),
  -- Salón en cuyo nombre actúa la integración. FK simple indexada; cascada al
  -- borrar el salón (una credencial sin salón no tiene sentido).
  salon_id     uuid not null references public.salons (id) on delete cascade,
  -- Etiqueta legible por humanos para identificar la clave ("ERP contable",
  -- "Webhook reservas"). No es secreto.
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  -- HASH SHA-256 (hex, 64 chars minúsculas) de la clave completa. ÚNICO en todo el
  -- sistema (dos claves no pueden colisionar) y es el punto de verificación:
  -- HAT3X hashea la clave entrante y busca por aquí. El CHECK garantiza que aquí
  -- SOLO cabe un digest SHA-256 — una clave en claro sería rechazada por formato.
  key_hash     text not null unique check (key_hash ~ '^[a-f0-9]{64}$'),
  -- Fragmento CORTO y NO secreto del inicio de la clave (p. ej. "sk_live_a1b2"),
  -- solo para que un humano identifique la clave en un panel sin poder
  -- reconstruirla. Acotado en longitud para que nadie meta la clave entera aquí.
  key_prefix   text not null check (char_length(key_prefix) between 3 and 24),
  -- Ámbitos/permisos concedidos a la clave (app-defined; p. ej. 'loyalty:write').
  -- Sin elementos NULL. Vacío = clave sin permisos hasta que se le asignen.
  scopes       text[] not null default '{}'::text[]
               check (array_position(scopes, null::text) is null),
  -- Interruptor de revocación. Verificar SIEMPRE `and is_active` al autenticar:
  -- revocar una clave es poner esto a false, sin borrar la fila (deja rastro).
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  -- Última vez que la clave autenticó correctamente una petición (NULL = nunca
  -- usada aún). Lo actualiza el backend con service_role; útil para detectar
  -- claves inertes y para auditoría.
  last_used_at timestamptz
);

comment on table public.service_api_keys is
  'Claves de API por salón para integraciones externas (auth no-humana). Se almacena SOLO el hash SHA-256 (key_hash) y un prefijo corto no secreto (key_prefix); NUNCA la clave en claro. Tabla de secretos: RLS deny-by-default SIN políticas y privilegios revocados a anon/authenticated — solo service_role (backend HAT3X) la lee/escribe. El listado administrable (sin el hash) va por RPC de servidor, no por SELECT directo.';

comment on column public.service_api_keys.salon_id is
  'Salón en cuyo nombre actúa la integración. FK simple a salons(id) (raíz del tenant), indexada; cascada al borrar el salón.';
comment on column public.service_api_keys.name is
  'Etiqueta legible para identificar la clave ("ERP contable"). No es secreto.';
comment on column public.service_api_keys.key_hash is
  'SHA-256 (hex, 64 chars minúsculas) de la clave COMPLETA. Único en el sistema y punto de verificación (HAT3X hashea la clave entrante y busca por aquí con is_active=true). El CHECK ^[a-f0-9]{64}$ impide guardar aquí nada que no sea un digest — la clave en claro nunca toca la BD.';
comment on column public.service_api_keys.key_prefix is
  'Fragmento corto y NO secreto del inicio de la clave (p. ej. "sk_live_a1b2"), solo para identificarla en un panel. Acotado en longitud para que no quepa la clave entera.';
comment on column public.service_api_keys.scopes is
  'Ámbitos/permisos de la clave (app-defined; sin elementos NULL). Vacío = sin permisos.';
comment on column public.service_api_keys.is_active is
  'Interruptor de revocación. Autenticar SIEMPRE con `and is_active`. Revocar = poner false (no se borra la fila, deja rastro).';
comment on column public.service_api_keys.last_used_at is
  'Última autenticación correcta de la clave (NULL = nunca usada). Lo actualiza el backend con service_role.';

-- FK indexada (regla de la casa: toda tabla de dominio con salon_id la indexa).
-- También sirve para listar las claves de un salón desde el backoffice.
-- La búsqueda de verificación por key_hash ya está cubierta por el índice único
-- que crea la restricción UNIQUE (key_hash): no hace falta índice extra.
create index idx_service_api_keys_salon_id on public.service_api_keys (salon_id);

-- ------------------------------------------------------------------------------
-- 2. Superficie de acceso: SOLO service_role (tabla de secretos)
--
-- Capa 1 — RLS deny-by-default SIN políticas: authenticated y anon no pueden
-- leer ni escribir (ninguna política los habilita); service_role bypasa RLS.
-- Capa 2 — REVOKE (defensa en profundidad sobre la RLS): retira los privilegios
-- que Supabase concede por defecto a anon/authenticated en el esquema public, de
-- modo que la tabla ni siquiera aparece en su superficie PostgREST. Se concede
-- explícitamente a service_role (auto-documentado; ya los tendría por defecto).
-- ------------------------------------------------------------------------------
alter table public.service_api_keys enable row level security;

revoke all on public.service_api_keys from anon, authenticated;
grant  all on public.service_api_keys to service_role;

-- ------------------------------------------------------------------------------
-- 3. Guardián de aserción (defensa en profundidad — patrón de la casa)
--
-- Hermano de los guardianes de salon_security_settings §4 / rls_multitenant_guard:
-- comprueba, a nivel de catálogo, que las garantías de ESTA tabla de secretos
-- siguen intactas y ABORTA la migración (re-ejecutable en CI/entorno limpio) si
-- una migración futura las degradara. Verifica:
--   (a) RLS habilitada.
--   (b) CERO políticas: la tabla no expone NADA a authenticated/anon; solo
--       service_role opera (bypasa RLS). Cualquier política sería una regresión.
--   (c) anon y authenticated NO tienen privilegio de tabla (SELECT/INSERT/UPDATE/
--       DELETE): el REVOKE sigue en pie (belt-and-suspenders sobre la RLS).
--   (d) key_hash sigue siendo UNIQUE (punto de verificación sin colisiones).
--   (e) key_hash conserva el CHECK de formato SHA-256 hex (no se puede colar una
--       clave en claro por esa columna).
--   (f) NUNCA SE GUARDA LA CLAVE EN CLARO: no existe ninguna columna con nombre de
--       secreto en claro (key, api_key, secret, plaintext, token, password…).
-- ------------------------------------------------------------------------------
do $guard$
declare
  _tbl constant regclass := 'public.service_api_keys'::regclass;
  _cnt integer;
begin
  -- (a) RLS habilitada.
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'service_api_keys' and c.relrowsecurity;
  if _cnt = 0 then
    raise exception 'GUARDIÁN CLAVES: public.service_api_keys no tiene RLS habilitada (secretos expuestos)'
      using errcode = 'raise_exception';
  end if;

  -- (b) CERO políticas (solo service_role, que bypasa RLS, opera la tabla).
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public' and tablename = 'service_api_keys';
  if _cnt > 0 then
    raise exception 'GUARDIÁN CLAVES: service_api_keys tiene % política(s) RLS — una tabla de secretos no debe exponer nada a authenticated/anon; solo service_role la opera', _cnt
      using errcode = 'raise_exception';
  end if;

  -- (c) anon/authenticated sin ningún privilegio de tabla (REVOKE intacto).
  if exists (select 1 from pg_roles where rolname = 'anon')
     and ( has_table_privilege('anon', _tbl, 'SELECT')
        or has_table_privilege('anon', _tbl, 'INSERT')
        or has_table_privilege('anon', _tbl, 'UPDATE')
        or has_table_privilege('anon', _tbl, 'DELETE') )
  then
    raise exception 'GUARDIÁN CLAVES: el rol anon conserva algún privilegio sobre service_api_keys (REVOKE degradado)'
      using errcode = 'raise_exception';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and ( has_table_privilege('authenticated', _tbl, 'SELECT')
        or has_table_privilege('authenticated', _tbl, 'INSERT')
        or has_table_privilege('authenticated', _tbl, 'UPDATE')
        or has_table_privilege('authenticated', _tbl, 'DELETE') )
  then
    raise exception 'GUARDIÁN CLAVES: el rol authenticated conserva algún privilegio sobre service_api_keys (REVOKE degradado) — un miembro del salón podría leer key_hash'
      using errcode = 'raise_exception';
  end if;

  -- (d) key_hash sigue siendo UNIQUE.
  select count(*) into _cnt
  from pg_constraint
  where conrelid = _tbl and contype = 'u'
    and pg_get_constraintdef(oid) like '%key_hash%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN CLAVES: key_hash perdió su restricción UNIQUE (colisión de claves posible)'
      using errcode = 'raise_exception';
  end if;

  -- (e) key_hash conserva el CHECK de formato SHA-256 hex.
  select count(*) into _cnt
  from pg_constraint
  where conrelid = _tbl and contype = 'c'
    and pg_get_constraintdef(oid) like '%key_hash%';
  if _cnt = 0 then
    raise exception 'GUARDIÁN CLAVES: key_hash perdió su CHECK de formato SHA-256 hex (podría colarse una clave en claro)'
      using errcode = 'raise_exception';
  end if;

  -- (f) NUNCA la clave en claro: sin columnas con nombre de secreto en claro.
  select count(*) into _cnt
  from pg_attribute a
  where a.attrelid = _tbl and a.attnum > 0 and not a.attisdropped
    and lower(a.attname) = any(array[
      'key', 'api_key', 'apikey', 'secret', 'secret_key', 'raw_key',
      'plain_key', 'plaintext', 'key_plaintext', 'token', 'password'
    ]);
  if _cnt > 0 then
    raise exception 'GUARDIÁN CLAVES: service_api_keys tiene una columna con nombre de secreto en claro — solo debe guardarse el hash (key_hash) y el prefijo (key_prefix)'
      using errcode = 'raise_exception';
  end if;

  raise notice 'GUARDIÁN CLAVES: service_api_keys verificada — RLS sin políticas, sin privilegios de anon/authenticated, key_hash UNIQUE + CHECK SHA-256, y ninguna columna de secreto en claro.';
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • CONTRATO CON EL CONSUMIDOR (verificación de la clave — fuera de ESTA migración):
--   Esta migración crea el ALMACÉN; la autenticación vive en el backend (service_role):
--     1. Al CREAR una clave: generar la clave completa en claro, calcular su
--        SHA-256 hex, guardar (salon_id, name, key_hash=digest, key_prefix=inicio,
--        scopes). Devolver la clave en claro UNA sola vez al integrador; jamás
--        volver a guardarla ni recuperarla.
--     2. Al VERIFICAR una petición (cabecera x-api-key): hashear la clave entrante
--        y `select ... from public.service_api_keys where key_hash = $1 and is_active`.
--        Opcionalmente `update ... set last_used_at = now()` en el acierto.
--     Todo con el cliente de SERVICIO (service_role): anon/authenticated no ven la
--     tabla. Actor de auditoría = SYSTEM (patrón de docs/loyalty-rules-reference.md).
--
-- • Coherencia TS↔SQL (follow-up, fuera de esta subtarea de migración): regenerar
--   src/types/database.ts para incluir `service_api_keys` en `Tables`. No hay RPC
--   nueva en esta migración, así que `Functions` no cambia. Mismo GAP DE TIPOS ya
--   anotado para salon_features/salon_security_settings.
--
-- • Guardián: va INLINE (§3), como salon_security_settings §4. Es de mayor timestamp
--   que rls_multitenant_guard y que rls_productization_guard, así que aquellos NO
--   cubren esta tabla. Si algún día se consolida un guardián standalone posterior,
--   añadir service_api_keys conservando SUS invariantes propios —en especial (b)
--   "cero políticas", (c) "sin privilegios de anon/authenticated" y (f) "ninguna
--   columna de secreto en claro"—, que son MÁS estrictos que el patrón multi-tenant
--   habitual (aquí ni los miembros del salón leen).
--
-- • Rollback manual (forward-only; por si hubiera que revertir):
--     drop table if exists public.service_api_keys;  -- borra índices y restricciones
-- =============================================================================
