-- =============================================================================
-- salon-os — Migración: facturación Verifactu (modo NO VERI*FACTU)
--
-- Objetivo: registro de facturación inmutable y encadenado por huella (hash),
-- conforme al Reglamento Veri*factu (RD 1007/2023 / Orden HAC/1177/2024), operando
-- en modo **NO VERI*FACTU**: los registros NO se remiten en tiempo real a la AEAT,
-- pero el software DEBE conservar una cadena de registros de facturación de alta
-- inalterable, trazable y encadenada — precisamente lo que garantiza esta tabla.
--
-- Nomenclatura (regla del esquema, §1 y §12 de docs/schema-reference.md):
-- IDENTIFICADORES en inglés + COMENTARIOS en español, reutilizando el vocabulario
-- del módulo TPV. Mapeo del brief (tpv_facturas):
--   tpv_facturas       → pos_invoices        (prefijo `pos_`, sigue a pos_sales)
--   serie              → series
--   numero_secuencial  → sequential_number
--   tipo (ticket/completa) → invoice_type    (enum pos_invoice_type)
--   timestamp          → issued_at           (fecha de expedición)
--   hash_actual        → current_hash        (huella SHA-256 del registro, 64 hex)
--   hash_anterior_64   → previous_hash        (huella del registro anterior, 64 hex)
--   desglose IVA       → tax_breakdown (jsonb) + agregados base/cuota/total
--   datos_receptor JSON→ recipient_data (jsonb)
--
-- Invariantes del esquema respetadas:
--   · `salon_id not null references salons(id) on delete cascade` + índice. §1.1
--   · PK `uuid default gen_random_uuid()`. §1.2
--   · FK a entidad de dominio COMPUESTA `(fk_id, salon_id) → tabla(id, salon_id)`. §1.3
--   · Dinero como enteros de céntimos (`*_cents integer >= 0`) + `currency`. §1.6
--   · Helpers/triggers en esquema `app`, `security definer`, `search_path=''`. §1.5
--
-- INMUTABILIDAD (requisito legal Veri*factu — clave de esta migración):
--   · SIN `updated_at`: un registro de facturación nunca se modifica.
--   · Trigger `trg_pos_invoices_immutable` BEFORE UPDATE OR DELETE que aborta la
--     operación a nivel de MOTOR. Es defensa en profundidad por encima de la RLS:
--     bloquea incluso a `service_role` / funciones `SECURITY DEFINER`, que la RLS
--     no detiene. Ni siquiera `owner` puede borrar (a diferencia de pos_payments).
--   · Corolario: el borrado en cascada de un `salon` con facturas queda BLOQUEADO
--     por el trigger (retención legal). El proyecto ya usa soft-delete de salones
--     (`update salons set active = false`), así que esto es el comportamiento
--     deseado, no un efecto colateral.
--
-- Estado: proyecto en desarrollo, sin datos de producción → sin backfill.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- Enum: tipo de factura (mapea a los tipos Veri*factu de la AEAT)
-- ------------------------------------------------------------------------------
create type public.pos_invoice_type as enum (
  'ticket',    -- factura simplificada (Veri*factu F2): sin receptor identificado
  'completa'   -- factura ordinaria/completa (Veri*factu F1): con receptor (NIF/nombre)
);

