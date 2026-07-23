-- =============================================================================
-- salon-os — Migración: FILTROS de facturación resueltos en servidor + TOTALES
--
-- Objetivo (HAT3X-033, sub-6): el libro de facturas (`pos_invoices`) se filtra en
-- la BASE, no en el navegador — por rango de fechas, sede, tipo (F1/F2), método de
-- pago y búsqueda por número/cliente — y además se devuelve una fila de TOTALES del
-- periodo filtrado (Σ base imponible, Σ IVA, Σ total, nº de facturas).
--
-- ── Por qué una RPC y no `.from().select()` con joins embebidos ───────────────
-- Dos de los filtros NO viven en `pos_invoices`:
--   · SEDE   → pos_invoices.sale_id → pos_sales.session_id → pos_sessions.location_id
--   · MÉTODO → pos_invoices.sale_id → pos_payments.method   (relación a-VARIOS)
-- Filtrar el método por un join a `pos_payments` DUPLICARÍA la factura (una fila por
-- cobro) y, sobre ese conjunto inflado, `sum(total_cents)` DESCUADRARÍA (contaría el
-- total del ticket tantas veces como cobros tenga). Aquí el método se filtra con un
-- `EXISTS` correlacionado: no hay fan-out, así que la LISTA no repite facturas y los
-- TOTALES suman cada factura UNA sola vez. Además la agregación ocurre en servidor
-- (no se traen miles de facturas al cliente para sumarlas).
--
-- ── DRY: una sola fuente de verdad del filtro ────────────────────────────────
-- El predicado de filtrado vive en UN único sitio: el helper interno
-- `app.salon_filtered_invoices`. Las dos funciones públicas se apoyan en él:
--   · `salon_invoices_filtered` → ordena (issued_at, nº correlativo desc) y ACOTA
--     a las `p_limit` más recientes (la LISTA que pinta la tabla).
--   · `salon_invoices_totals`   → agrega (count + Σ) sobre EXACTAMENTE el mismo
--     conjunto (sin el limit): los totales siempre cuadran con lo filtrado.
-- Así es imposible que lista y totales apliquen filtros distintos.
--
-- ── INVARIANTES respetadas (mismas que la capa de métricas, sub-2) ────────────
--   · Dinero SIEMPRE en céntimos enteros (columnas *_cents). Las sumas se devuelven
--     como `bigint` (sum(integer) → bigint): miles de facturas no desbordan ni usan
--     float. La UI formatea con `formatMoney(cents)`; aquí NO se recalcula ningún
--     importe (se suman los snapshots ya cerrados e inmutables de `pos_invoices`).
--   · Huso horario del salón: el rango [p_from, p_to] son fechas LOCALES del salón
--     y `p_to` es INCLUSIVO (día completo). Se convierten a [from_ts, to_ts) en UTC
--     con `salons.timezone` (por defecto Europe/Madrid), igual que las métricas.
--   · `pos_invoices` es de SOLO LECTURA e INMUTABLE (trigger que aborta UPDATE/
--     DELETE): estas funciones jamás escriben.
--
-- ── SEGURIDAD — aislamiento multi-tenant "acotado por salon_id CON RLS" ───────
--   SOLO LECTURA y **SECURITY INVOKER** (no definer): al ejecutarse con los
--   privilegios del llamador, la RLS de pos_invoices / pos_sales / pos_payments /
--   pos_sessions / customers SIGUE aplicándose dentro de la función — el
--   aislamiento entre salones lo garantiza la RLS existente, no un WHERE frágil.
--   Además cada consulta filtra `salon_id = p_salon_id` para acotar a UN salón
--   (un usuario puede ser miembro de varios) y aprovechar el índice del libro de
--   facturas `(salon_id, issued_at desc)`. `set search_path = ''` + todo objeto
--   cualificado por esquema (anti-inyección de search_path). Misma desviación
--   deliberada y documentada que sub-2 (lectura analítica → invoker es más seguro).
--
--   GRANT execute a `authenticated` (panel con sesión) y `service_role`; REVOKE a
--   public/anon. El helper `app.salon_filtered_invoices` vive en el esquema `app`
--   (no expuesto por PostgREST) y se concede igual, para que las funciones públicas
--   —también invoker— puedan invocarlo con los privilegios del usuario.
--
-- Estado: proyecto en desarrollo, sin datos de producción → sin backfill.
-- Reflejado en el bloque `Functions` de src/types/database.ts.
-- =============================================================================

