-- =============================================================================
-- salon-os — Lo que falta para rellenar el impreso oficial del Colegio
--
-- ── QUÉ ES EL IMPRESO ───────────────────────────────────────────────────────
-- La "RECETA MÉDICA PARA ASISTENCIA SANITARIA PRIVADA" del Ilustre Colegio
-- Oficial de Odontólogos y Estomatólogos. Viene con su número (28-0382304), su
-- código de barras y su QR ya impresos: los asigna el Colegio, y Kairos no
-- puede fabricarlos sin falsificar un documento.
--
-- En Biodental ese impreso se rellena A MANO. Así que lo que Kairos aporta no
-- es una receta: es una HOJA DE TRANSCRIPCIÓN con los datos en el mismo orden y
-- con las mismas palabras que el impreso, para copiarlos sin equivocarse.
--
-- Esta migración añade los tres datos que el impreso pide y no teníamos.
--
-- ── POR QUÉ SE COPIAN EN LA RECETA Y NO SE LEEN DEL PROFESIONAL ─────────────
-- El impreso pide la dirección, el correo y el teléfono del prescriptor. Son
-- datos vivos que cambian; una receta emitida hace un año tiene que reimprimirse
-- con los que llevaba, no con los de hoy. Misma razón que el número de colegiado.
-- =============================================================================

begin;

-- ── El prescriptor: su dirección ────────────────────────────────────────────
-- `email` y `phone` ya existían en professionals. Faltaba la dirección, que el
-- impreso pide junto al número de colegiado.
alter table public.professionals
  add column if not exists address text;

comment on column public.professionals.address is
  'Dirección profesional. La pide el impreso de receta del Colegio, junto al número de colegiado.';

-- ── La receta: la foto del prescriptor, completa ────────────────────────────
alter table public.prescription
  add column if not exists prescriber_address text,
  add column if not exists prescriber_email text,
  add column if not exists prescriber_phone text;

comment on column public.prescription.prescriber_address is
  'Copiado de professionals al emitir. Una receta se reimprime con los datos que tenía, no con los de hoy.';

-- ── El medicamento: unidades por envase ─────────────────────────────────────
-- El impreso lo pide literalmente: "dosis por unidad y unidades por envase".
-- `dose` cubre la dosis por unidad; esto es lo otro.
alter table public.prescription_item
  add column if not exists units_per_package text;

comment on column public.prescription_item.units_per_package is
  'Unidades que trae cada envase, p. ej. "12 comprimidos". La pide el impreso del Colegio.';

commit;
