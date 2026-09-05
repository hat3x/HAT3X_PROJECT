-- =============================================================================
-- salon-os — Migración: TPV (Terminal Punto de Venta) — módulo de caja/ventas
--
-- Objetivo: registrar cobros en el mostrador del salón (ventas de servicios y de
-- productos retail), sus pagos por método, el catálogo de métodos aceptados y las
-- sesiones de caja (apertura/cierre con arqueo y descuadres).
--
-- Nomenclatura (regla del esquema, §1 y §11 de docs/schema-reference.md):
-- IDENTIFICADORES en inglés + COMENTARIOS en español, reutilizando el vocabulario
-- existente en vez de sinónimos españoles. Mapeo del brief (TPV):
--   tpv_ventas        → pos_sales
--   tpv_lineas        → pos_sale_lines   (precio_cents → unit_price_cents; iva_pct → vat_rate;
--                                          cantidad → quantity)
--   tpv_pagos         → pos_payments     (metodo → method; importe_cents → amount_cents)
--   tpv_metodos_pago  → pos_payment_methods
--   tpv_sesiones_caja → pos_sessions     (apertura/cierre, totales por método, descuadres)
-- Prefijo común `pos_` (Point of Sale = TPV) para agrupar el módulo.
--
-- Invariantes respetadas:
--   · Dinero como enteros de céntimos (`*_cents integer >= 0`) + `currency char(3)`
--     (NO numeric/float, NO `precio_cents`). §1.6.
--   · Todo lleva `salon_id not null references salons(id) on delete cascade` + índice. §1.1.
--   · FKs a entidades de dominio son COMPUESTAS `(fk_id, salon_id) → tabla(id, salon_id)`,
--     con `unique(id, salon_id)` de apoyo en las tablas referenciables. §1.3.
--   · `updated_at` + trigger `app.set_updated_at()` en tablas mutables. §1.4.
--   · Helpers/triggers en esquema `app`, `security definer`, `search_path=''`. §1.5.
--   · Snapshots de nombre/precio en las líneas (el catálogo puede cambiar/borrarse). §1.7.
--
-- Estado: proyecto en desarrollo, sin datos de producción → sin backfill.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------------------------
create type public.pos_sale_status as enum (
  'open',       -- ticket en curso (carrito abierto, aún sin cerrar)
  'completed',  -- venta cobrada y cerrada
  'voided',     -- anulada antes de cobrar (o corregida)
  'refunded'    -- devuelta tras cobrar (total o parcial)
);

create type public.pos_payment_method as enum (
  'efectivo',
  'tarjeta',
  'bizum',
  'transferencia',
  'otro'
);
-- Nota sobre "pago mixto": un ticket pagado con varios métodos NO usa un valor
-- 'mixto' en el pago individual (cada pago tiene un único método). El pago mixto
-- se representa de forma natural como VARIAS filas en pos_payments para la misma
-- venta (p. ej. una en 'efectivo' y otra en 'tarjeta').

create type public.pos_session_status as enum (
  'open',    -- caja abierta
  'closed'   -- caja cerrada (arqueada)
);

-- ==============================================================================
-- pos_payment_methods (tpv_metodos_pago) — catálogo de métodos aceptados por salón
--
-- Capa de configuración por salón sobre los tipos base (`kind`): permite etiquetar
-- ("Tarjeta Redsys"), ordenar, activar/desactivar y marcar si el método afecta al
-- cajón de efectivo (para el arqueo). Se autoprovisiona con 3 métodos por defecto
-- al crear el salón (trigger, más abajo).
-- ==============================================================================
create table public.pos_payment_methods (
  id                   uuid primary key default gen_random_uuid(),
  salon_id             uuid not null references public.salons (id) on delete cascade,
  kind                 public.pos_payment_method not null,
  name                 varchar(100) not null,          -- etiqueta visible en el TPV
  -- true solo para métodos que mueven efectivo físico (cuentan en el cuadre de caja)
  affects_cash_drawer  boolean not null default false,
  active               boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (salon_id, name),
  -- Clave de apoyo para FKs compuestas anti cross-tenant (pos_payments)
  constraint pos_payment_methods_id_salon_key unique (id, salon_id)
);

create index idx_pos_payment_methods_salon_id on public.pos_payment_methods (salon_id);
-- Consulta habitual: métodos activos ordenados para pintar el TPV
create index idx_pos_payment_methods_salon_active
  on public.pos_payment_methods (salon_id, sort_order)
  where active;

