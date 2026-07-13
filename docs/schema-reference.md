# salon-os — Nota de referencia del esquema (sub-1)

> **Propósito.** Documentar el esquema real tal como está definido en
> `supabase/migrations/` y `src/types/database.ts`, para poder escribir nuevas
> migraciones sin romper las invariantes existentes. Auditoría de solo lectura;
> ninguna migración se ha modificado.
>
> Fuente: 10 migraciones (`20260711100000` … `20260713160000`) + tipos generados
> a mano en `src/types/database.ts`. Estado: **proyecto en desarrollo, sin datos
> de producción** (las migraciones de evolución añaden columnas NOT NULL sin
> fase de backfill; ver `locations`, `services_phase_duration`).

---

## 1. Convenciones transversales (patrones que TODA migración nueva debe respetar)

1. **Tenant raíz = `salons`.** Toda tabla de dominio lleva `salon_id uuid not null`
   con `references public.salons(id) on delete cascade` y su índice
   `idx_<tabla>_salon_id`. El aislamiento entre salones se garantiza por RLS.

2. **PK = `uuid default gen_random_uuid()`** (extensión `pgcrypto`), salvo tablas
   de historial de solo-append que usan `bigint generated always as identity`
   (`appointment_history`, `customer_history`).

3. **Integridad de tenant vía FK compuesta.** Las referencias entre entidades de
   dominio NO son `fk_id → tabla(id)` a secas: son
   **`(fk_id, salon_id) → tabla(id, salon_id)`**. Esto impide a nivel de motor
   que una fila mezcle entidades de distintos salones aunque se conozcan UUIDs
   ajenos (la RLS valida el `salon_id` de la fila, no el de sus FKs).
   Para que una tabla pueda ser referenciada así necesita un
   **`unique (id, salon_id)`** explícito (`<tabla>_id_salon_key` /
   `<tabla>_id_salon_id_key`), aunque `id` ya sea PK.
   Tablas con esa clave de apoyo: `customers`, `professionals`, `services`,
   `appointments`, `locations`.

4. **`updated_at` automático.** Toda tabla con `updated_at` tiene un trigger
   `trg_<tabla>_updated_at BEFORE UPDATE` que ejecuta `app.set_updated_at()`
   (`security invoker`, `set search_path = ''`). Las tablas de historial y
   `appointment_blocks` NO tienen `updated_at` (son inmutables / regeneradas).

5. **Helpers en esquema `app`.** Todo helper/trigger-function vive en el esquema
   `app` (no expuesto por PostgREST), es `SECURITY DEFINER` (excepto
   `set_updated_at`, que es invoker) y fija `set search_path = ''` — por lo que
   **toda referencia dentro de la función va cualificada con `public.`**.

6. **Dinero como enteros.** `price_cents` / `amount_cents` `integer not null
   default 0 check (… >= 0)`; `currency char(3) not null default 'EUR'`.

7. **Snapshots de precio/nombre.** Las citas y visitas guardan copia del precio
   (`appointments.price_cents`) y del nombre de servicio (`visits.service_name`)
   porque el catálogo puede cambiar o borrarse después.

8. **Estilo de migración.** SQL en minúsculas (las migraciones de evolución
   `services_phase_duration` y `appointment_blocks` usan mayúsculas y `BEGIN/
   COMMIT` explícito — ambos estilos conviven). Cambios multi-paso van dentro de
   `BEGIN; … COMMIT;`. Nombres de constraint se **preservan** al recrearlos
   (importa para PostgREST y para los tipos generados a mano).

---

## 2. Tablas (13 en `public`)

