# Reservas / Citas — aplazado a la sub-fase 3B-2

> **Estado:** deshabilitado en la **sub-7** de la migración a **Salon OS**.
> **Reactivación prevista:** **sub-fase 3B-2** (integración con el motor de reservas de Salon OS).

Esta carpeta conserva **verbatim** la implementación original de reservas/citas tal
como funcionaba contra el esquema de base de datos **anterior** a Salon OS. El código
se movió aquí (en lugar de borrarse) para poder re-integrarlo con el motor de reservas
de Salon OS sin reescribirlo desde cero.

## Por qué se deshabilitó

Al re-generar los tipos de Supabase contra el esquema de **Salon OS**
(`jztoyekixcziaicrnlce`), varias tablas y columnas que estas pantallas usaban
**dejaron de existir**. Como `tsconfig.app.json` type-chequea todo `src`, mantener
estos archivos activos **rompía el build** (`tsc`). En vez de degradar los tipos a
`any` o dejar pantallas que fallan en runtime al leer tablas inexistentes, se optó por:

1. **Archivar** la implementación completa aquí (excluida del build).
2. Renderizar un estado **"Próximamente"** elegante en las rutas `/book`, `/appointments`
   y `/services` (ver más abajo).

## Archivos conservados

| Archivo | Ruta original | Descripción |
|---|---|---|
| `BookAppointment.tsx` | `src/pages/BookAppointment.tsx` | Flujo de reserva multi-paso (centro → sección → servicios → profesional → fecha/hora → confirmar) con comprobación de disponibilidad y sincronización con Google Calendar. |
| `Appointments.tsx` | `src/pages/Appointments.tsx` | Listado de citas (próximas/historial) con realtime, cancelar y reprogramar. |
| `ServiceCatalog.tsx` | `src/pages/ServiceCatalog.tsx` | Catálogo de servicios por categorías (acordeón). |
| `RescheduleDialog.tsx` | `src/components/RescheduleDialog.tsx` | Diálogo de reprogramación (usado solo por `Appointments`). Su import se cambió a `./RescheduleDialog`. |

## Cómo está deshabilitado ahora (sub-7)

- Las tres rutas siguen existiendo en `src/App.tsx` (`/book`, `/appointments`, `/services`)
  y **siguen visibles en el menú** (`BottomNav`), pero ahora renderizan
  `src/pages/PlaceholderPage.tsx` con estado **"Próximamente"** (i18n `comingSoon.*`).
  Se optó por *mostrar "próximamente"* en lugar de *ocultar del menú* para no dejar la
  navegación mutilada; cambiar a "ocultar" es trivial (quitar las entradas `nav.book` y
  `nav.appointments` de `navItems` en `BottomNav.tsx`).
- Esta carpeta está **excluida del build** vía `tsconfig.app.json`:
  ```jsonc
  "exclude": ["src/pages/_deferred"]
  ```
  Al no importarse desde ninguna parte, Vite tampoco la incluye en el bundle.

## Mapa de esquema: legacy → Salon OS

Punto de partida para 3B-2. **Verificar siempre contra
`src/integrations/supabase/types.ts`** antes de reescribir.

### Tablas

| Legacy (usada por el código archivado) | Salon OS | Notas |
|---|---|---|
| `staff_members` | `professionals` | Profesionales del salón. |
| `employee_schedules` | `professional_schedules` (+ `schedule_exceptions`) | Disponibilidad y excepciones. |
| `service_categories` | *(eliminada)* | Ya no hay tabla de categorías; los `services` son planos. Rediseñar el agrupado del catálogo. |
| `appointment_services` | *(eliminada)* | Antes N servicios por cita (join). Ahora `appointments.service_id` es **un** FK. Rediseñar para multi-servicio si se requiere. |
| `locations` | `locations` (+ `salons`) | Sigue existiendo; verificar columnas. Se añadió `salons` y `salon_id`. |
| `services` | `services` | Sigue existiendo; **columnas distintas** (ver abajo). Ver también `professional_services`. |
| `appointments` | `appointments` | Sigue existiendo; **columnas muy distintas** (ver abajo). |
| `customers` | `customers` | Sigue existiendo. |

### Columnas de `appointments`

| Legacy | Salon OS | Notas |
|---|---|---|
| `start_at` | `starts_at` | Renombrada. |
| `end_at` | `ends_at` | Renombrada. |
| `staff_member_id` | `professional_id` | + FK compuesta con `salon_id`. |
| `location_id` | *(eliminada)* | La cita se ata a `salon_id` + `professional_id`. |
| `customer_notes` | `notes` | Renombrada. |
| `status` | `status` | Ahora enum `appointment_status`. |
| `estimated_total_price` | *(eliminada)* | Usar `price_cents` (entero, céntimos) + `currency`. |
| `estimated_total_duration` | *(eliminada)* | Derivar de la duración del `service`. |
| `estimated_pending_points`, `points_awarded`, `final_total_points` | *(eliminadas)* | Fidelidad ahora en `loyalty_accounts` / `points_movements` / `rewards`. |
| `reschedule_count` | *(eliminada)* | Reintroducir si se mantiene el límite de reprogramaciones (`MAX_RESCHEDULES`). |
| — | `salon_id`, `service_id`, `price_cents`, `currency`, `created_by`, `cancelled_reason` | Campos nuevos requeridos al insertar. |

### `services` (catálogo)

El código archivado usa `section`, `category_id`, `duration_min`, `base_price`,
`fixed_points`, `price_type`, `application_min`, `exposure_min`, `post_exposure_min`.
La tabla `services` de Salon OS tiene un conjunto de columnas **diferente** —
revisar `types.ts` y `professional_services` antes de rehacer catálogo y precios.

## Dependencias externas a revisar en 3B-2

- **Edge Function `gcal-sync-appointments`**: usada para `check-availability`, `create`,
  `update`, `delete` (Google Calendar). Confirmar que existe/está desplegada en el
  proyecto Salon OS (`jztoyekixcziaicrnlce`) y que su contrato sigue siendo válido.
- **Realtime**: `Appointments.tsx` se suscribe a `postgres_changes` sobre `appointments`.
- **`useCustomer`** (`src/hooks/useCustomer.ts`): resuelve el `customerId`. Verificar que
  `customers` en Salon OS expone la columna usada para enlazar con el usuario autenticado.

## Pasos para reactivar (sub-fase 3B-2)

1. Reescribir cada pantalla contra el esquema de Salon OS usando el mapa de arriba.
2. Devolver los archivos a su ruta original (o importarlos desde aquí) y **reemplazar**
   los wrappers `PlaceholderPage` de:
   - `src/pages/BookAppointment.tsx`
   - `src/pages/Appointments.tsx`
   - `src/pages/ServiceCatalog.tsx`
3. Restaurar `RescheduleDialog` (mover a `src/components/` o ajustar el import).
4. Quitar `"src/pages/_deferred"` de `exclude` en `tsconfig.app.json` (o borrar esta
   carpeta una vez migrado).
5. `npx tsc -p tsconfig.app.json --noEmit` debe pasar limpio para el área de reservas.
6. (Opcional) Retirar las claves `comingSoon.*` de `src/lib/i18n.tsx` si ya no se usan.