comment on table public.pos_payment_methods is
  'Catálogo de métodos de pago aceptados por el salón (TPV). Configura etiqueta, orden y si afecta al cajón de efectivo. Se autoprovisiona por trigger al crear el salón.';
comment on column public.pos_payment_methods.kind is
  'Tipo base del método (enum). Agrupa para reconciliación aunque el salón defina varias etiquetas del mismo tipo.';
comment on column public.pos_payment_methods.affects_cash_drawer is
  'true = mueve efectivo físico (cuenta en el arqueo de caja). Normalmente solo ''efectivo''.';

create trigger trg_pos_payment_methods_updated_at
  before update on public.pos_payment_methods
  for each row execute function app.set_updated_at();

-- ==============================================================================
-- pos_sessions (tpv_sesiones_caja) — sesiones de caja (apertura / cierre / arqueo)
--
-- Una sesión agrupa las ventas cobradas entre una apertura y un cierre. En el
-- cierre se registra el efectivo contado frente al esperado (descuadre) y un
-- snapshot de totales por método para el informe de arqueo.
-- ==============================================================================
create table public.pos_sessions (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid not null references public.salons (id) on delete cascade,
  -- Caja física (sede). Opcional: un salón pequeño puede tener una sola caja.
  location_id           uuid,
  status                public.pos_session_status not null default 'open',
  currency              char(3) not null default 'EUR',
  -- Apertura
  opened_by             uuid references auth.users (id) on delete set null,
  opened_at             timestamptz not null default now(),
  opening_float_cents   integer not null default 0 check (opening_float_cents >= 0), -- fondo de caja inicial
  -- Cierre (nulos hasta arquear)
  closed_by             uuid references auth.users (id) on delete set null,
  closed_at             timestamptz,
  expected_cash_cents   integer check (expected_cash_cents >= 0),  -- efectivo esperado = fondo + ventas efectivo − devoluciones
  counted_cash_cents    integer check (counted_cash_cents >= 0),   -- efectivo realmente contado en el arqueo
  cash_variance_cents   integer,                                   -- descuadre = counted − expected (puede ser negativo)
  -- Snapshot de totales por método al cierre, p. ej. {"efectivo": 12300, "tarjeta": 45600}
  closing_totals        jsonb,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Coherencia: una sesión cerrada debe tener fecha de cierre y viceversa
  constraint pos_sessions_close_consistency
    check ((status = 'closed') = (closed_at is not null)),
  -- FK compuesta a la caja/sede (no anula salon_id al borrar la sede)
  constraint pos_sessions_location_id_fkey
    foreign key (location_id, salon_id)
    references public.locations (id, salon_id) on delete set null (location_id),
  -- Clave de apoyo para FKs compuestas anti cross-tenant (pos_sales, pos_payments)
  constraint pos_sessions_id_salon_key unique (id, salon_id)
);

create index idx_pos_sessions_salon_id     on public.pos_sessions (salon_id);
create index idx_pos_sessions_salon_opened on public.pos_sessions (salon_id, opened_at desc);
create index idx_pos_sessions_location_id  on public.pos_sessions (location_id)
  where location_id is not null;
-- Como mucho una caja ABIERTA por (salón, sede). Con location_id NULL los NULL son
-- distintos en el índice único, así que no bloquea sesiones sin sede asignada.
create unique index uq_pos_sessions_open_per_location
  on public.pos_sessions (salon_id, location_id)
  where status = 'open';

comment on table public.pos_sessions is
  'Sesión de caja del TPV (apertura→cierre). El arqueo registra efectivo contado vs esperado (descuadre) y un snapshot de totales por método.';
comment on column public.pos_sessions.cash_variance_cents is
  'Descuadre de efectivo = counted_cash_cents − expected_cash_cents. Negativo = falta dinero en caja.';
comment on column public.pos_sessions.closing_totals is
  'Snapshot denormalizado de totales por método al cierre (jsonb), para el informe de arqueo. Los detalles vivos están en pos_payments.';

create trigger trg_pos_sessions_updated_at
  before update on public.pos_sessions
  for each row execute function app.set_updated_at();

