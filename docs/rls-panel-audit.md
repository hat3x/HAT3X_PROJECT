# Auditoría RLS — Tablas del panel (multi-tenant)

> Sub-tarea **sub-2** · Vertical webs-apps · Rol: Database Optimizer
> Fecha: 2026-07-13 · Rama: `hat3x/HAT3X-014`
> Alcance: `locations`, `services`, `professionals`, `professional_services`,
> `professional_schedules`, `schedule_exceptions`, `salons`.

## Veredicto

**Cobertura completa. No se requiere ningún ajuste de RLS.** Todas las tablas
del alcance tienen RLS activado (deny-by-default), escritura restringida a
`owner`/`manager` del salón y aislamiento multi-tenant garantizado por `salon_id`
tanto a nivel de política como de integridad referencial.

## Modelo de aislamiento

El tenant es el **salón**. La pertenencia se resuelve vía `public.salon_members`
a través de dos funciones helper `SECURITY DEFINER` / `STABLE` en el esquema `app`
(evitan recursión RLS sobre `salon_members` y se evalúan una vez por consulta):

| Función | Uso en políticas |
|---|---|
| `app.user_salon_ids()` | lectura: `salon_id in (select app.user_salon_ids())` |
| `app.has_salon_role(salon_id, roles[])` | escritura: `has_salon_role(salon_id, array['owner','manager'])` |

Ambas revocan `execute` a `anon`/`public` y solo lo conceden a `authenticated`.

### Dos capas de aislamiento por `salon_id`

1. **RLS** — cada política filtra/valida por `salon_id` (fila del propio tenant).
2. **FKs compuestas `(id, salon_id)`** (migración `20260712120000_tenant_integrity.sql`
   y FKs de `professionals`/`schedules`/`locations`) — la base de datos impide que
   una fila referencie entidades de otro tenant aunque se conozcan UUIDs ajenos.
   La RLS por sí sola no cubre esto; las FKs compuestas sí.

## Matriz de políticas verificada

| Tabla | RLS | SELECT | INSERT | UPDATE | DELETE | Migración |
|---|---|---|---|---|---|---|
| `salons` | ✅ | miembro | authenticated¹ | **owner** | **owner** | `..100100_rls_policies` |
| `services` | ✅ | miembro | owner/manager | owner/manager | owner/manager | `..100100_rls_policies` |
| `professionals` | ✅ | miembro | owner/manager | owner/manager | owner/manager | `..100100_rls_policies` |
| `professional_services` | ✅ | miembro | owner/manager | —² | owner/manager | `..100100_rls_policies` |
| `locations` | ✅ | miembro | owner/manager | owner/manager | owner/manager | `..140000_locations` |
| `professional_schedules` | ✅ | miembro | owner/manager | owner/manager | owner/manager | `..130000_availability` |
| `schedule_exceptions` | ✅ | miembro | owner/manager | owner/manager | owner/manager | `..130000_availability` |

- «miembro» = `salon_id in (select app.user_salon_ids())`.
- «owner/manager» = `app.has_salon_role(salon_id, array['owner','manager'])` en
  `USING` y `WITH CHECK` (las de UPDATE aplican ambas cláusulas).

### Notas de diseño (no son huecos de cobertura)

1. **`salons`** — el INSERT es abierto a cualquier `authenticated` (crea su propio
   salón y un trigger `SECURITY DEFINER` lo registra como `owner`). UPDATE/DELETE
   quedan **solo para `owner`**, no `manager`: reconfigurar/eliminar el tenant raíz
   es más sensible que gestionar catálogo o plantilla. Decisión deliberada y más
   restrictiva; para la operativa del panel (catálogo, staff, sedes, horarios) tanto
   `owner` como `manager` escriben, que es lo que exige la tarea.
2. **`professional_services`** — tabla puente pura (PK compuesta
   `(professional_id, service_id)` + `salon_id` + `created_at`, sin columnas mutables
   no-clave). Las únicas escrituras con sentido son INSERT/DELETE (vincular/desvincular);
   la ausencia de política UPDATE es correcta y, con deny-by-default, cualquier UPDATE
   queda bloqueado por diseño.

## El flujo de reservas no se ve afectado

La reserva pública (`src/lib/booking/server.ts`) usa **`createAdminClient()`**
(service role, `SUPABASE_SERVICE_ROLE_KEY`), que **bypassa RLS por completo** y valida
el salón por `slug` en el Route Handler. Por tanto:

- El panel (dashboard) usa el cliente **autenticado** (`src/lib/supabase/server.ts`)
  → RLS aplica → aislamiento owner/manager garantizado.
- La reserva pública usa el cliente **admin** → RLS no aplica → estas políticas no
  pueden romper el flujo de reservas.

Confirmado que ninguna migración posterior (`appointment_blocks`, `reminder_*`,
`history_triggers`) altera o elimina políticas de las 7 tablas del alcance.

## Recomendación operativa

Al añadir las pantallas del panel para gestionar sedes/servicios/profesionales/
horarios (aún no existen server actions de escritura para estas tablas, solo para
`appointments` y `customers`), **usar el cliente autenticado de servidor**, nunca el
admin, para que estas políticas RLS surtan efecto. Reservar `createAdminClient()`
exclusivamente para la reserva pública.
