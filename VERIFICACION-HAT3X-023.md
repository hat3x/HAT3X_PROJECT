# Verificación HAT3X-023 — Migración a Salón OS

> Reality Checker · 2026-07-18 · rama `hat3x/HAT3X-023`
> Gestor del proyecto: **bun** (`bun.lockb` presente). TypeScript 5.8.3, Vite 5.4.19.

Estado por defecto del Reality Checker: *NEEDS WORK salvo prueba en contrario.*
Para el **alcance concreto de esta sub-tarea** (compila + typecheck + los 3 flujos), el
resultado es **APROBADO con evidencia**. Al final se listan salvedades fuera de alcance.

---

## 1. Compilación y typecheck — PASA (exit 0)

| Comando | Resultado | Evidencia |
|---|---|---|
| `tsc -b --force` (referencias `tsconfig.app.json` + `tsconfig.node.json`) | ✅ exit 0, sin errores | typecheck limpio, forzado sin caché incremental |
| `tsc --noEmit -p tsconfig.app.json` | ✅ exit 0, sin errores | comprobación directa del código de app |
| `vite build` (producción) | ✅ exit 0 | 2592 módulos, `dist/` generado en 5.33s |
| `vitest run` | ✅ 1/1 test | suite placeholder (`example.test.ts`) |

**No hubo errores de tipos ni campos residuales del esquema viejo que corregir**: los
commits previos de HAT3X-023 dejaron el árbol ya alineado con el esquema de Salón OS.
`tsc` garantiza que todas las consultas **tipadas** (`.from(...).select(...)`) usan tablas
y columnas existentes en `src/types/database.ts`.

Advertencias no bloqueantes: tamaño de chunk > 500 kB y `caniuse-lite` desactualizado.

---

## 2. Flujos clave — VALIDADOS (por inspección de código + contrato de tipos)

### 2.1 Login exige pertenencia a `salon_members` ✅
`src/lib/auth.tsx`
- `signIn(id, password)` autentica con email sintético `<id>@salonos.app` y luego
  `fetchMembership(userId)` consulta `salon_members` filtrando por `salon_id` (= `SALON_ID`)
  y `user_id` (`auth.tsx:56-61`).
- Si **no** hay rol → `supabase.auth.signOut()` + error `"Sin acceso a este salón"`
  (`auth.tsx:177-183`). Una sesión válida sin pertenencia se revoca también en
  `handleSession` (`auth.tsx:113-120`). Multi-tenant correcto.

### 2.2 Escaneo por `qr_token` muestra puntos / cupones / recompensas ✅
`src/pages/Scan.tsx` → navega a `/verify-customer` con `qrToken`.
`src/pages/VerifyCustomer.tsx`
- Busca en `customers` por `.eq('qr_token', qrToken)` dentro de `salon_id` (`VerifyCustomer.tsx:46-51`).
- En paralelo obtiene:
  - **Puntos**: `loyalty_accounts` → `points_balance`, `visits_total`, `last_visit_at`.
  - **Recompensas**: `rewards` con `count` sobre `status='AVAILABLE'` no expiradas → `rewards_available`.
  - **Cupones**: `welcome_coupons` `status='ACTIVE'` no expirados → `welcomeCoupon`.

### 2.3 Confirmar visita → `staff_award_visit` con líneas en céntimos y ref UUID ✅
`src/pages/ConfirmVisit.tsx`
- `refId = crypto.randomUUID()` con *lazy init* (`ConfirmVisit.tsx:63`) → **ref UUID** único e idempotente.
- Líneas `{ price_cents: number, label: string }` → **importes en céntimos** (`price_cents`).
- Llama `supabase.rpc('staff_award_visit', { p_salon_id, p_customer_id|p_qr_token, p_line_items, p_redeem_coupon, p_ref_type:'visit', p_ref_id })` (`ConfirmVisit.tsx:111-118`).

Firma en `src/types/database.ts:1683-1694` coincide con la llamada:
`p_salon_id` (obligatorio) + `p_customer_id? / p_qr_token? / p_line_items?(Json) / p_redeem_coupon?(bool) / p_ref_id? / p_ref_type?` → `Returns: Json`.

`src/pages/VisitResult.tsx` consume la respuesta cruda (`points_earned`, `points_balance`,
`visits_total`, `redeemed_coupon`, `discount_cents`, `reward`, `already_awarded`) con
respaldo en las claves legadas que reenvía ConfirmVisit. Contrato coherente.

Referencias a datos (auditadas): únicas RPC = `staff_award_visit`; `.from(...)` apuntan a
tablas de Salón OS (`salon_members`, `customers`, `loyalty_accounts`, `rewards`,
`welcome_coupons`, `points_movements`, `visits`, `services`).

---

## 3. Salvedades (fuera del alcance de esta sub-tarea)

1. **Verificación de identidad por PIN** (`IdentityVerificationForm.tsx`) usa
   `visit_pins` / `verification_pins`, **tablas que no existen** en el esquema de Salón OS.
   Está cast a `any` con degradación controlada (errores `PGRST205` / `42P01`), pero en
   ejecución real el PIN fallará hasta que exista la tabla. Requiere decisión de producto.
2. **Cita del día** (`VerifyCustomer.tsx`) consulta `appointments` (existe) y
   `appointment_services` (**no** en el esquema, cast `any`); si falla, degrada a "sin cita".
3. **ESLint**: 20 errores / 8 warnings **preexistentes** (boilerplate shadcn
   `no-empty-object-type`, `no-explicit-any` en los cast anteriores, `require()` en
   `tailwind.config.ts`). No afectan a `build` ni a `typecheck`; no se tocaron para no
   introducir riesgo fuera de alcance.
4. **`src/integrations/supabase/types.ts`**: stub del esquema viejo (tablas vacías),
   **sin importadores** (código muerto). Inofensivo; candidato a borrado en una limpieza.
5. **E2E real no ejecutado**: validar los flujos contra la BD en vivo de Salón OS tocaría
   datos de producción/credenciales reales; se validó por inspección de código + contrato
   de tipos de la RPC. Recomendado un smoke test manual con un cliente de prueba real.

## Veredicto
Sub-tarea **APROBADA**: la app compila, `tsc` pasa limpio, la suite pasa y los tres flujos
solicitados están correctamente cableados al esquema de Salón OS. Salvedades 1–2 son
funcionalidad fuera de alcance (pantallas deshabilitadas con gracia), no regresiones.