-- ==============================================================================
-- pos_sales (tpv_ventas) — cabecera de venta / ticket
--
-- Vincula opcionalmente una cita, un cliente y un profesional. Los totales son
-- snapshots en céntimos, mantenidos por la app/RPC al cerrar el ticket (dependen
-- de las líneas y de los descuentos aplicados).
-- ==============================================================================
create table public.pos_sales (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null references public.salons (id) on delete cascade,
  session_id       uuid,  -- caja donde se cobró (opcional: venta sin sesión abierta)
  appointment_id   uuid,  -- cita de origen (opcional: venta de mostrador/walk-in)
  customer_id      uuid,  -- cliente (opcional: ticket anónimo/simplificado)
  professional_id  uuid,  -- profesional atribuido (opcional)
  status           public.pos_sale_status not null default 'open',
  -- Totales (snapshot en céntimos). total = subtotal − discount + tax
  subtotal_cents   integer not null default 0 check (subtotal_cents >= 0), -- base imponible (sin IVA)
  discount_cents   integer not null default 0 check (discount_cents >= 0), -- descuento total
  tax_cents        integer not null default 0 check (tax_cents >= 0),      -- IVA total
  total_cents      integer not null default 0 check (total_cents >= 0),    -- total a cobrar
  currency         char(3) not null default 'EUR',
  sold_by          uuid references auth.users (id) on delete set null,     -- cajero
  sold_at          timestamptz not null default now(),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- FKs compuestas anti cross-tenant. Todas anulan solo su columna (nunca salon_id):
  -- la venta es un registro financiero que sobrevive al borrado de sus referencias.
  constraint pos_sales_session_id_fkey
    foreign key (session_id, salon_id)
    references public.pos_sessions (id, salon_id) on delete set null (session_id),
  constraint pos_sales_appointment_id_fkey
    foreign key (appointment_id, salon_id)
    references public.appointments (id, salon_id) on delete set null (appointment_id),
  constraint pos_sales_customer_id_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete set null (customer_id),
  constraint pos_sales_professional_id_fkey
    foreign key (professional_id, salon_id)
    references public.professionals (id, salon_id) on delete set null (professional_id),
  -- Clave de apoyo para FKs compuestas de líneas y pagos
  constraint pos_sales_id_salon_key unique (id, salon_id)
);

create index idx_pos_sales_salon_sold     on public.pos_sales (salon_id, sold_at desc);
create index idx_pos_sales_session_id      on public.pos_sales (session_id)
  where session_id is not null;
create index idx_pos_sales_customer_id     on public.pos_sales (customer_id)
  where customer_id is not null;
create index idx_pos_sales_appointment_id  on public.pos_sales (appointment_id)
  where appointment_id is not null;
create index idx_pos_sales_professional_id on public.pos_sales (professional_id)
  where professional_id is not null;
-- Tickets abiertos del salón (los que el TPV muestra como "en curso")
create index idx_pos_sales_salon_open on public.pos_sales (salon_id, sold_at desc)
  where status = 'open';

comment on table public.pos_sales is
  'Cabecera de venta del TPV (ticket). Totales en céntimos como snapshot mantenido al cierre. Vincula opcionalmente cita, cliente y profesional.';
comment on column public.pos_sales.total_cents is
  'Total a cobrar en céntimos (subtotal − discount + tax). Snapshot mantenido por la app al cerrar; debe cuadrar con la suma de pos_payments de la venta.';

create trigger trg_pos_sales_updated_at
  before update on public.pos_sales
  for each row execute function app.set_updated_at();

