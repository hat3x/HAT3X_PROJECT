# Verificación de seguridad y no-regresión — gate OTP de identidad por teléfono (sub-4)

> Cierre de QA de seguridad del enforcement OTP (sub-1/2/3). Evidencia reproducible
> de que **el gate solo afecta al autoservicio de enlace de cuenta** y **no toca**
> ninguna de las tres rutas que debían quedar intactas: **reserva por API pública**,
> **alta de clientes desde el panel del salón** y **`staff_award_visit` + el resto de
> fidelización**. Se confirma además el comportamiento **secure-by-default /
> fail-closed**. Fecha: 2026-07-19. Rama: `hat3x/HAT3X-029`. Autor: Security Engineer.

## 0. TL;DR — veredicto

| # | Afirmación a verificar | Veredicto |
|---|---|---|
| 1 | La reserva por API pública (crea/reutiliza ficha por teléfono, **sin** enlazar cuenta) **NO** exige OTP | ✅ Confirmado |
| 2 | El alta de clientes desde el panel del salón (staff) **NO** se ve afectada | ✅ Confirmado |
| 3 | `staff_award_visit` y el resto de fidelización quedan **intactos** | ✅ Confirmado |
| 4 | **Secure-by-default**: sin OTP configurado, un registro nuevo por teléfono falla de forma clara (`PHONE_NOT_VERIFIED` / `phone_not_verified` 403) | ✅ Confirmado |

**Tesis de raíz:** el gate OTP vive EXCLUSIVAMENTE en las dos primitivas de
**autoservicio de enlace de cuenta** — `public.register_my_customer_account` (RPC,
`SECURITY DEFINER`) y `linkOrCreateCustomerAccount` (`@/lib/customers/account.ts`).
Ambas son las únicas que **escriben `customers.user_id`** (reclamar una ficha para una
cuenta de auth). Las tres rutas protegidas de la no-regresión **nunca** llaman a esas
primitivas y **nunca** enlazan cuenta, así que el gate no puede alcanzarlas.

## 1. Alcance revisado (árbol de trabajo, 5 commits: sub-6 → sub-3)

Diff `4cc17b6~1..HEAD`. Solo se añaden **2 migraciones** y se toca la capa de
autoservicio + la precarga de la reserva pública:

| Cambio | Archivos | Naturaleza |
|---|---|---|
| Válvula de seguridad por salón (sub-1) | `supabase/migrations/20260719110000_salon_security_settings.sql` | Tabla `salon_security_settings` + gate `app.salon_requires_phone_verification()` (fail-closed) + RLS + guardián |
| Enforcement OTP en la RPC (sub-2) | `supabase/migrations/20260719120000_rpc_register_phone_verification_gate.sql` | `CREATE OR REPLACE register_my_customer_account` añadiendo el paso 3.2 (`PHONE_NOT_VERIFIED`) |
| Espejo TS del gate (sub-3) | `src/lib/customers/account.ts` | `linkOrCreateCustomerAccount` exige teléfono confirmado (`phone_not_verified` 403) |
| Precarga de la reserva pública (sub-6) | `src/lib/booking/prefill.ts`, `src/app/(public)/reservar/[slug]/{page,booking-wizard}.tsx`, `src/lib/booking/types.ts` | **Solo lectura** (siembra el formulario con la ficha del cliente autenticado) |
| Tipos + tests + README | `src/types/database.ts`, `src/tests/**`, `src/lib/customers/README.md` | Aditivo |

**No** aparece en el diff ningún archivo de fidelización: `grep -Ei
"loyalty|award|points|coupon|visit"` sobre la lista de archivos cambiados → **0
coincidencias**. `supabase/migrations/20260717150000_rpc_staff_award_visit.sql`
tiene **diff vacío** contra `4cc17b6~1` (su último cambio real es de sub-12, muy
anterior a esta fase).

## 2. Comprobaciones de base (evidencia reproducible)

| Comando | Resultado | Exit code |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | Sin salida (0 errores de tipos) | `0` |
| `npm run test` (`vitest run`) | **48 archivos, 627 tests, 627 passed** (0 fallidos, 0 saltados) | `0` |

## 3. Concern #1 — la reserva por API pública NO exige OTP

**Ruta:** `createBooking` → `findOrCreateCustomer` (`src/lib/booking/server.ts`).

- Usa el **cliente admin** (service role) y resuelve la ficha por teléfono
  canónico (`phone_e164`) acotando a mano por `salon_id`. Si existe, la **REUTILIZA
  tal cual**; si no, la **crea**.
- El `INSERT` en `customers` (líneas ~400-410) escribe `salon_id, full_name, email,
  phone, marketing_consent` — **NO** escribe `user_id`. La ficha nace (o se reutiliza)
  con `user_id = NULL`: **no se enlaza a ninguna cuenta de auth**, que es justo la
  operación que el gate protege. Sin enlace de cuenta, no hay identidad que suplantar
  por esta vía.
- `createBooking`/`findOrCreateCustomer` **no** invocan
  `salon_requires_phone_verification`, `register_my_customer_account` ni
  `linkOrCreateCustomerAccount`. El gate OTP no está en su camino de código.
- La precarga del cliente autenticado (sub-6) es **solo lectura**:
  `page.tsx` llama a `resolveBookingPrefill` → `getMyCustomerForSalon` (un `SELECT`
  self por RLS). Incluso para un cliente autenticado en la página pública, la reserva
  real sigue pasando por `createBooking` (sin `user_id`, sin gate).