begin;

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper interno: conjunto de facturas del salón que CASAN con todos los filtros.
-- Devuelve las columnas que la tabla necesita + `sequential_number` (para ordenar
-- de forma estable a igualdad de fecha). SIN order/limit: de eso se encargan las
-- funciones públicas (la lista ordena y acota; los totales agregan todo).
--
-- Filtros (todos OPCIONALES; NULL = sin filtro):
--   · p_from / p_to      → rango de fechas de expedición (local del salón, p_to incl.)
--   · p_location_id      → sede (vía venta → sesión → sede); facturas sin sesión/sede
--                          quedan fuera cuando se pide una sede concreta.
--   · p_invoice_type     → 'completa' (F1) | 'ticket' (F2)
--   · p_payment_method   → método base del enum (EXISTS sobre pos_payments; sin fan-out)
--   · p_search           → coincidencia (contiene, sin distinguir mayúsculas) en el
--                          número, el nombre del receptor (F1) o el cliente de la venta.
--                          Se ESCAPAN %, _ y \ para que sea búsqueda literal.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function app.salon_filtered_invoices(
  p_salon_id       uuid,
  p_from           date,
  p_to             date,
  p_location_id    uuid,
  p_invoice_type   text,
  p_payment_method text,
  p_search         text
)
returns table (
  id                 uuid,
  full_number        text,
  invoice_type       public.pos_invoice_type,
  issued_at          timestamptz,
  recipient_data     jsonb,
  taxable_base_cents integer,
  tax_cents          integer,
  total_cents        integer,
  currency           text,
  sequential_number  bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cfg as (
    select coalesce(
      (select s.timezone from public.salons s where s.id = p_salon_id),
      'Europe/Madrid'
    ) as tz
  ),
  params as (
    select
      case when p_from is null then null
           else (p_from::timestamp)     at time zone cfg.tz end as from_ts,
      case when p_to   is null then null
           else ((p_to + 1)::timestamp) at time zone cfg.tz end as to_ts,
      case when p_search is null or btrim(p_search) = '' then null
           -- Escapa \ primero, luego los comodines % y _ (LIKE usa \ como escape).
           else '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as search_like
    from cfg
  )
  select
    i.id,
    i.full_number,
    i.invoice_type,
    i.issued_at,
    i.recipient_data,
    i.taxable_base_cents,
    i.tax_cents,
    i.total_cents,
    i.currency,
    i.sequential_number
  from public.pos_invoices i
  cross join params pr
  -- La venta de origen ata la factura a su sede (vía sesión) y a su cliente. sale_id
  -- es opcional: con LEFT JOIN, las facturas sin venta siguen visibles salvo que se
  -- filtre por sede o método (que exigen esa cadena).
  left join public.pos_sales s
    on s.id = i.sale_id and s.salon_id = i.salon_id
  left join public.pos_sessions sess
    on sess.id = s.session_id and sess.salon_id = i.salon_id
  left join public.customers c
    on c.id = s.customer_id and c.salon_id = i.salon_id
  where i.salon_id = p_salon_id
    and (pr.from_ts is null or i.issued_at >= pr.from_ts)
    and (pr.to_ts   is null or i.issued_at <  pr.to_ts)
    and (
      p_invoice_type is null
      or i.invoice_type = p_invoice_type::public.pos_invoice_type
    )
    and (
      p_location_id is null
      or sess.location_id = p_location_id
    )
    and (
      p_payment_method is null
      or exists (
        select 1
        from public.pos_payments pp
        where pp.sale_id = i.sale_id
          and pp.salon_id = i.salon_id
          and pp.method = p_payment_method::public.pos_payment_method
      )
    )
    and (
      pr.search_like is null
      or i.full_number ilike pr.search_like
      or (i.recipient_data ->> 'name') ilike pr.search_like
      or c.full_name ilike pr.search_like
    );
$$;

comment on function app.salon_filtered_invoices(uuid, date, date, uuid, text, text, text) is
  'Uso interno (sub-6): conjunto de pos_invoices del salón que casan con los filtros de rango/sede/tipo/método/búsqueda. Método por EXISTS (sin duplicar facturas). SECURITY INVOKER: aislamiento por RLS. Base común de salon_invoices_filtered y salon_invoices_totals.';

-- ==============================================================================
-- 1. salon_invoices_filtered — LISTA de facturas filtradas (la que pinta la tabla)
--    Ordena por fecha de expedición y, a igualdad, por nº correlativo (ambos desc,
--    orden estable) y acota a las `p_limit` más recientes. El histórico completo se
--    descarga con «Exportar libro» (GET /api/facturacion/export).
-- ==============================================================================
create or replace function public.salon_invoices_filtered(
  p_salon_id       uuid,
  p_from           date    default null,
  p_to             date    default null,
  p_location_id    uuid    default null,
  p_invoice_type   text    default null,
  p_payment_method text    default null,
  p_search         text    default null,
  p_limit          integer default 100
)
returns table (
  id                 uuid,
  full_number        text,
  invoice_type       public.pos_invoice_type,
  issued_at          timestamptz,
  recipient_data     jsonb,
  taxable_base_cents integer,
  tax_cents          integer,
  total_cents        integer,
  currency           text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    f.id,
    f.full_number,
    f.invoice_type,
    f.issued_at,
    f.recipient_data,
    f.taxable_base_cents,
    f.tax_cents,
    f.total_cents,
    f.currency
  from app.salon_filtered_invoices(
    p_salon_id, p_from, p_to, p_location_id, p_invoice_type, p_payment_method, p_search
  ) f
  order by f.issued_at desc, f.sequential_number desc
  limit greatest(coalesce(p_limit, 100), 0);
$$;

comment on function public.salon_invoices_filtered(uuid, date, date, uuid, text, text, text, integer) is
  'Libro de facturas del salón filtrado en servidor (rango de fechas local con p_to inclusivo, sede, tipo F1/F2, método de pago, búsqueda por número/cliente). Ordenado por fecha y nº correlativo desc, acotado a p_limit. SOLO LECTURA, SECURITY INVOKER (aislamiento por RLS).';

-- ==============================================================================
-- 2. salon_invoices_totals — TOTALES del periodo FILTRADO (una fila)
--    Agrega el MISMO conjunto que la lista (sin el limit): nº de facturas y sumas
--    de base imponible, IVA y total. Siempre devuelve UNA fila (a cero si vacío).
--    Sumas en céntimos como bigint (no float, no desbordan).
-- ==============================================================================
create or replace function public.salon_invoices_totals(
  p_salon_id       uuid,
  p_from           date default null,
  p_to             date default null,
  p_location_id    uuid default null,
  p_invoice_type   text default null,
  p_payment_method text default null,
  p_search         text default null
)
returns table (
  invoice_count      bigint,  -- nº de facturas del periodo filtrado
  taxable_base_cents bigint,  -- Σ base imponible (céntimos)
  tax_cents          bigint,  -- Σ IVA (céntimos)
  total_cents        bigint   -- Σ total (céntimos)
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::bigint,
    coalesce(sum(f.taxable_base_cents), 0)::bigint,
    coalesce(sum(f.tax_cents), 0)::bigint,
    coalesce(sum(f.total_cents), 0)::bigint
  from app.salon_filtered_invoices(
    p_salon_id, p_from, p_to, p_location_id, p_invoice_type, p_payment_method, p_search
  ) f;
$$;

comment on function public.salon_invoices_totals(uuid, date, date, uuid, text, text, text) is
  'Totales del periodo filtrado del libro de facturas: nº de facturas y Σ de base imponible, IVA y total (céntimos, bigint). Mismos filtros y mismo conjunto que salon_invoices_filtered. SOLO LECTURA, SECURITY INVOKER.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Permisos: solo usuarios autenticados (panel con sesión) y service_role. Nunca
-- anon/public. El helper interno se concede igual (las funciones públicas, también
-- invoker, lo llaman con los privilegios del usuario).
-- ──────────────────────────────────────────────────────────────────────────────
revoke all on function app.salon_filtered_invoices(uuid, date, date, uuid, text, text, text)              from public;
revoke all on function public.salon_invoices_filtered(uuid, date, date, uuid, text, text, text, integer)  from public;
revoke all on function public.salon_invoices_totals(uuid, date, date, uuid, text, text, text)             from public;

grant execute on function app.salon_filtered_invoices(uuid, date, date, uuid, text, text, text)             to authenticated, service_role;
grant execute on function public.salon_invoices_filtered(uuid, date, date, uuid, text, text, text, integer) to authenticated, service_role;
grant execute on function public.salon_invoices_totals(uuid, date, date, uuid, text, text, text)            to authenticated, service_role;

commit;
