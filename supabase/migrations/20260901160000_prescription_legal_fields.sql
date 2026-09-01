-- =============================================================================
-- salon-os — Los datos que una receta privada necesita para ser dispensable
--
-- ── QUÉ FALTABA ─────────────────────────────────────────────────────────────
-- La receta se podía escribir, pero no la aceptaría ninguna farmacia. El Real
-- Decreto 1718/2010 exige unos datos mínimos, y de esos faltaban todos:
--
--   · del prescriptor  → número de colegiado y colegio
--   · del paciente     → ya estaban: `tax_id` (NIF, que para una persona es su
--                        DNI) y `birth_date`
--   · del medicamento  → principio activo, forma farmacéutica y vía
--
-- Sin ellos el papel sirve como indicación de tratamiento para la historia
-- clínica, pero en el mostrador de la farmacia no vale.
--
-- ── LO QUE ESTO NO RESUELVE ─────────────────────────────────────────────────
-- La receta ELECTRÓNICA privada necesita además homologación en el SREP, el
-- sistema del Consejo General de Colegios de Farmacéuticos. Eso es un trámite
-- con un tercero, no código, y está en el roadmap como A4. Esta migración deja
-- la receta EN PAPEL en condiciones y prepara los datos que el SREP pedirá.
--
-- ── POR QUÉ EL COLEGIADO SE COPIA EN LA RECETA ──────────────────────────────
-- `professionals.license_number` es el dato vivo; `prescription.prescriber_license`
-- es la foto del momento en que se emitió, igual que el precio de un servicio se
-- congela en la línea de venta. Una receta emitida hace dos años tiene que poder
-- reimprimirse con el número que llevaba, no con el de hoy.
-- =============================================================================

begin;

-- ── El prescriptor ──────────────────────────────────────────────────────────
alter table public.professionals
  add column if not exists license_number text,
  add column if not exists license_authority text;

comment on column public.professionals.license_number is
  'Número de colegiado. Sin él, una receta privada no es dispensable en farmacia (RD 1718/2010).';
comment on column public.professionals.license_authority is
  'Colegio profesional que lo emite, p. ej. "Ilustre Colegio de Odontólogos y Estomatólogos de la 1ª Región".';

-- ── El paciente: NO se añade nada ───────────────────────────────────────────
-- `customers` ya tiene `birth_date` y `tax_id`, y para una persona física el
-- NIF ES el DNI: es el mismo número, ya está en el formulario del paciente
-- como "NIF / CIF" y lo tienen rellenos 461 de los 1.197 pacientes.
--
-- Añadir un `national_id` aparte habría creado dos columnas para el mismo dato,
-- y el día que difirieran la receta enseñaría una y la factura la otra. La
-- receta lee `tax_id`.

-- ── La receta: foto del prescriptor ─────────────────────────────────────────
alter table public.prescription
  add column if not exists prescriber_license text,
  add column if not exists prescriber_authority text;

comment on column public.prescription.prescriber_license is
  'Número de colegiado EN EL MOMENTO de emitir. Copiado de professionals para que una reimpresión no cambie con el dato vivo.';

-- ── El medicamento ──────────────────────────────────────────────────────────
-- `medication` seguirá siendo el nombre comercial o lo que el dentista escriba.
-- Lo que la ley exige es el PRINCIPIO ACTIVO: es lo que permite a la farmacia
-- dispensar un genérico equivalente.
alter table public.prescription_item
  add column if not exists active_ingredient text,
  add column if not exists pharmaceutical_form text,
  add column if not exists route text;

comment on column public.prescription_item.active_ingredient is
  'Principio activo, p. ej. "amoxicilina". Obligatorio para que la farmacia pueda dispensar equivalente.';
comment on column public.prescription_item.pharmaceutical_form is
  'Forma farmacéutica: comprimidos, sobres, solución…';
comment on column public.prescription_item.route is
  'Vía de administración: oral, tópica…';

commit;