| Tabla | PK | Clave `(id,salon_id)` | RLS | Notas |
|---|---|---|---|---|
| `salons` | `id` uuid | — (es la raíz) | sí | tenant raíz. `slug` unique + regex kebab. `settings jsonb`. |
| `salon_members` | `id` uuid | — | sí | `unique(salon_id,user_id)`. FK `user_id→auth.users`. **Fuente de verdad del RLS.** |
| `locations` | `id` uuid | `locations_id_salon_id_key` | sí | sedes físicas. `unique(salon_id,slug)`. |
| `services` | `id` uuid | `services_id_salon_key` | sí | `unique(salon_id,name)`. Duración por fases (§4). |
| `professionals` | `id` uuid | `professionals_id_salon_key` | sí | `location_id` NOT NULL (FK compuesta a `locations`). `user_id` opcional. `specialties text[]`. `color` regex `#rrggbb`. |
| `professional_services` | `(professional_id, service_id)` | — | sí | N:M profesional↔servicio. Lleva `salon_id`. FKs compuestas. |
| `customers` | `id` uuid | `customers_id_salon_key` | sí | NO son usuarios de auth. email único por salón (parcial, `lower(email)`). |
| `appointments` | `id` uuid | `appointments_id_salon_key` | sí | núcleo de agenda. `check(ends_at>starts_at)`. Snapshot de precio. |
| `visits` | `id` uuid | — | sí | histórico de negocio. `appointment_id` **unique** (1:1 con cita). Casi inmutable (sin UPDATE en RLS). |
| `professional_schedules` | `id` uuid | — | sí | horario semanal. `weekday 0..6` (0=domingo, = JS `getUTCDay()`). `time` en zona del salón. |
| `schedule_exceptions` | `id` uuid | — | sí | `unique(professional_id,exception_date)`. día libre / horario especial. |
| `appointment_blocks` | `id` uuid | — | sí (solo SELECT) | rangos ocupados reales (§5). Gestionada por trigger. |
| `appointment_history` | `id` bigint identity | — | sí (solo SELECT) | auditoría append-only. `appointment_id` **sin FK** (sobrevive al DELETE). |
| `customer_history` | `id` bigint identity | — | sí (solo SELECT owner/mgr) | auditoría RGPD. action ∈ UPDATE/DELETE. |
| `whatsapp_reminder_queue` | `id` uuid | — | sí | cola de recordatorios. `unique(appointment_id,reminder_type)`. |

---

## 3. Mapa de claves foráneas (FKs)

### 3.1 FKs simples (una columna)

| Origen | Columna | Destino | ON DELETE |
|---|---|---|---|
| `salon_members` | `salon_id` | `salons(id)` | cascade |
| `salon_members` | `user_id` | `auth.users(id)` | cascade |
| `locations` | `salon_id` | `salons(id)` | cascade |
| `services` | `salon_id` | `salons(id)` | cascade |
| `professionals` | `salon_id` | `salons(id)` | cascade |
| `professionals` | `user_id` | `auth.users(id)` | set null |
| `professional_services` | `salon_id` | `salons(id)` | cascade |
| `customers` | `salon_id` | `salons(id)` | cascade |
| `appointments` | `salon_id` | `salons(id)` | cascade |
| `appointments` | `created_by` | `auth.users(id)` | set null |
| `visits` | `salon_id` | `salons(id)` | cascade |
| `appointment_blocks` | `appointment_id` | `appointments(id)` | cascade |
| `appointment_blocks` | `professional_id` | `professionals(id)` | cascade |
| `appointment_blocks` | `salon_id` | `salons(id)` | cascade |
| `whatsapp_reminder_queue` | `salon_id` | `salons(id)` | cascade |
| `whatsapp_reminder_queue` | `appointment_id` | `appointments(id)` | cascade |

> `appointment_blocks` usa FKs **simples** a propósito (tabla interna gestionada
> por trigger, no por el cliente); no replica el patrón compuesto.

### 3.2 FKs compuestas `(fk_id, salon_id) → tabla(id, salon_id)` — anti cross-tenant