-- ==============================================================================
-- pos_invoices (tpv_facturas) — registro de facturación de alta, inmutable y
-- encadenado por huella. Cada fila es un "registro de facturación" Veri*factu.
-- ==============================================================================
create table public.pos_invoices (
  id                  uuid primary key default gen_random_uuid(),
  salon_id            uuid not null references public.salons (id) on delete cascade,
  -- Venta de origen (opcional): trazabilidad TPV→factura. El registro fiscal
  -- sobrevive al borrado de la venta operativa (set null, nunca anula salon_id).
  sale_id             uuid,

  -- Numeración: serie + número secuencial dentro de la serie (por salón/emisor).
  invoice_type        public.pos_invoice_type not null default 'ticket',
  series              varchar(60) not null,
  sequential_number   bigint      not null check (sequential_number > 0),
  -- Número visible para PDF/QR (p. ej. "A-2026-42"). Generado, read-only.
  full_number         text generated always as (series || '-' || sequential_number::text) stored,

  -- Fecha de expedición de la factura (FechaExpedicionFactura Veri*factu).
  issued_at           timestamptz not null default now(),
  currency            char(3)     not null default 'EUR',

  -- Desglose de IVA por tipo impositivo (base/cuota/total por tipo). Array jsonb:
  --   [{"vat_rate": 21.00, "base_cents": 10000, "cuota_cents": 2100, "total_cents": 12100}, …]
  -- Un mismo documento puede combinar varios tipos (21/10/4/0 exento) → array.
  tax_breakdown       jsonb   not null,
  -- Agregados denormalizados (suma del desglose), en céntimos, para informes/índices.
  taxable_base_cents  integer not null check (taxable_base_cents >= 0), -- Σ bases imponibles
  tax_cents           integer not null check (tax_cents          >= 0), -- Σ cuotas de IVA
  total_cents         integer not null check (total_cents        >= 0), -- total factura

  -- Snapshots fiscales inmutables (el catálogo/salón puede cambiar tras emitir).
  issuer_data         jsonb,  -- IDEmisorFactura: {tax_id, legal_name, fiscal_address}
  recipient_data      jsonb,  -- datos_receptor: {tax_id, name, address}. NULL en 'ticket' (F2).

  -- Encadenamiento por huella (Veri*factu). SHA-256 en hex (64 caracteres).
  hash_algorithm      text        not null default 'SHA-256',
  current_hash        varchar(64) not null,  -- huella de ESTE registro (hash_actual)
  previous_hash       varchar(64),           -- huella del registro anterior (NULL = primero de la cadena)

  -- Marca temporal de generación del registro de facturación (distinta de issued_at).
  created_at          timestamptz not null default now(),

  -- --- Coherencia de importes: total = base + cuota ---------------------------
  constraint pos_invoices_total_consistency
    check (total_cents = taxable_base_cents + tax_cents),
  -- El desglose debe ser un array JSON (no objeto/escalar)
  constraint pos_invoices_tax_breakdown_is_array
    check (jsonb_typeof(tax_breakdown) = 'array'),
  -- Huellas: exactamente 64 dígitos hexadecimales (SHA-256). previous_hash: NULL o hex.
  constraint pos_invoices_current_hash_hex
    check (current_hash ~ '^[0-9A-Fa-f]{64}$'),
  constraint pos_invoices_previous_hash_hex
    check (previous_hash is null or previous_hash ~ '^[0-9A-Fa-f]{64}$'),
  -- Factura completa (F1) exige receptor identificado; el ticket (F2) no.
  constraint pos_invoices_recipient_required
    check (invoice_type <> 'completa' or recipient_data is not null),

  -- --- Unicidad ---------------------------------------------------------------
  -- Numeración única y secuencial por salón+serie (unicidad de nº de factura).
  constraint pos_invoices_series_number_key
    unique (salon_id, series, sequential_number),
  -- La huella es única dentro del salón (detección de duplicados / manipulación).
  constraint pos_invoices_current_hash_key
    unique (salon_id, current_hash),
  -- Clave de apoyo para futuras FKs compuestas (p. ej. facturas rectificativas).
  constraint pos_invoices_id_salon_key
    unique (id, salon_id),

  -- --- FKs compuestas anti cross-tenant ---------------------------------------
  -- Venta de origen (opcional): al borrarla se anula sale_id, nunca salon_id.
  constraint pos_invoices_sale_id_fkey
    foreign key (sale_id, salon_id)
    references public.pos_sales (id, salon_id) on delete set null (sale_id),
  -- Integridad de la cadena: previous_hash debe corresponder a un registro real
  -- del mismo salón (o ser NULL en el primero). No cascade/set null: los registros
  -- son inmutables y no se borran (el trigger de inmutabilidad lo garantiza).
  constraint pos_invoices_chain_fkey
    foreign key (salon_id, previous_hash)
    references public.pos_invoices (salon_id, current_hash)
);

create index idx_pos_invoices_salon_id     on public.pos_invoices (salon_id);
-- Listado de facturas de un salón por fecha (consulta habitual del libro de facturas)
create index idx_pos_invoices_salon_issued on public.pos_invoices (salon_id, issued_at desc);
create index idx_pos_invoices_sale_id      on public.pos_invoices (sale_id)
  where sale_id is not null;
-- Nota: pos_invoices_series_number_key ya indexa (salon_id, series, sequential_number),
-- lo que resuelve eficientemente "último nº emitido en la serie" (MAX por scan inverso).
-- pos_invoices_current_hash_key indexa (salon_id, current_hash), lo que da soporte a la
-- FK de encadenamiento (previous_hash → current_hash).

