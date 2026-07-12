-- =============================================================================
-- salon-os — Migración 4/4: integridad referencial multi-tenant (hardening)
--
-- Problema: las FKs de una sola columna (customer_id → customers.id, etc.)
-- permiten que una cita, visita o vínculo profesional↔servicio mezcle
-- entidades de tenants distintos si se conocen UUIDs ajenos: la RLS valida el
-- salon_id de la fila, pero no que sus FKs pertenezcan al mismo salón.
--
-- Solución: FKs compuestas (fk_id, salon_id) → tabla(id, salon_id). La propia
-- base de datos garantiza la coherencia de tenant, sin depender de la app.
--
-- Requiere PostgreSQL 15+ (Supabase actual) por ON DELETE SET NULL (col_list).
--
-- Nota operativa: el borrado de un salón con actividad puede chocar con las
-- FKs RESTRICT (semántica heredada de la migración 1, intencionada). El flujo
-- recomendado es soft-delete: update salons set active = false.
-- =============================================================================

-- ------------------------------------------------------------------------------
-- Claves únicas compuestas de apoyo. id ya es PK (el par es único de forma
-- trivial), pero Postgres exige un UNIQUE explícito para poder referenciarlo.
-- ------------------------------------------------------------------------------
alter table public.customers
  add constraint customers_id_salon_key unique (id, salon_id);

alter table public.professionals
  add constraint professionals_id_salon_key unique (id, salon_id);

alter table public.services
  add constraint services_id_salon_key unique (id, salon_id);

alter table public.appointments
  add constraint appointments_id_salon_key unique (id, salon_id);

-- ------------------------------------------------------------------------------
-- appointments — cliente, profesional y servicio deben ser del mismo salón
-- (se conservan los nombres de constraint para PostgREST y los tipos generados)
-- ------------------------------------------------------------------------------
alter table public.appointments
  drop constraint appointments_customer_id_fkey,
  drop constraint appointments_professional_id_fkey,
  drop constraint appointments_service_id_fkey,
  add constraint appointments_customer_id_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete restrict,
  add constraint appointments_professional_id_fkey
    foreign key (professional_id, salon_id)
    references public.professionals (id, salon_id) on delete restrict,
  add constraint appointments_service_id_fkey
    foreign key (service_id, salon_id)
    references public.services (id, salon_id) on delete restrict;

-- ------------------------------------------------------------------------------
-- professional_services — el vínculo N:M no puede cruzar salones
-- ------------------------------------------------------------------------------
alter table public.professional_services
  drop constraint professional_services_professional_id_fkey,
  drop constraint professional_services_service_id_fkey,
  add constraint professional_services_professional_id_fkey
    foreign key (professional_id, salon_id)
    references public.professionals (id, salon_id) on delete cascade,
  add constraint professional_services_service_id_fkey
    foreign key (service_id, salon_id)
    references public.services (id, salon_id) on delete cascade;

-- ------------------------------------------------------------------------------
-- visits — histórico coherente con el tenant. En las FKs anulables solo se
-- anula la columna de la entidad (nunca salon_id): SET NULL (column_list).
-- El UNIQUE de appointment_id (visits_appointment_id_key) se conserva: el
-- trigger de auto-visita sigue apoyándose en ON CONFLICT (appointment_id).
-- ------------------------------------------------------------------------------
alter table public.visits
  drop constraint visits_appointment_id_fkey,
  drop constraint visits_customer_id_fkey,
  drop constraint visits_professional_id_fkey,
  drop constraint visits_service_id_fkey,
  add constraint visits_appointment_id_fkey
    foreign key (appointment_id, salon_id)
    references public.appointments (id, salon_id)
    on delete set null (appointment_id),
  add constraint visits_customer_id_fkey
    foreign key (customer_id, salon_id)
    references public.customers (id, salon_id) on delete restrict,
  add constraint visits_professional_id_fkey
    foreign key (professional_id, salon_id)
    references public.professionals (id, salon_id)
    on delete set null (professional_id),
  add constraint visits_service_id_fkey
    foreign key (service_id, salon_id)
    references public.services (id, salon_id)
    on delete set null (service_id);
