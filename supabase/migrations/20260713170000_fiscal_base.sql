-- =============================================================================
-- salon-os — Migración: base fiscal (datos fiscales + catálogo de productos)
--
-- Objetivo: dar soporte a la facturación española.
--   1. Datos fiscales del emisor (salons): NIF/CIF, razón social, dir. fiscal.
--   2. Datos fiscales del receptor (customers): NIF/CIF y dirección postal
--      (opcionales — solo necesarios si el cliente pide factura nominativa).
--   3. Catálogo de productos vendibles (products): retail además de servicios.
--
-- Convención de nombres: el esquema usa IDENTIFICADORES en inglés con
-- COMENTARIOS en español (name, address, price_cents…). Se mantiene esa regla,
-- así que los conceptos fiscales españoles se mapean a nombres en inglés:
--   NIF/CIF        → tax_id
--   razón social   → legal_name
--   dirección fisc.→ fiscal_address
--   dirección      → address   (igual que salons.address / locations.address)
--   IVA            → vat_rate  (porcentaje)
-- El dinero sigue la invariante del esquema: price_cents (integer) + currency.
--
-- Estado: proyecto en desarrollo, sin datos de producción → las columnas nuevas
-- son NULL/opcionales o con default, no requieren backfill.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- salons — datos fiscales del emisor de facturas
-- ------------------------------------------------------------------------------
alter table public.salons
  add column tax_id         varchar(20),
  add column legal_name     varchar(200),
  add column fiscal_address text;

comment on column public.salons.tax_id is
  'NIF/CIF del salón (identificación fiscal del emisor). Admite IVA intracomunitario con prefijo de país; sin regex rígida para no rechazar formatos válidos.';
comment on column public.salons.legal_name is
  'Razón social (nombre jurídico del emisor en factura). Puede diferir del nombre comercial (salons.name).';
comment on column public.salons.fiscal_address is
  'Domicilio fiscal del emisor, tal como debe figurar en factura (puede diferir de la dirección de la sede física).';

-- ------------------------------------------------------------------------------
-- customers — datos fiscales del receptor (opcionales)
-- ------------------------------------------------------------------------------
alter table public.customers
  add column tax_id  varchar(20),
  add column address text;

comment on column public.customers.tax_id is
  'NIF/CIF del cliente (opcional). Solo necesario para emitir factura nominativa/completa; el ticket simplificado no lo requiere.';
comment on column public.customers.address is
  'Dirección postal/fiscal del cliente (opcional). Necesaria para factura completa.';

-- ------------------------------------------------------------------------------
-- products — catálogo de productos vendibles del salón (retail)
--
-- Comparte la estructura y las convenciones del catálogo de servicios:
-- name único por salón, dinero en price_cents + currency, soft-delete via active.
-- ------------------------------------------------------------------------------
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons (id) on delete cascade,
  name         varchar(200) not null,
  description  text,
  price_cents  integer not null default 0 check (price_cents >= 0),
  currency     char(3) not null default 'EUR',
  -- IVA aplicable en porcentaje (España: 21 general, 10 reducido, 4 superred., 0 exento)
  vat_rate     numeric(5,2) not null default 21.00
               check (vat_rate >= 0 and vat_rate <= 100),
  -- Stock opcional: NULL = producto no inventariado (no se controla existencias)
  stock        integer check (stock >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (salon_id, name)
);

comment on table public.products is
  'Catálogo de productos vendibles de un salón (retail). Independiente de services (que es la agenda). Base para líneas de venta/factura.';
comment on column public.products.price_cents is
  'Precio unitario en céntimos (invariante de dinero del esquema). Se interpreta según currency.';
comment on column public.products.vat_rate is
  'Tipo de IVA aplicable en porcentaje (p. ej. 21.00). Se guarda por producto para soportar tipos reducidos.';
comment on column public.products.stock is
  'Existencias actuales. NULL = producto no inventariado. 0 = agotado.';

create index idx_products_salon_id on public.products (salon_id);
-- Consulta habitual: catálogo activo de un salón (espejo de idx_services_salon_active)
create index idx_products_salon_active on public.products (salon_id, name)
  where active;

-- Clave de apoyo (id, salon_id) para futuras FKs compuestas anti cross-tenant
-- (p. ej. líneas de venta/factura que referencien un producto). Coherente con
-- customers_id_salon_key / services_id_salon_key.
alter table public.products
  add constraint products_id_salon_key unique (id, salon_id);

-- updated_at automático (mismo trigger compartido que el resto de tablas mutables)
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------------------------
-- RLS — mismo patrón que services (lectura: cualquier miembro; escritura:
-- owner/manager). La reserva pública y el cron usan service role y bypasan RLS.
-- ------------------------------------------------------------------------------
alter table public.products enable row level security;

create policy "members_select_products"
  on public.products for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_products"
  on public.products for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_products"
  on public.products for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_products"
  on public.products for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

commit;