comment on table public.pos_invoices is
  'Registro de facturación de alta (Veri*factu, modo NO VERI*FACTU): inmutable y encadenado por huella SHA-256. Numeración única por (salón, serie). No se remite a la AEAT en tiempo real, pero conserva la cadena inalterable exigida por el reglamento.';
comment on column public.pos_invoices.invoice_type is
  'Tipo de factura: ''ticket'' = simplificada (Veri*factu F2, sin receptor) | ''completa'' = ordinaria (F1, con receptor identificado).';
comment on column public.pos_invoices.sequential_number is
  'Número secuencial dentro de la serie. Único y correlativo por (salon_id, series). Sin huecos: lo garantiza la app al asignar el siguiente número.';
comment on column public.pos_invoices.full_number is
  'Número de factura visible (serie-número), generado. Read-only: no insertar/actualizar.';
comment on column public.pos_invoices.tax_breakdown is
  'Desglose de IVA por tipo (array jsonb): [{vat_rate, base_cents, cuota_cents, total_cents}]. Soporta varios tipos impositivos en un mismo documento.';
comment on column public.pos_invoices.taxable_base_cents is
  'Suma de bases imponibles (céntimos). Agregado denormalizado del tax_breakdown para informes; total_cents = taxable_base_cents + tax_cents.';
comment on column public.pos_invoices.issuer_data is
  'Snapshot inmutable del emisor al expedir (IDEmisorFactura): {tax_id, legal_name, fiscal_address}. Copia porque los datos fiscales del salón pueden cambiar después.';
comment on column public.pos_invoices.recipient_data is
  'datos_receptor (jsonb): {tax_id, name, address}. NULL en factura ''ticket'' (simplificada); obligatorio en ''completa''.';
comment on column public.pos_invoices.current_hash is
  'Huella (hash_actual) del registro: SHA-256 en hexadecimal (64 chars). Calculada por la app sobre los campos del registro + previous_hash (encadenamiento Veri*factu).';
comment on column public.pos_invoices.previous_hash is
  'Huella del registro anterior de la cadena del salón (hash_anterior_64). NULL solo en el primer registro. FK a current_hash: debe corresponder a un registro real.';
comment on column public.pos_invoices.hash_algorithm is
  'Algoritmo de huella empleado. Veri*factu usa SHA-256; se guarda para trazabilidad si el algoritmo evolucionara.';
comment on column public.pos_invoices.created_at is
  'Marca temporal de generación del registro de facturación (momento de alta en la cadena), distinta de issued_at (fecha de expedición de la factura).';

-- ==============================================================================
-- Inmutabilidad: prohibir UPDATE y DELETE a nivel de motor (requisito legal).
-- SECURITY DEFINER + search_path='' (§1.5). Bloquea a TODOS los roles, incluido
-- service_role y funciones elevadas — barrera que la RLS por sí sola no ofrece.
-- ==============================================================================
create or replace function app.prevent_pos_invoice_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'pos_invoices es un registro fiscal inmutable (Veri*factu): la operación % está prohibida', tg_op
    using errcode = 'restrict_violation',
          hint = 'Los registros de facturación no se modifican ni se borran. Emita una factura rectificativa si procede.';
  return null; -- inalcanzable
end;
$$;

comment on function app.prevent_pos_invoice_mutation() is
  'Aborta cualquier UPDATE/DELETE sobre pos_invoices para garantizar la inmutabilidad legal (Veri*factu). Defensa en profundidad por encima de la RLS.';

create trigger trg_pos_invoices_immutable
  before update or delete on public.pos_invoices
  for each row execute function app.prevent_pos_invoice_mutation();

-- ==============================================================================
-- RLS — el libro de facturas es consultable por el personal; el alta es operativa
-- (se genera al cerrar una venta). NO hay políticas de UPDATE ni DELETE: la
-- inmutabilidad es absoluta (reforzada por el trigger). Sin flujo anónimo.
-- ==============================================================================
alter table public.pos_invoices enable row level security;

create policy "members_select_pos_invoices"
  on public.pos_invoices for select to authenticated
  using (salon_id in (select app.user_salon_ids()));

create policy "members_insert_pos_invoices"
  on public.pos_invoices for insert to authenticated
  with check (salon_id in (select app.user_salon_ids()));

-- (Intencionadamente sin policy de UPDATE/DELETE: registro inmutable.)

commit;
