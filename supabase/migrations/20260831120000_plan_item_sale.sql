-- =============================================================================
-- salon-os — Migración: la línea de presupuesto sabe en qué venta se cobró
--
-- ── EL EJE QUE FALTABA ──────────────────────────────────────────────────────
-- `plan_item` ya tenía el eje del TRATAMIENTO: propuesto → aceptado → en curso
-- → realizado. Le faltaba el del COBRO, que es independiente.
--
-- No es una distinción teórica. En las capturas del programa que usa Biodental
-- se ve una endodoncia en estado "Previsto" —sin hacer— y a la vez "Cobrado Sin
-- Factura" por 200 €. En una clínica se cobra antes de hacer y se hace antes de
-- cobrar según el caso, así que un único estado obligaría a mentir en uno de
-- los dos.
--
-- ── POR QUÉ UN ENLACE Y NO UNA COLUMNA DE ESTADO ────────────────────────────
-- Lo fácil sería `plan_item.estado_cobro`. Pero entonces habría que acordarse
-- de actualizarlo cada vez que la venta cambia: al cobrarla, al anularla, al
-- emitir su factura. Y el día que alguien anule un ticket desde el TPV, las
-- líneas se quedarían diciendo "cobrado" para siempre.
--
-- Guardando solo el ENLACE, el estado se deriva de la venta real (ver
-- `derivePlanItemBilling`). Anular el ticket libera sus líneas sin que nadie
-- toque nada.
--
-- ── LO QUE NO HACE ESTA MIGRACIÓN ───────────────────────────────────────────
-- No cobra parcialmente. Su programa tiene "Cobro Parcial" e "Imp. Pendiente"
-- por línea; aquí una línea está en una venta o no lo está. Es una limitación
-- consciente para no inventarse un modelo de pagos a plazos que Kairos todavía
-- no tiene — la ortodoncia ya usa el suyo (`ortho_payments`) y sería otro.
-- =============================================================================

begin;

alter table public.plan_item
  add column if not exists pos_sale_id uuid references public.pos_sales (id) on delete set null;

comment on column public.plan_item.pos_sale_id is
  'Venta del TPV que arrastra esta línea. NULL = no ha pasado por caja. El estado de cobro NO se guarda: se deriva de esta venta, para que anular un ticket libere sus líneas solo.';

-- `on delete set null` y no `cascade`: si una venta desaparece, el presupuesto
-- sigue existiendo — lo que se pierde es el cobro, no el tratamiento.

-- Para pintar el estado de cobro de un plan hay que traerse las ventas de sus
-- líneas. Sin índice, eso es un recorrido de la tabla por cada plan que se abra.
create index if not exists plan_item_sale_idx
  on public.plan_item (pos_sale_id)
  where pos_sale_id is not null;

-- Y para la pregunta inversa, que es la del TPV: qué líneas arrastra esta venta.
create index if not exists plan_item_salon_sale_idx
  on public.plan_item (salon_id, pos_sale_id)
  where pos_sale_id is not null;

commit;
