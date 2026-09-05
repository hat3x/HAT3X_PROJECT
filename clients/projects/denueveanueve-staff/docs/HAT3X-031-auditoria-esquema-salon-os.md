# Auditoría de esquema — Salón OS (HAT3X-031, sub-1)

**Agente:** pm-database · **Cliente:** denueveanueve-staff · **Fecha:** 2026-07-22
**Proyecto Supabase:** `jztoyekixcziaicrnlce` · **PostgrestVersion:** 14.5

---

## 0. Resumen ejecutivo (TL;DR)

| # | Pregunta de la subtarea | Veredicto |
|---|---|---|
| 1 | ¿Cómo se relaciona `professionals` con las cuentas de usuario (`auth.uid`)? | **Enlace OPCIONAL y NO usado.** `professionals.user_id` existe pero es **nullable** (`uuid \| null`), **sin FK declarada a auth** en los tipos, y **ningún punto de la app lo consulta**. |
| 2 | ¿Qué roles admite `salon_members` (owner/manager)? | Enum `member_role` = **`owner` · `manager` · `staff`** (son **tres**, no dos). `salon_members.user_id` es **NOT NULL** → es la única tabla que ata `auth.uid` a un salón. |
| 3 | ¿Existe `appointment_blocks` para los 3 tramos? | **Sí, existe.** Modela los tramos con la columna `phase` (1 fila por tramo) + `occupied_range`. Los 3 tramos = `services.application_min` / `exposure_min` / `post_exposure_min`. |

> ### ⛔ Conclusión decisiva (lo que pedía documentar la subtarea)
> **NO hay enlace fiable profesional ↔ usuario.** La identidad autenticada (`auth.uid`)
> solo resuelve **pertenencia + rol** vía `salon_members`; **nunca** resuelve *qué
> profesional es*. Por tanto, **cualquier flujo que deba atribuir trabajo a un
> profesional concreto (cita, `appointment_blocks`, venta, visita) está OBLIGADO a
> mostrar un SELECTOR de profesional.** No se puede inferir el profesional desde la sesión.

---

## 1. Fuente de verdad y metodología

- **No hay migraciones SQL en el repo** (`**/*.sql` → 0 archivos; no existe `supabase/migrations/`). El esquema vive en el servidor de Supabase.
- El reflejo del esquema en el repo es el archivo de tipos generado **`src/types/database.ts`** (regenerado el 2026-07-18 en HAT3X-023 con `supabase gen types typescript --project-id jztoyekixcziaicrnlce`). **Esta es la fuente de verdad estructural** para la app.
- ⚠️ **Ojo con el archivo señuelo:** `src/integrations/supabase/client.ts` importa los tipos de **`@/types/database`**, no de `src/integrations/supabase/types.ts`. Este último es un **stub vacío** (`Tables: { [_ in never]: never }`) y **no debe usarse** como referencia de esquema.
- Se cruzó la definición de tipos con el **uso real en código** (`grep` sobre `src/`) para distinguir "existe en el esquema" de "lo usa la app".

---

## 2. Hallazgo 1 — `professionals` ↔ `auth.uid` (el enlace que fuerza el selector)

### 2.1 Estructura de la tabla `professionals`
`src/types/database.ts:1152-1211`

```ts
professionals: {
  Row: {
    id: string
    salon_id: string
    location_id: string
    full_name: string
    email: string | null
    phone: string | null
    color: string | null
    specialties: string[]
    active: boolean
    user_id: string | null   // ← enlace a la cuenta auth: NULLABLE
    created_at: string
    updated_at: string
  }
  Relationships: [
    // Solo hay FKs a locations y salons.
    { foreignKeyName: "professionals_location_id_fkey", ... referencedRelation: "locations" },
    { foreignKeyName: "professionals_salon_id_fkey",    ... referencedRelation: "salons"    },
    // ❌ NO existe professionals_user_id_fkey → auth.users
  ]
}
```

### 2.2 Por qué el enlace NO es utilizable

