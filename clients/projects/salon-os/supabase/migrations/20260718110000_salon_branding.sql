-- =============================================================================
-- salon-os — Migración: white-label por salón (public.salon_branding)
--
-- Realiza la opción "tabla dedicada" del roadmap de productización
-- (docs/roadmap-productizacion §"Productización — planes + white-label", líneas
-- 52-56): logo + colores de marca por salón, para que el panel y las apps
-- cliente/staff (UN solo código, servidas por subdominio) se pinten con la
-- identidad del salón en runtime. Es la alternativa a meter el branding en
-- salons.settings (jsonb): una tabla 1:1 tipada da CHECK de formato de color,
-- comentarios por columna y una superficie RLS explícita (ver
-- docs/salon-branding-design.md para la justificación completa de columnas).
--
-- Relación 1:1 con salons: salon_id es a la vez PK y FK → como mucho una fila de
-- branding por salón (la unicidad la garantiza la PK, sin índice extra) y el
-- borrado del salón la arrastra en cascada. salons es la raíz del tenant, así que
-- la FK es SIMPLE salon_id → salons(id) (no compuesta; ver audit §2).
--
-- Aislamiento: mismo patrón que products/services (lectura: cualquier miembro;
-- ESCRITURA: solo owner/manager vía app.has_salon_role). Deny-by-default, `to
-- authenticated`, nada a anon/public. La lectura pública para visitantes anónimos
-- del PWA de reservas NO se abre aquí a propósito (rompería el guardián y la
-- postura deny-by-default): queda como decisión futura deliberada — ver
-- docs/salon-branding-design §"Lectura pública (diferida)".
--
-- Estado: proyecto en desarrollo, sin datos de producción. Tabla nueva y vacía →
-- primary_color NOT NULL DEFAULT no requiere backfill.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- salon_branding — identidad visual (white-label) del salón, 1:1 con salons
-- ------------------------------------------------------------------------------
create table public.salon_branding (
  -- PK = FK: fuerza la relación 1:1 (una fila por salón) y ya viene indexada por
  -- la PK, así que no hace falta un idx_..._salon_id aparte. Cascade: al borrar
  -- el salón se elimina su branding.
  salon_id         uuid primary key references public.salons (id) on delete cascade,
  -- URL/ruta del logo del salón. Texto libre (como address/notes): el hosting y
  -- la validación real de la URL viven en la capa de app/Storage, no en un CHECK
  -- rígido que rechazaría rutas de Storage, data URIs o rutas relativas válidas.
  logo_url         text,
  -- Color de marca principal en hex de 6 dígitos con almohadilla (#rrggbb). El
  -- CHECK reutiliza EXACTAMENTE la regex de professionals.color para mantener una
  -- sola convención de color en el esquema (case-insensitive; sin atajo de 3
  -- dígitos ni alfa de 8). NOT NULL con default neutro → las apps SIEMPRE tienen
  -- un color con el que pintar, incluso antes de que el owner lo personalice.
  primary_color    text not null default '#111827'
                   check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  -- Color de acento secundario, OPCIONAL. Mismo formato hex; el CHECK sobre una
  -- columna nullable se cumple cuando el valor es NULL. NULL = sin acento propio
  -- (la app decide el fallback, p. ej. derivarlo del primario).
  secondary_color  text
                   check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.salon_branding is
  'Identidad visual (white-label) del salón: logo y colores de marca. 1:1 con salons (salon_id es PK y FK). El panel y las apps la cargan en runtime para pintarse con la marca del salón.';
comment on column public.salon_branding.salon_id is
  'Salón dueño de este branding. PK y FK simple a salons(id) (raíz del tenant); la PK garantiza la relación 1:1.';
comment on column public.salon_branding.logo_url is
  'URL o ruta de Storage del logo del salón (opcional). Sin CHECK de formato: la validación/hosting se resuelve en la app/Storage.';
comment on column public.salon_branding.primary_color is
  'Color de marca principal en hex #rrggbb (misma regex que professionals.color). NOT NULL con default neutro (#111827) para que la app siempre tenga un color renderizable; el owner lo sobrescribe en Ajustes → Marca.';
comment on column public.salon_branding.secondary_color is
  'Color de acento secundario en hex #rrggbb (opcional). NULL = sin acento propio.';

-- updated_at automático (mismo trigger compartido que el resto de tablas mutables)
create trigger trg_salon_branding_updated_at
  before update on public.salon_branding
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS — mismo patrón que products/services: lectura para cualquier miembro del
-- salón; escritura (INSERT/UPDATE/DELETE) SOLO owner/manager (app.has_salon_role).
-- Deny-by-default; nada a anon/public. El provisioning por service_role bypasa RLS.
-- ------------------------------------------------------------------------------
alter table public.salon_branding enable row level security;

create policy "members_select_salon_branding"
  on public.salon_branding for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_salon_branding"
  on public.salon_branding for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_salon_branding"
  on public.salon_branding for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_salon_branding"
  on public.salon_branding for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ------------------------------------------------------------------------------
-- Guardián de aserción del aislamiento (defensa en profundidad)
--
-- Mismo espíritu que 20260714110000_rls_multitenant_guard y loyalty_base §6: si
-- una migración futura deshabilitara RLS, quitara el SELECT acotado, expusiera la
-- tabla a anon/public o AFLOJARA una política de escritura (dejándola sin gate de
-- owner/manager), esta comprobación ABORTA de forma ruidosa en vez de degradar el
-- aislamiento en silencio. El check (d) protege específicamente la invariante de
-- esta tarea: toda escritura pasa por app.has_salon_role.
-- ------------------------------------------------------------------------------
do $guard$
declare
  _t   constant text := 'salon_branding';
  _cnt integer;
  _pol record;
begin
  -- (a) RLS habilitada.
  select count(*) into _cnt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = _t
    and c.relrowsecurity;
  if _cnt = 0 then
    raise exception
      'GUARDIÁN RLS: la tabla public.% no tiene RLS habilitada (aislamiento multi-tenant roto)', _t
      using errcode = 'raise_exception';
  end if;

  -- (b) Política de SELECT acotada por app.user_salon_ids().
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public'
    and tablename  = _t
    and cmd        in ('SELECT', 'ALL')
    and qual is not null
    and qual like '%user_salon_ids%';
  if _cnt = 0 then
    raise exception
      'GUARDIÁN RLS: public.% no tiene política SELECT acotada por app.user_salon_ids() (posible fuga cross-tenant)', _t
      using errcode = 'raise_exception';
  end if;

  -- (c) Ninguna política abierta a anon / public.
  select count(*) into _cnt
  from pg_policies
  where schemaname = 'public'
    and tablename  = _t
    and (roles && array['anon', 'public']::name[]);
  if _cnt > 0 then
    raise exception
      'GUARDIÁN RLS: public.% tiene % política(s) expuesta(s) a anon/public (acceso sin autenticar)', _t, _cnt
      using errcode = 'raise_exception';
  end if;

  -- (d) Toda política de ESCRITURA (INSERT/UPDATE/DELETE) está anclada en
  --     app.has_salon_role (owner/manager). Si alguna la pierde, aborta.
  for _pol in
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename  = _t
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    if coalesce(_pol.qual, '') || coalesce(_pol.with_check, '') not like '%has_salon_role%' then
      raise exception
        'GUARDIÁN RLS: la política de escritura %.% (%) no exige app.has_salon_role (escritura no restringida a owner/manager)',
        _t, _pol.policyname, _pol.cmd
        using errcode = 'raise_exception';
    end if;
  end loop;

  raise notice 'GUARDIÁN RLS: aislamiento y candado de escritura owner/manager verificados en public.%.', _t;
end;
$guard$;

commit;
