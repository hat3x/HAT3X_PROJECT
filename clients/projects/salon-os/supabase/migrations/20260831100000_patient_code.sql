-- =============================================================================
-- salon-os — Migración: código corto de paciente (identificador para DICOM)
--
-- ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
-- Para que una radiografía vuelva sola a la ficha correcta, el paciente tiene
-- que viajar identificado dentro del DICOM. Lo natural sería mandar
-- `customers.id`, pero es un UUID de 36 caracteres y el equipo de la clínica
-- (ImageSensor 3.0.2.8) no lo admite:
--
--   PIDSupportChar_RIS = ^[a-zA-Z0-9_-]{3,20}$   (llega por lista de trabajo)
--   PIDSupportChar     = ^[0-9]{10,20}$          (tecleado a mano)
--
-- Lo rechazaría, y en silencio: el paciente sencillamente no aparecería. De ahí
-- este código corto, que la aplicación rellena a diez dígitos y así satisface
-- los DOS patrones a la vez (ver `formatPatientCode` en src/lib/dicom).
--
-- ── POR QUÉ UN CONTADOR POR SALÓN Y NO UNA SECUENCIA GLOBAL ─────────────────
-- Una `identity` global sería más simple, pero numeraría a los pacientes de una
-- clínica a partir de los de otra: el primer paciente de Biodental sería el
-- 4.500 porque antes se migró Espiral. Además filtraría el total de pacientes
-- de la plataforma a cualquier cliente que mirase su propio código.
--
-- El contador vive en `salons` y se incrementa con un UPDATE ... RETURNING, que
-- toma el bloqueo de esa fila: dos altas simultáneas en el MISMO salón se
-- serializan y no pueden sacar el mismo número. Y dos salones distintos no se
-- estorban, porque bloquean filas distintas.
-- =============================================================================

begin;

-- ── Contador por salón ──────────────────────────────────────────────────────
alter table public.salons
  add column if not exists patient_seq bigint not null default 0;

comment on column public.salons.patient_seq is
  'Último número de paciente entregado en este salón. Lo incrementa app.next_patient_code(); no se toca a mano.';

-- ── El código en la ficha ───────────────────────────────────────────────────
-- Nullable a propósito: se asigna con un trigger al insertar, y las fichas que
-- ya existen se rellenan más abajo. Exigirlo NOT NULL desde el principio haría
-- fallar la propia migración a mitad.
alter table public.customers
  add column if not exists patient_code bigint;

comment on column public.customers.patient_code is
  'Número corto y estable del paciente dentro de su salón. Es el PatientID que viaja en DICOM, rellenado a 10 dígitos por la aplicación. Nunca se reutiliza ni se reordena: una radiografía antigua tiene que seguir apuntando a quien apuntaba.';

-- Dos pacientes con el mismo código en el mismo salón harían imposible saber de
-- quién es una radiografía. Es LA garantía de esta migración.
create unique index if not exists customers_patient_code_unique
  on public.customers (salon_id, patient_code)
  where patient_code is not null;

-- ── Entrega del siguiente número ────────────────────────────────────────────
create or replace function app.next_patient_code(p_salon_id uuid)
returns bigint
language sql
security definer
set search_path = ''
as $$
  update public.salons
     set patient_seq = patient_seq + 1
   where id = p_salon_id
  returning patient_seq;
$$;

comment on function app.next_patient_code(uuid) is
  'Entrega el siguiente número de paciente del salón. El UPDATE bloquea la fila del salón, así que dos altas simultáneas se serializan y nunca sacan el mismo número.';

-- ── Asignación automática al dar de alta ────────────────────────────────────
create or replace function app.assign_patient_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo si no viene ya puesto: así una restauración o una migración pueden
  -- conservar los códigos originales en lugar de renumerar a todo el mundo.
  if new.patient_code is null then
    new.patient_code := app.next_patient_code(new.salon_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customers_patient_code on public.customers;
create trigger trg_customers_patient_code
  before insert on public.customers
  for each row execute function app.assign_patient_code();

-- ── Fichas que ya existían ──────────────────────────────────────────────────
-- Se numeran por orden de alta, que es el orden en que la clínica los conoció.
-- El contador de cada salón queda justo detrás del último repartido.
with numerados as (
  select id,
         salon_id,
         row_number() over (partition by salon_id order by created_at, id) as n
    from public.customers
   where patient_code is null
)
update public.customers c
   set patient_code = numerados.n
  from numerados
 where c.id = numerados.id;

update public.salons s
   set patient_seq = greatest(
         s.patient_seq,
         coalesce((select max(c.patient_code) from public.customers c where c.salon_id = s.id), 0)
       );

commit;
