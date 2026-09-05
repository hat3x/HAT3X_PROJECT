-- =============================================================================
-- salon-os — Migración: ELIMINAR Verifactu (facturación simple editable)
--
-- Contexto: la normativa Veri*factu aún NO es obligatoria para este negocio. Se
-- retira toda la maquinaria de cumplimiento (cadena de huella + inmutabilidad)
-- para que las facturas/tickets sean registros NORMALES: consultables, editables
-- y BORRABLES. La numeración por serie, el desglose de IVA, los totales y los
-- snapshots fiscales (emisor/receptor) se CONSERVAN — eso es facturación básica.
--
-- Cuando Veri*factu sea obligatorio, se REIMPLEMENTA (nueva migración que vuelva a
-- añadir columnas de huella, el trigger de inmutabilidad y el encadenamiento).
--
-- Qué elimina esta migración:
--   · Trigger de inmutabilidad `trg_pos_invoices_immutable` + su función.
--   · Cadena de huella: columnas current_hash / previous_hash / hash_algorithm y
--     sus constraints (hex, unicidad de huella, FK de encadenamiento).
--   · Añade políticas RLS de UPDATE y DELETE (miembros del salón) — antes ausentes
--     a propósito por la inmutabilidad.
--
-- Idempotente (IF EXISTS) para poder re-ejecutarla sin romper.
-- =============================================================================

begin;

-- ── 1) Quitar la inmutabilidad (trigger + función) ──────────────────────────
drop trigger if exists trg_pos_invoices_immutable on public.pos_invoices;
drop function if exists app.prevent_pos_invoice_mutation();

-- ── 2) Deshacer la cadena de huella (constraints antes que columnas) ────────
alter table public.pos_invoices
  drop constraint if exists pos_invoices_chain_fkey,        -- FK previous_hash → current_hash
  drop constraint if exists pos_invoices_current_hash_key,  -- unique (salon_id, current_hash)
  drop constraint if exists pos_invoices_current_hash_hex,  -- check hex 64
  drop constraint if exists pos_invoices_previous_hash_hex; -- check hex 64 | null

alter table public.pos_invoices
  drop column if exists previous_hash,
  drop column if exists current_hash,
  drop column if exists hash_algorithm;

comment on table public.pos_invoices is
  'Registro de facturación (tickets y facturas completas): numeración correlativa por (salón, serie), desglose de IVA y snapshots fiscales. Editable/borrable por el personal del salón. (Verifactu retirado hasta que sea obligatorio.)';

-- ── 3) Habilitar UPDATE y DELETE por RLS (miembros del salón) ───────────────
-- Antes NO existían a propósito (inmutabilidad Verifactu). Ahora se permiten,
-- acotadas al salón del usuario (misma semántica que el INSERT). El gate de rol
-- fino (owner/manager) vive en la capa de aplicación (Server Actions).
drop policy if exists "members_update_pos_invoices" on public.pos_invoices;
create policy "members_update_pos_invoices"
  on public.pos_invoices for update to authenticated
  using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

drop policy if exists "members_delete_pos_invoices" on public.pos_invoices;
create policy "members_delete_pos_invoices"
  on public.pos_invoices for delete to authenticated
  using (salon_id in (select app.user_salon_ids()));

commit;