1. **Es opcional (nullable).** `user_id: string | null`. Un profesional puede existir sin cuenta auth asociada, por lo que no está garantizado que un `auth.uid` tenga un `professional` correspondiente ni al revés.
2. **No hay FK a `auth.users` declarada** en los tipos (solo `location_id` y `salon_id`). No hay integridad referencial expuesta que garantice el vínculo 1:1.
3. **La app NUNCA lo usa.** Búsqueda exhaustiva en `src/`:
   - La **única** consulta `.eq('user_id', …)` de toda la app es contra `salon_members` (`src/lib/auth.tsx:66`).
   - **No existe ninguna** consulta `.from('professionals')` en páginas ni componentes (las apariciones de `professionals` fuera de los tipos son solo **comentarios** en `AdminEmployees.tsx`, `AdminEmployeeCalendar.tsx`, `EmployeeCalendar.tsx`).
   - Es decir: hoy la app **no carga ni resuelve profesionales en absoluto**.

### 2.3 Cómo resuelve identidad la app hoy (`src/lib/auth.tsx`)
- Login con email sintético `<id>@salonos.app` (`auth.tsx:35-37`).
- Tras autenticar → `fetchMembership(userId)` consulta **`salon_members`** por `salon_id + user_id` y obtiene **`role`** (`auth.tsx:56-81`).
- El estado derivado es `isStaff / isManager / isAdmin` a partir del rol (`auth.tsx:94-102`).
- **En ningún momento se resuelve un `professional`.** `auth.uid` → salón + rol. Punto.

**Consecuencia directa:** al registrar una cita / bloque / venta / visita, la app no puede saber "qué profesional soy" desde la sesión → **selector de profesional obligatorio** (cargando `professionals` filtrado por `salon_id` y `active = true`).

---

## 3. Hallazgo 2 — Roles disponibles en `salon_members`

### 3.1 Tabla `salon_members` (junction auth ↔ salón)
`src/types/database.ts:1266-1300`

```ts
salon_members: {
  Row: {
    id: string
    salon_id: string
    user_id: string          // ← NOT NULL: ata la cuenta auth al salón
    role: member_role        // enum, default 'staff' (Insert/Update lo marcan opcional)
    created_at: string
    updated_at: string
  }
  Relationships: [ salon_members_salon_id_fkey → salons ]
}
```

### 3.2 Enum `member_role` — son TRES roles, no dos
`src/types/database.ts:1717` y `:1873` (Constants)

```ts
member_role: "owner" | "manager" | "staff"
```

> 🔎 **Matiz respecto al enunciado de la subtarea:** se pedía verificar "(owner/manager)", pero
> el enum real incluye un **tercer rol `staff`**. Mapeo de permisos en la app (`auth.tsx:96-98`):
>
> | Rol | `isStaff` | `isManager` | `isAdmin` |
> |---|---|---|---|
> | `owner`   | ✅ | ✅ | ✅ |
> | `manager` | ✅ | ✅ | ❌ |
> | `staff`   | ✅ | ❌ | ❌ |
>
> `isManager = owner \|\| manager` · `isAdmin = owner`. Los tres son "personal del salón" (`isStaff = true`).

- `salon_members.user_id` es **NOT NULL** → es la **única** tabla que vincula de forma fiable `auth.uid` con el salón. Refuerza el Hallazgo 1: la identidad se apoya en `salon_members`, no en `professionals`.

---

## 4. Hallazgo 3 — `appointment_blocks` y los 3 tramos

### 4.1 La tabla EXISTE
`src/types/database.ts:148-196`

```ts
appointment_blocks: {
  Row: {
    id: string
    salon_id: string
    appointment_id: string
    professional_id: string   // NOT NULL → cada tramo se atribuye a un profesional
    phase: string             // ← el "tramo"
    occupied_range: unknown   // rango temporal ocupado (probable tstzrange en la BD)
  }
  Relationships: [
    appointment_blocks_appointment_id_fkey  → appointments
    appointment_blocks_professional_id_fkey → professionals
    appointment_blocks_salon_id_fkey        → salons
  ]
}
```

