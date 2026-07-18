# Verificación — Build, Typecheck y lecturas *self* (Salón OS)

> Sub-tarea sub-9 · Rama `hat3x/HAT3X-022` · 2026-07-18
> Rol: Reality Checker (certificación basada en evidencia — no en suposiciones).

## Resultado (evidencia fresca)

| Check | Comando | Estado |
|---|---|---|
| Build | `npm run build` (vite) | ✅ `exit 0` — 2137 módulos transformados, PWA generada |
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | ✅ `exit 0` |
| Tests | `npm run test` (vitest) | ✅ 1/1 |

> `VITE_SALON_ID` es **obligatoria** en build: `src/lib/salon.ts` lanza un error
> temprano si falta. Para la verificación se usó un UUID placeholder
> (`VITE_SALON_ID=00000000-0000-0000-0000-000000000000`).

## Confirmaciones funcionales

1. **Registro → RPC enlace-por-teléfono.** `src/pages/Register.tsx` invoca
   `supabase.rpc('register_my_customer_account', { p_salon_id: SALON_ID, p_phone: phone, p_full_name, p_email })`.
   La función existe en los tipos generados (`src/integrations/supabase/types.ts`). ✅

2. **Fidelización → lecturas *self* por RLS.** `src/pages/Loyalty.tsx` lee la ficha
   propia de `customers` (`user_id = auth.uid()` **+** `salon_id = SALON_ID`) y luego
   `loyalty_accounts`, `welcome_coupons`, `rewards` (y `points_movements`) filtrando
   por `customer_id` **+** `salon_id`. Todas las tablas existen en los tipos. ✅
   (`src/hooks/useCustomer.ts` y `src/pages/Home.tsx` aplican el mismo patrón *self*.)

## Correcciones aplicadas para dejar el typecheck en verde

El typecheck **partía en rojo** (`exit 2`, 6 archivos). Causas y arreglos:

- **`src/pages/Home.tsx` (pantalla viva, ruta `/home`, sí entra al bundle):** la query
  de "próxima cita" usaba el campo inexistente `start_at` (correcto: **`starts_at`**) y
  los valores de enum inexistentes `CONFIRMED`/`RESCHEDULED` (enum real
  `appointment_status`: `pending | confirmed | completed | cancelled | no_show`). Eran
  **bugs de runtime reales** (Postgres habría respondido *"column start_at does not
  exist"*). Corregido a `starts_at` y `['pending','confirmed']`.
- **Pantallas deshabilitadas** (`Club`, `PremiumBenefits`, `Promos`, `admin/ApiKeys`,
  `RequireAdmin`): referencian tablas que **no existen** en Salón OS
  (`subscriptions`/`campaigns`/`user_roles`/`api_keys`). Ya estaban **fuera del bundle**
  (`App.tsx` no las importa; sus rutas se redirigen por *feature flag*). Se añaden al
  `exclude` de `tsconfig.app.json`, igual que `src/pages/_deferred`, hasta que se
  aprovisione su backend. Al re-activarlas hay que quitarlas de ese `exclude`
  (ver comentario en el propio archivo y checklist en `src/config/features.ts`).

## Observaciones para el PM (no bloqueantes)

- **No es TS `strict`.** `tsconfig.app.json` tiene `strict: false` /
  `strictNullChecks: false` (config por defecto de Lovable). Lo verificado es el
  typecheck del propio proyecto, no `tsc --strict` (activarlo de golpe generaría
  cientos de errores en `shadcn/ui`). Migrar a strict debería ser progresivo.
- **No hay `typecheck` en el pipeline.** `npm run build` usa Vite+SWC, que **no** hace
  type-checking. Recomendado añadir `"typecheck": "tsc --noEmit -p tsconfig.app.json"`
  a `package.json` y ejecutarlo en CI para no re-introducir desajustes de esquema.
- **Cobertura de tests casi nula** (solo `src/test/example.test.ts`). Los flujos de
  registro y fidelización no tienen tests unitarios/integración.