| Origen | Columnas | Destino | ON DELETE |
|---|---|---|---|
| `professionals` | `(location_id, salon_id)` | `locations(id,salon_id)` | cascade |
| `professional_services` | `(professional_id, salon_id)` | `professionals(id,salon_id)` | cascade |
| `professional_services` | `(service_id, salon_id)` | `services(id,salon_id)` | cascade |
| `professional_schedules` | `(professional_id, salon_id)` | `professionals(id,salon_id)` | cascade |
| `schedule_exceptions` | `(professional_id, salon_id)` | `professionals(id,salon_id)` | cascade |
| `appointments` | `(customer_id, salon_id)` | `customers(id,salon_id)` | restrict |
| `appointments` | `(professional_id, salon_id)` | `professionals(id,salon_id)` | restrict |
| `appointments` | `(service_id, salon_id)` | `services(id,salon_id)` | restrict |
| `visits` | `(appointment_id, salon_id)` | `appointments(id,salon_id)` | **set null (appointment_id)** |
| `visits` | `(customer_id, salon_id)` | `customers(id,salon_id)` | restrict |
| `visits` | `(professional_id, salon_id)` | `professionals(id,salon_id)` | **set null (professional_id)** |
| `visits` | `(service_id, salon_id)` | `services(id,salon_id)` | **set null (service_id)** |

> **`ON DELETE SET NULL (column_list)`** (PostgreSQL 15+) anula SOLO la columna de
> la entidad, nunca `salon_id`. Requiere que la columna anulada sea nullable
> (`visits.appointment_id/professional_id/service_id` lo son; `customer_id` no,
> por eso es `restrict`).
>
> **Semántica de borrado de un salón activo:** las FKs `restrict` de
> `appointments`/`visits` bloquean el `DELETE` de entidades con actividad. El
> flujo recomendado es **soft-delete**: `update salons set active = false`.

---

## 4. `services`: duración por fases (migración `services_phase_duration`)

La duración se descompone en 3 fases; las 2 columnas de duración total son
**generadas** (no insertar/actualizar):

| Columna | Tipo | Regla |
|---|---|---|
| `application_min` | integer NOT NULL | `>= 1`. Obligatorio (sin default tras la migración). Fase activa 1. |
| `exposure_min` | integer NOT NULL default 0 | `>= 0`. Procesado sin intervención (tinte actuando). |
| `post_exposure_min` | integer NOT NULL default 0 | `>= 0`. Aclarado/secado. Fase activa 2. |
| `duration_minutes_total` | integer **GENERATED STORED** | `= application_min + exposure_min + post_exposure_min`. |
| `duration_minutes` | integer **GENERATED STORED** | alias del total (compat. código previo). `check between 5 and 600`. |

Constraint extra `services_duration_total_check`: la suma de las 3 fases ∈ [5,600].

Helpers TS espejo en `database.ts`: `getServicePhases(service)` y
`getAppointmentPhases(appointment, service)` proyectan las fases a minutos
relativos y a timestamps absolutos. Cadena sin solape:
`[0, app) → [app, app+exp) → [app+exp, app+exp+post)`.

---

## 5. Solapamiento de agenda: `appointment_blocks` (patrón clave)

**Evolución importante.** La migración inicial ponía una exclusion constraint
directamente en `appointments` (`appointments_no_overlap`, GIST sobre
`tstzrange(starts_at, ends_at)` filtrada por status activo). La migración
`appointment_blocks` la **elimina** y traslada la lógica a una tabla auxiliar,
porque durante la fase `exposure` el profesional está libre y puede atender a
otro cliente.

- `appointment_blocks` guarda **solo los tramos realmente ocupados**:
  `application` (`[starts_at, starts_at+app)`) y, si `post_exposure_min > 0`,
  `post_exposure` (`[starts_at+app+exp, ends_at)`). El tramo `exposure` NO genera
  bloque.
- Anti-solape: `EXCLUDE USING GIST (professional_id WITH =, salon_id WITH =,
  occupied_range WITH &&)` → un profesional no puede solapar dos tramos ocupados.
