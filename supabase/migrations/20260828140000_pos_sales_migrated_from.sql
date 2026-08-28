-- =============================================================================
-- salon-os — Migración: marcar las ventas que vienen de un sistema anterior
--
-- Contexto: al dar de alta un salón se puede volcar su histórico de ventas (el
-- caso que motiva esto: Espiral, 30.358 tickets de 5 años del programa de AAR).
-- Ese histórico convive en `pos_sales` con las ventas que Kairos sí ha cobrado,
-- y hasta ahora nada las distinguía salvo un texto libre en `notes`.
--
-- Por qué hace falta distinguirlas de verdad:
--
--   Desde el detalle de un ticket se puede EMITIR FACTURA. Sobre una venta
--   migrada eso consumiría un número de la serie correlativa de Kairos para una
--   operación que el salón ya facturó en su sistema anterior —factura duplicada
--   en dos series distintas, y fechada hoy para algo de hace años—. Antes del
--   primer volcado era imposible equivocarse porque no había tickets viejos;
--   ahora es un clic en una lista de decenas de miles.
--
-- `migrated_from` guarda la referencia en el sistema de origen (p. ej.
-- "AAR:ticket:217176"). NULL = venta nativa de Kairos, que es lo que son todas
-- las existentes: la columna nace nullable y sin default, así que esta migración
-- no toca ni una fila y no puede romper nada en marcha.
-- =============================================================================

begin;

alter table public.pos_sales
  add column if not exists migrated_from text;

comment on column public.pos_sales.migrated_from is
  'Referencia en el sistema de origen cuando la venta viene de un volcado histórico (p. ej. "AAR:ticket:217176"). NULL en las ventas cobradas en Kairos. Una venta migrada es historia comercial: no se le puede emitir factura, porque el documento fiscal ya lo emitió el sistema anterior.';

-- Índice parcial: solo se indexan las migradas, que son las que se filtran y las
-- que no existen en absoluto en un salón sin volcado.
create index if not exists idx_pos_sales_migrated
  on public.pos_sales (salon_id)
  where migrated_from is not null;

commit;
