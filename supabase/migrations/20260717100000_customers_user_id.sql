-- =============================================================================
-- salon-os — Migración: customers += user_id (enlace ficha ↔ cuenta) — parte A
--
-- Prepara FASE 3 del roadmap (re-apuntar las apps cliente/staff a la BD de Salón
-- OS; ver docs/roadmap-productizacion.md): una ficha de cliente puede quedar
-- ENLAZADA a una cuenta de auth (auth.users) cuando esa persona se registra en
-- la app de cliente. Reutiliza el patrón ya probado en professionals.user_id
-- (nullable · references auth.users · on delete set null · índice parcial).
--
-- Contenido:
--   1. customers += user_id uuid null references auth.users(id) on delete set null.
--   2. Índice ÚNICO PARCIAL (salon_id, user_id) where user_id is not null.
--
-- Por qué user_id es NULLABLE (a propósito, no un descuido):
--   La MAYORÍA de las fichas NO tienen cuenta. Una ficha nace sin usuario cuando
--   la crea el salón/recepcionista (alta manual en el dashboard) o la
--   recepcionista IA (nombre + teléfono en la llamada). El enlace a auth.users
--   solo se rellena si —y cuando— esa persona se crea una cuenta en la app de
--   cliente y se vincula a su ficha (FASE 3: identidad-por-teléfono). Forzar
--   NOT NULL rompería casi todo el alta de clientes. Espejo exacto de la decisión
--   de professionals.user_id (profesional con o sin cuenta propia).
--
-- Por qué el ÚNICO es (salon_id, user_id) y NO (user_id) global:
--   Una persona puede ser cliente de VARIOS salones (Salón OS es multi-tenant y
--   multi-marca): tendrá UNA ficha POR salón, todas con el mismo user_id. Un
--   único global sobre user_id lo impediría. Acotarlo por salón permite "misma
--   persona en N salones" y a la vez prohíbe DOS fichas del mismo user_id DENTRO
--   de un mismo salón (un cliente = una ficha por salón). Mismo criterio que el
--   email único por salón (idx_customers_salon_email) y coherente con el
--   aislamiento multi-tenant (salon_id como columna líder, como todo el esquema).
--
-- Parcial (where user_id is not null): las MUCHAS fichas sin cuenta (user_id NULL)
--   quedan fuera del único — pueden coexistir sin límite. SQL ya trata cada NULL
--   como distinto, pero el índice parcial lo deja explícito y no indexa esas filas.
--
-- Aditiva y sin backfill: columna nullable sin DEFAULT ⇒ las filas existentes
--   quedan con user_id NULL, que es justo su estado correcto (aún sin cuenta).
--
-- FK a auth.users(id) de UNA sola columna (auth.users NO es tabla de tenant, no
--   tiene salon_id) ⇒ on delete set null "plano" (sin lista de columnas): si se
--   borra la cuenta de auth, la ficha del cliente SOBREVIVE y solo se desvincula.
--   Igual que professionals.user_id y appointments.created_by.
--
-- Nota de alcance: esta es la "parte A" (esquema). La lógica/UI de enlace y el
-- índice único por teléfono para dedup (salon_id, phone) van en fases posteriores
-- del roadmap; no se incluyen aquí a propósito.
-- =============================================================================

-- ------------------------------------------------------------------------------
-- 1. customers += user_id — enlace OPCIONAL ficha de cliente ↔ cuenta de auth
-- ------------------------------------------------------------------------------
alter table public.customers
  add column user_id uuid references auth.users (id) on delete set null;

comment on column public.customers.user_id is
  'Cuenta de auth (auth.users) enlazada a la ficha del cliente (app de cliente). NULLABLE A PROPÓSITO: la mayoría de clientes NO tienen cuenta (alta por el salón o la recepcionista IA); se rellena solo al registrarse el cliente en la app y vincularse a su ficha. On delete set null: al borrar la cuenta, la ficha sobrevive y se desvincula.';

-- ------------------------------------------------------------------------------
-- 2. Único parcial (salon_id, user_id) — un cliente = una ficha POR salón
--
-- Permite que la MISMA persona (mismo user_id) sea cliente de varios salones
-- (una ficha por salón) e impide DOS fichas con el mismo user_id en un mismo
-- salón. Parcial where user_id is not null ⇒ no restringe las fichas sin cuenta.
-- ------------------------------------------------------------------------------
create unique index idx_customers_salon_user
  on public.customers (salon_id, user_id)
  where user_id is not null;

comment on index public.idx_customers_salon_user is
  'Una única ficha por (salón, cuenta de auth): la misma persona puede ser cliente de varios salones, pero no tener dos fichas con el mismo user_id en un mismo salón. Parcial (user_id not null): las fichas sin cuenta quedan fuera y pueden coexistir sin límite.';