- Sincronización automática: trigger `trg_appointment_blocks_sync`
  (`AFTER INSERT/UPDATE/DELETE` en `appointments`) → `app.sync_appointment_blocks()`
  borra y regenera los bloques de la cita. Los bloques **nunca** se escriben desde
  el cliente (RLS de `appointment_blocks` solo permite SELECT).
- Rangos `'[)'` (semiabiertos): tramos contiguos son adyacentes, no solapados.

> **Al escribir migraciones que toquen la agenda:** el anti-solape vive en
> `appointment_blocks`, NO en `appointments`. Cualquier cambio en las fases del
> servicio o en `starts_at/ends_at` debe seguir pasando por el trigger de sync.

---

## 6. RLS — modelo y funciones helper

### 6.1 Funciones (esquema `app`, `stable security definer`, `search_path=''`)

- **`app.user_salon_ids() → setof uuid`**
  Salones a los que pertenece el usuario:
  `select salon_id from public.salon_members where user_id = (select auth.uid())`.
  Usada en políticas de lectura/escritura de personal:
  `salon_id in (select app.user_salon_ids())`.

- **`app.has_salon_role(_salon_id uuid, _roles public.member_role[]) → boolean`**
  `exists` de una membresía del usuario en `_salon_id` con rol ∈ `_roles`.
  Usada para operaciones privilegiadas (típicamente `array['owner','manager']`).

Ambas son `SECURITY DEFINER` para **evitar recursión RLS** sobre `salon_members`,
y `STABLE` para que el planner las evalúe una vez por consulta (patrón
`(select …)` → initPlan). `execute` revocado a `anon/public`, concedido a
`authenticated`. (Las RPC de recordatorios se conceden solo a `service_role`.)

### 6.2 Matriz de permisos por tabla

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `salons` | miembro (`id ∈ user_salon_ids`) | cualquier autenticado (`with check true`) → trigger lo hace owner | owner | owner |
| `salon_members` | miembro | owner/manager | owner/manager | owner |
| `services` | miembro | owner/manager | owner/manager | owner/manager |
| `professionals` | miembro | owner/manager | owner/manager | owner/manager |
| `professional_services` | miembro | owner/manager | — | owner/manager |
| `locations` | miembro | owner/manager | owner/manager | owner/manager |
| `professional_schedules` | miembro | owner/manager | owner/manager | owner/manager |
| `schedule_exceptions` | miembro | owner/manager | owner/manager | owner/manager |
| `customers` | miembro | miembro | miembro | owner/manager |
| `appointments` | miembro | miembro | miembro | owner/manager |
| `visits` | miembro | miembro (walk-ins) | — (inmutable) | owner |
| `appointment_blocks` | miembro | — (trigger) | — | — |
| `appointment_history` | miembro | — (trigger) | — | — |
| `customer_history` | **owner/manager** | — (trigger) | — | — |
| `whatsapp_reminder_queue` | miembro | — (trigger/service_role) | owner/manager (marcar `skipped`) | — |

> Patrón: **personal operativo** (customers, appointments, visits-insert) →
> cualquier miembro; **configuración y borrados sensibles** → owner/manager u
> owner. La reserva pública y el cron usan `service_role` y **bypasan RLS**.

---

## 7. Triggers (todos en esquema `app`, resumen)