**Cobertura de test** (`src/tests/integration/booking-customer-phone.test.ts`):
escenario (2) — con una ficha existente que trae `user_id: "user-9"`, la reserva la
**reutiliza sin insertar cliente nuevo ni pisar `user_id`**; escenarios (1)/(3)/(4)/(5)
cubren teléfono inválido, alta nueva, carrera `23505` y `23505` irresoluble. Ninguno
toca el gate.

## 4. Concern #2 — el alta de clientes desde el panel NO se ve afectada

**Ruta:** `createCustomer` (`src/app/(dashboard)/customers/actions.ts`, Server Action
`"use server"`).

- Usa el **cliente RLS de la sesión** e inserta en `customers` con `{ salon_id, ...
  toWritePayload }`. El payload **no incluye `user_id`** (staff no enlaza cuentas de
  cliente); la ficha nace con `user_id = NULL`.
- No llama a `register_my_customer_account` ni a `linkOrCreateCustomerAccount` ni a la
  válvula de seguridad. El gate OTP es totalmente ajeno a esta ruta.
- `grep` de `linkOrCreateCustomerAccount|register_my_customer_account` sobre
  `src/app/**` → **0 coincidencias**: las dos primitivas gateadas **no están cableadas
  en ninguna ruta de la app** (son primitivas de biblioteca/RPC, ejercitadas por
  tests). Por construcción, no pueden interferir con el panel ni con la reserva pública.

## 5. Concern #3 — `staff_award_visit` y el resto de fidelización, intactos

- `20260717150000_rpc_staff_award_visit.sql`: **diff vacío** en esta fase (sin
  cambios).
- No se modifica ninguna tabla/trigger/RPC de fidelización (§1: 0 coincidencias de
  `loyalty|award|points|coupon|visit` en los archivos cambiados). El trigger de
  bootstrap `trg_customers_bootstrap_loyalty` sigue disparándose en **cualquier**
  `INSERT` en `customers` (reserva pública, panel y autoservicio por igual): el gate es
  una comprobación de negocio **previa** en la RPC/Server Action, no altera el trigger.
- La suite de fidelización (`loyalty-server.test.ts`, `salon-features-gate.test.ts`, y
  las de contrato multi-tenant) está entre los 48 archivos en verde.

## 6. Concern #4 — secure-by-default / fail-closed

El agujero (relajar la verificación) exige un acto **explícito y auditable**;
olvidarse deja el salón **protegido**. Tres capas:

1. **Columna:** `require_phone_verification boolean NOT NULL DEFAULT TRUE`. Una fila
   creada sin valor nace exigiendo verificación. El guardián §4(e) de la migración
   aborta si el `DEFAULT` dejara de ser `true`.
2. **Ausencia de fila = exigir** (fail-closed). `app.salon_requires_phone_verification`
   se implementa como `not exists (… = false)`: sin fila → `TRUE`. Solo una fila con
   `require_phone_verification = false` EXPLÍCITO (service_role/HAT3X, dev/staging) la
   salta. RLS **deny-by-default** en escritura: el salón no puede auto-abrirse el
   agujero desde el navegador (guardián §4c).
3. **Enforcement fail-closed** en las dos primitivas:
   - RPC (paso 3.2): si el gate es `TRUE` y `auth.users.phone_confirmed_at` es NULL o
     el teléfono confirmado no coincide con `p_phone` (comparados ya en E.164) →
     `raise exception 'PHONE_NOT_VERIFIED'` (SQLSTATE `P0001`). Guardián §b lo asegura.
   - TS (`requireVerifiedPhoneOwnership`): mismo criterio →
     `CustomerAccountError('phone_not_verified', 403)`.

**Cobertura de test** (`customers-account.test.ts`, bloque «gate OTP»): el caso
*"→ 403 phone_not_verified si la cuenta NO tiene teléfono confirmado (fail-closed
**sin fila**)"* prueba exactamente el concern #4 — sin fila de seguridad y sin teléfono
confirmado, el registro **falla claro** (`phone_not_verified` 403) **y no crea ficha**
(`rowsOf("customers")` con longitud 0). Casos adicionales: teléfono confirmado distinto
(anti-suplantación), sin sello `phone_confirmed_at`, coincidencia OK (crea), válvula
relajada (salta el gate), y precedencia del feature-gate.

## 7. Notas y residuos (sin impacto en esta verificación)

- **Fuga acotada del gate (documentada, aceptada):** `app.salon_requires_phone_
  verification(uuid)` es `SECURITY DEFINER` y acepta un `salon_id` arbitrario, así que
  un `authenticated` podría consultar el **booleano** de la válvula de otro salón. No
  expone filas, notas ni datos — un bit por salón — y es el precio de un gate
  reutilizable. Revocada a `anon/public` (guardián §0). Ya anotado en la propia
  migración; no es una regresión de esta fase.
- **Sin superficie de app aún:** las dos primitivas gateadas no están cableadas en
  rutas. Cuando se conecte la app de cliente, el borde debe traducir
  `PHONE_NOT_VERIFIED`/`phone_not_verified` (mensaje, no código: comparte `P0001` con
  `PHONE_CONFLICT`/`FEATURE_NOT_ENABLED`) a un flujo de "verifica tu teléfono y
  reintenta". Fuera del alcance de esta subtarea.

## 8. Conclusión

El enforcement OTP es **aditivo y quirúrgico**: cierra el agujero de suplantación por
teléfono **solo** en el autoservicio de enlace de cuenta, sin tocar la reserva pública,
el alta desde el panel ni la fidelización. El comportamiento por defecto es **seguro y
fail-closed**. Evidencia: `tsc --noEmit` limpio y **627/627 tests en verde**.