### 4.2 Los "3 tramos" = las 3 fases del servicio
La tabla `services` (`src/types/database.ts:1406-1467`) define exactamente **tres duraciones de fase**:

| Fase / tramo | Columna en `services` |
|---|---|
| Aplicación | `application_min` |
| Exposición | `exposure_min` |
| Post-exposición | `post_exposure_min` |

Modelo: **una cita genera hasta 3 filas en `appointment_blocks`** (una por `phase`), y `occupied_range` marca la ventana en la que el profesional/recurso está ocupado en cada tramo. Esto permite que durante la fase de "exposición" (en la que el cliente espera) el profesional pueda atender otra cita — el patrón clásico de peluquería/estética con tramos solapables.

> ⚠️ **Nota de estado:** `appointment_blocks` y los campos de fase de `services` **solo aparecen
> en los tipos**; el frontend del staff **todavía no los consume** (0 usos en `src/` fuera de
> `database.ts`). Existen en la BD y están listos para construir el flujo de agenda/citas.

### 4.3 Punto crítico para el selector
`appointment_blocks.professional_id` es **NOT NULL**: cada tramo **exige** un profesional. Como la app no puede derivar el profesional desde `auth.uid` (Hallazgo 1), **el selector de profesional es un prerrequisito bloqueante** para poder insertar bloques/citas.

---

## 5. Implicaciones para las subtareas siguientes

1. **Selector de profesional (obligatorio).** Construir un selector que cargue `professionals` por `salon_id` + `active = true` (opcionalmente por `location_id`). La sesión no basta para identificar al profesional.
2. **No apoyarse en `professionals.user_id`** para "auto-seleccionar" al profesional del usuario logueado: está vacío/nullable y sin garantías. Si en el futuro se quisiera pre-seleccionar, requeriría (a) poblar `user_id`, (b) añadir FK e índice único, y (c) manejar el caso NULL con selector de reserva.
3. **Roles:** contemplar los **tres** valores del enum (`owner/manager/staff`). Gating de UI ya resuelto en `auth.tsx` (`isManager`, `isAdmin`).
4. **Tramos:** al crear una cita, calcular los 3 `appointment_blocks` a partir de `services.application_min / exposure_min / post_exposure_min` y del `starts_at`. `professional_id` viene del selector.
5. **Deuda técnica anexa (fuera de alcance de sub-1, pero detectada):** `src/types/database.ts` conserva bloques `// [compat]` de un esquema antiguo (`staff_members`, `employee_schedules`, `user_roles`, `audit_logs`, y columnas `first_name/last_name/status` en `customers`) que **no existen** en la BD real de Salón OS. Varias pantallas (`Customers`, `VerifyCustomer`, `Dashboard`, `History`, `AdminEmployees`, `AdminEmployeeCalendar`) aún los consultan. Deben migrarse a `professionals` / `full_name` / `phone_e164`.

---

## 6. Anexo — Referencias de evidencia

| Hecho | Ubicación |
|---|---|
| `professionals.user_id` nullable, sin FK a auth | `src/types/database.ts:1165`, `:1195-1210` |
| App resuelve rol vía `salon_members`, no profesional | `src/lib/auth.tsx:56-81`, `:94-102` |
| Única query `.eq('user_id')` = `salon_members` | `src/lib/auth.tsx:63-67` |
| Sin `.from('professionals')` en la app | `grep` en `src/` → solo comentarios |
| Enum `member_role` (owner/manager/staff) | `src/types/database.ts:1717`, `:1873` |
| `salon_members.user_id` NOT NULL | `src/types/database.ts:1273` |
| `appointment_blocks` con `phase` + `occupied_range` | `src/types/database.ts:148-196` |
| 3 fases de servicio | `src/types/database.ts:1409`, `:1416`, `:1419` |
| Fuente de verdad del esquema | `src/types/database.ts:1-23` (cabecera) |
| Stub vacío a ignorar | `src/integrations/supabase/types.ts:15-31` |