| Trigger | Tabla / evento | Función | Efecto |
|---|---|---|---|
| `trg_<tabla>_updated_at` | BEFORE UPDATE (8 tablas) | `set_updated_at()` | `new.updated_at = now()` |
| `trg_salons_register_owner` | AFTER INSERT salons | `register_salon_owner()` | inserta al creador como `owner` en `salon_members` (si hay `auth.uid()`) |
| `trg_appointments_history` | AFTER I/U/D appointments | `log_appointment_change()` | append en `appointment_history` (UPDATE solo si hay cambio real) |
| `trg_customers_history` | AFTER U/D customers | `log_customer_change()` | append en `customer_history` (RGPD) |
| `trg_appointments_create_visit` | AFTER UPDATE OF status | `create_visit_on_completion()` | al pasar a `completed` crea `visit` (idempotente por `on conflict(appointment_id)`) |
| `trg_appointment_blocks_sync` | AFTER I/U/D appointments | `sync_appointment_blocks()` | regenera `appointment_blocks` (§5) |
| `trg_appointment_enqueue_confirmation` | AFTER INSERT appointments (status activo) | `enqueue_confirmation_reminder()` | encola confirmación WhatsApp (o `skipped` si sin teléfono) |
| `trg_reminder_queue_updated_at` | BEFORE UPDATE reminder_queue | `set_updated_at()` | updated_at |

> **Orden a tener en cuenta** en `appointments`: un mismo INSERT dispara auditoría,
> sync de bloques y encolado de confirmación. Un UPDATE de `status→completed`
> dispara además la auto-visita. Cualquier nueva migración con triggers en
> `appointments` debe considerar la interacción con estos.

---

## 8. Enums, RPCs y tipo compuesto

- **Enums `public`:** `member_role (owner|manager|staff)`,
  `appointment_status (pending|confirmed|completed|cancelled|no_show)`,
  `reminder_type (confirmacion|recordatorio_24h|recordatorio_2h|post_visita)`,
  `reminder_status (pending|sending|sent|failed|skipped)`.
- **Tipo compuesto `app.appointment_reminder_details`** (denormalizado de cita).
- **RPCs `service_role`:** `app.get_appointments_for_reminder(min,max)` y
  `app.get_appointment_details(id)` — usadas por la Edge Function
  `process-reminders`. Ambas `stable security definer`, execute revocado a
  anon/authenticated/public.

---

## 9. Índices notables (rendimiento)

- **FK-indexadas:** todo `salon_id` y toda columna FK tiene su índice.
- **Parciales:** `idx_services_salon_active (salon_id,name) where active`;
  `idx_professionals_user_id where user_id is not null`;
  `idx_customers_salon_email (salon_id,lower(email)) where email is not null` (unique);
  `idx_appointments_salon_status_starts … where status in ('pending','confirmed')`;
  `idx_reminder_queue_pending (scheduled_for) where status='pending'`;
  `idx_reminder_queue_retry where status='failed'`.
- **Compuestos para agenda:** `idx_appointments_salon_starts (salon_id, starts_at desc)`,
  `idx_appointments_professional_starts (professional_id, starts_at)`.
- **GIST:** `appointment_blocks_no_overlap` (exclusion) +
  `idx_appointment_blocks_professional_range (professional_id, occupied_range)`
  para consultas de disponibilidad por rango.
- **Historial:** `(entidad_id, changed_at desc)` y `(salon_id, changed_at desc)`.

---

## 10. Checklist para la próxima migración

- [ ] ¿La tabla nueva lleva `salon_id not null references public.salons(id) on delete cascade` + índice?
- [ ] ¿Las FKs a entidades de dominio son **compuestas** `(fk_id, salon_id)`? ¿La tabla destino tiene su `unique(id, salon_id)`?
- [ ] ¿Habilité RLS (`enable row level security`) y creé políticas con `app.user_salon_ids()` / `app.has_salon_role()`?
- [ ] ¿`updated_at` + trigger `set_updated_at()` si la tabla es mutable?
- [ ] ¿Funciones nuevas en esquema `app`, `security definer`, `set search_path=''`, con referencias cualificadas `public.`, y `grant/revoke execute` explícitos?
- [ ] ¿Toco la agenda? Recordar que el anti-solape vive en `appointment_blocks` vía trigger, no en `appointments`.
- [ ] ¿Preservo nombres de constraint al recrearlos (PostgREST + tipos a mano)?
- [ ] ¿Actualizar `src/types/database.ts` a mano (o regenerar con `supabase gen types`) tras el cambio?
