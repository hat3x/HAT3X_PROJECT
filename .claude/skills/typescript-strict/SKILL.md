# Skill: typescript-strict

**Invocación:** `/typescript-strict`

**Propósito:** Activa TypeScript strict progresivamente, elimina `any`, tipar correctamente APIs externas (Supabase, Stripe) y establece convenciones de tipos para proyectos HAT3X.

---

## Trigger

Se activa cuando el proyecto tiene TypeScript en modo permisivo, hay `as any` en el código, errores silenciosos en tipos, o se quiere incrementar la robustez del código.

---

## Activación progresiva (sin romper el proyecto)

```json
// tsconfig.app.json — Fase 1 (bajo riesgo)
{
  "compilerOptions": {
    "noImplicitAny": true,          // Obliga a tipar explícitamente
    "noUnusedLocals": true,         // Elimina variables sin usar
    "noUnusedParameters": true,     // Elimina parámetros sin usar
    "noImplicitReturns": true,      // Todas las rutas deben retornar
    "strictNullChecks": true        // null y undefined son tipos distintos
  }
}

// tsconfig.app.json — Fase 2 (strict completo)
{
  "compilerOptions": {
    "strict": true                  // Activa todo lo anterior + más
  }
}
```

---

## Eliminar `any` — Casos comunes

### Supabase JSON columns
```ts
// ❌ Mal
const hours = location.hours_json as Record<string, any>

// ✅ Bien — tipar la estructura conocida
interface LocationHours {
  [day: string]: {
    open: string   // "09:00"
    close: string  // "21:00"
    closed?: boolean
  }
}
const hours = location.hours_json as LocationHours
```

### Supabase Realtime payload
```ts
// ❌ Mal
.on('postgres_changes', ..., (payload) => {
  const row = payload.new as any
})

// ✅ Bien
interface VisitPinRow {
  id: string
  customer_id: string
  pin: string
  status: 'PENDING' | 'USED' | 'EXPIRED'
  used: boolean
}
.on('postgres_changes', ..., (payload) => {
  const row = payload.new as VisitPinRow
  if (row.status === 'PENDING') { ... }
})
```

### Funciones RPC de Supabase
```ts
// ❌ Mal — cast as any porque no está en tipos generados
const { data } = await supabase.rpc('check_customer_exists' as any, { ... })

// ✅ Bien — regenerar tipos primero
// npx supabase gen types typescript --project-id [ID] > src/integrations/supabase/types.ts
// Luego el RPC aparece tipado automáticamente
const { data } = await supabase.rpc('check_customer_exists', { email, phone })
```

---

## Convenciones de tipos para proyectos HAT3X

```ts
// types/index.ts — Tipos de dominio centralizados

// Extraer tipos de la DB generada
import type { Tables, Enums } from '@/integrations/supabase/types'

export type Customer = Tables<'customers'>
export type Appointment = Tables<'appointments'>
export type AppointmentStatus = Enums<'appointment_status'>
export type SubscriptionPlan = Enums<'subscription_plan'>

// Tipos enriquecidos (joins)
export type AppointmentWithLocation = Appointment & {
  location_name: string
  services: Tables<'appointment_services'>[]
}

// Tipos de UI (formularios)
export interface BookingFormData {
  locationId: string
  section: 'CABALLEROS' | 'SENORAS' | 'ESTETICA'
  serviceIds: string[]
  staffId: string | null
  date: Date
  time: string
  notes?: string
}

// Tipos de respuesta de API
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

---

## Utilidades de tipos frecuentes

```ts
// Hacer algunos campos opcionales
type PartialAppointment = Partial<Pick<Appointment, 'notes' | 'staff_member_id'>>

// Campos requeridos de un tipo parcial
type RequiredBooking = Required<Pick<BookingFormData, 'locationId' | 'date'>>

// Discriminated unions para estados
type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'success'; data: Appointment[] }

// Uso:
const [state, setState] = useState<PageState>({ status: 'loading' })

if (state.status === 'error') {
  return <ErrorUI message={state.message} />  // TypeScript sabe que message existe
}
```

---

## ESLint para TypeScript

```bash
npm install -D @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

```js
// eslint.config.js
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: { parser: tsParser },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
    }
  }
]
```

---

## Checklist TypeScript strict

- [ ] `noImplicitAny: true` — sin tipos implícitos
- [ ] `strictNullChecks: true` — null/undefined tratados explícitamente
- [ ] Cero `as any` en el código de producción
- [ ] Tipos Supabase regenerados tras cada migración
- [ ] Interfaces de dominio centralizadas en `types/`
- [ ] `tsc --noEmit` pasa sin errores en CI