-- ==============================================================================
-- pos_sale_lines (tpv_lineas) — líneas del ticket (servicio, producto o manual)
--
-- Cada línea referencia como mucho un servicio O un producto (o ninguno: cargo
-- manual/libre). `description` guarda el nombre en el momento de la venta porque el
-- catálogo puede cambiar o borrarse (snapshot, §1.7).
-- ==============================================================================
create table public.pos_sale_lines (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid not null references public.salons (id) on delete cascade,
  sale_id           uuid not null,
  service_id        uuid,  -- si la línea es un servicio
  product_id        uuid,  -- si la línea es un producto
  -- Tipo derivado de la línea (para informes), inmutable → columna generada
  item_kind         text generated always as (
                      case
                        when service_id is not null then 'service'
                        when product_id is not null then 'product'
                        else 'manual'
                      end
                    ) stored,
  description       varchar(200) not null,  -- snapshot del nombre del servicio/producto
  quantity          numeric(12,3) not null default 1 check (quantity > 0), -- admite fracciones (venta por peso)
  unit_price_cents  integer not null default 0 check (unit_price_cents >= 0), -- precio unitario (snapshot)
  discount_cents    integer not null default 0 check (discount_cents >= 0),   -- descuento de la línea
  vat_rate          numeric(5,2) not null default 21.00
                    check (vat_rate >= 0 and vat_rate <= 100),  -- IVA aplicado (%), snapshot
  -- Total de la línea en céntimos (IVA incluido, tras descuento). Snapshot mantenido por la app.
  line_total_cents  integer not null default 0 check (line_total_cents >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Una línea no puede ser servicio Y producto a la vez (sí ninguno = cargo manual)
  constraint pos_sale_lines_item_exclusive
    check (not (service_id is not null and product_id is not null)),
  -- Líneas mueren con la venta (parte inseparable del ticket)
  constraint pos_sale_lines_sale_id_fkey
    foreign key (sale_id, salon_id)
    references public.pos_sales (id, salon_id) on delete cascade,
  -- El servicio/producto puede borrarse del catálogo: se anula el FK, queda el snapshot
  constraint pos_sale_lines_service_id_fkey
    foreign key (service_id, salon_id)
    references public.services (id, salon_id) on delete set null (service_id),
  constraint pos_sale_lines_product_id_fkey
    foreign key (product_id, salon_id)
    references public.products (id, salon_id) on delete set null (product_id)
);

create index idx_pos_sale_lines_sale_id    on public.pos_sale_lines (sale_id);
create index idx_pos_sale_lines_salon_id   on public.pos_sale_lines (salon_id);
create index idx_pos_sale_lines_service_id on public.pos_sale_lines (service_id)
  where service_id is not null;
create index idx_pos_sale_lines_product_id on public.pos_sale_lines (product_id)
  where product_id is not null;

comment on table public.pos_sale_lines is
  'Líneas de una venta del TPV. Como mucho un servicio O un producto por línea (ninguno = cargo manual). description/unit_price_cents/vat_rate son snapshots del momento de la venta.';
comment on column public.pos_sale_lines.item_kind is
  'Tipo de línea derivado (generado): service | product | manual. Read-only.';
comment on column public.pos_sale_lines.quantity is
  'Cantidad vendida. numeric(12,3) para admitir fracciones (p. ej. producto por peso).';

create trigger trg_pos_sale_lines_updated_at
  before update on public.pos_sale_lines
  for each row execute function app.set_updated_at();

-- ==============================================================================
-- pos_payments (tpv_pagos) — pagos que liquidan una venta
--
-- Un ticket puede liquidarse con varios pagos (pago mixto = varias filas con
-- distinto método). Registro casi inmutable (insert/delete, sin update), como
-- visits: corregir un pago = borrarlo y volver a insertarlo.
-- ==============================================================================
create table public.pos_payments (
  id                 uuid primary key default gen_random_uuid(),
  salon_id           uuid not null references public.salons (id) on delete cascade,
  sale_id            uuid not null,
  session_id         uuid,  -- caja del cobro (normalmente heredada de la venta)
  method             public.pos_payment_method not null,  -- tipo base (autoridad para reconciliación)
  payment_method_id  uuid,  -- método concreto del catálogo del salón (opcional, para informes)
  amount_cents       integer not null check (amount_cents > 0), -- importe aplicado a la venta
  paid_at            timestamptz not null default now(),
  reference          varchar(100),  -- nº autorización tarjeta / id de operación Bizum, etc.
  created_at         timestamptz not null default now(),
  -- Pagos mueren con la venta
  constraint pos_payments_sale_id_fkey
    foreign key (sale_id, salon_id)
    references public.pos_sales (id, salon_id) on delete cascade,
  constraint pos_payments_session_id_fkey
    foreign key (session_id, salon_id)
    references public.pos_sessions (id, salon_id) on delete set null (session_id),
  constraint pos_payments_payment_method_id_fkey
    foreign key (payment_method_id, salon_id)
    references public.pos_payment_methods (id, salon_id) on delete set null (payment_method_id)
);

create index idx_pos_payments_sale_id           on public.pos_payments (sale_id);
create index idx_pos_payments_salon_id          on public.pos_payments (salon_id);
create index idx_pos_payments_session_id        on public.pos_payments (session_id)
  where session_id is not null;
create index idx_pos_payments_payment_method_id on public.pos_payments (payment_method_id)
  where payment_method_id is not null;
-- Arqueo por sesión y método (totales por método de una caja)
create index idx_pos_payments_session_method on public.pos_payments (session_id, method)
  where session_id is not null;

comment on table public.pos_payments is
  'Pagos que liquidan una venta del TPV. Pago mixto = varias filas con distinto método. Registro casi inmutable (insert/delete, sin update).';
comment on column public.pos_payments.method is
  'Tipo base del pago (enum). Autoridad para la reconciliación de caja, siempre presente aunque payment_method_id sea NULL.';
comment on column public.pos_payments.payment_method_id is
  'Método concreto del catálogo del salón (pos_payment_methods), opcional. Enriquece el informe sin ser imprescindible.';

-- ==============================================================================
-- Autoprovisión de métodos de pago por salón (espejo de register_salon_owner)
-- ==============================================================================
create or replace function app.register_salon_payment_methods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pos_payment_methods
    (salon_id, kind, name, affects_cash_drawer, sort_order)
  values
    (new.id, 'efectivo', 'Efectivo', true,  1),
    (new.id, 'tarjeta',  'Tarjeta',  false, 2),
    (new.id, 'bizum',    'Bizum',    false, 3);
  return new;
end;
$$;

comment on function app.register_salon_payment_methods() is
  'Crea los métodos de pago por defecto (efectivo, tarjeta, bizum) al dar de alta un salón. SECURITY DEFINER: bypasa RLS.';

create trigger trg_salons_register_payment_methods
  after insert on public.salons
  for each row
  when (new.id is not null)
  execute function app.register_salon_payment_methods();

-- ==============================================================================
-- RLS — el TPV es trabajo operativo del personal:
--   · lectura: cualquier miembro del salón
--   · alta/edición de venta/línea/pago/sesión: cualquier miembro (cajero)
--   · configuración (métodos) y borrados sensibles: owner/manager
-- La reserva pública/cron no toca el TPV. No hay flujo anónimo.
-- ==============================================================================
alter table public.pos_payment_methods enable row level security;
alter table public.pos_sessions        enable row level security;
alter table public.pos_sales           enable row level security;
alter table public.pos_sale_lines      enable row level security;
alter table public.pos_payments        enable row level security;

-- ---- pos_payment_methods (config: escritura owner/manager, como services) -----
create policy "members_select_pos_payment_methods"
  on public.pos_payment_methods for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "managers_insert_pos_payment_methods"
  on public.pos_payment_methods for insert to authenticated
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_update_pos_payment_methods"
  on public.pos_payment_methods for update to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]))
  with check (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

create policy "managers_delete_pos_payment_methods"
  on public.pos_payment_methods for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ---- pos_sessions (abrir/cerrar caja: operativo; borrar: owner/manager) --------
create policy "members_select_pos_sessions"
  on public.pos_sessions for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "members_insert_pos_sessions"
  on public.pos_sessions for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

create policy "members_update_pos_sessions"
  on public.pos_sessions for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

create policy "managers_delete_pos_sessions"
  on public.pos_sessions for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ---- pos_sales (venta: operativo; borrar: owner/manager) -----------------------
create policy "members_select_pos_sales"
  on public.pos_sales for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "members_insert_pos_sales"
  on public.pos_sales for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

create policy "members_update_pos_sales"
  on public.pos_sales for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

create policy "managers_delete_pos_sales"
  on public.pos_sales for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

-- ---- pos_sale_lines (editar carrito: operativo, incl. borrado de líneas) --------
create policy "members_select_pos_sale_lines"
  on public.pos_sale_lines for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "members_insert_pos_sale_lines"
  on public.pos_sale_lines for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

create policy "members_update_pos_sale_lines"
  on public.pos_sale_lines for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

create policy "members_delete_pos_sale_lines"
  on public.pos_sale_lines for delete to authenticated
  using (salon_id in (select app.user_salon_ids()));

-- ---- pos_payments (cobrar: operativo; anular un pago: owner/manager) ------------
create policy "members_select_pos_payments"
  on public.pos_payments for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "members_insert_pos_payments"
  on public.pos_payments for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

create policy "managers_delete_pos_payments"
  on public.pos_payments for delete to authenticated
  using (app.has_salon_role(salon_id, array['owner','manager']::public.member_role[]));

commit;
