# Verificación final (sub-9) — build + typecheck del flujo de registro con OTP

> Cierre del nuevo flujo de registro con verificación de teléfono por OTP
> (sub-1 … sub-8, sub-10). Objetivo: confirmar que la app **compila**
> (`npm run build`) y que el **typecheck pasa** con el `tsc` del proyecto, y
> corregir cualquier error de tipos/build introducido por el flujo OTP.
>
> **Resultado: verde en todo. El flujo OTP no introdujo ningún error de
> tipos ni de build que corregir.** La app compila, el typecheck real pasa y
> las 264 pruebas pasan. **0 cambios de código necesarios en sub-9.**

Fecha: 2026-07-19 · Rama: `hat3x/HAT3X-030` · Verificado por: Reality Checker

---

## TL;DR

| Verificación | Comando | Resultado |
|---|---|---|
| Build de producción | `npm run build` | ✅ exit 0 — 2977 módulos, 5.75 s, PWA generada (27 entradas) |
| Typecheck **real** | `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) | ✅ exit 0 — **130** archivos de `src` comprobados, incluidos todos los del flujo OTP |
| Suite de pruebas | `npm test` | ✅ **264/264** en 15 archivos |
| Typecheck literal del enunciado | `node ./node_modules/typescript/bin/tsc --noEmit` | ⚠️ exit 0 **pero no comprueba nada** (0 archivos de `src`) — ver aviso |

No se modificó código de la aplicación: el flujo OTP ya tipa y bundlea limpio.

---

## ⚠️ Aviso importante — el comando literal del enunciado es un "falso verde"

El enunciado de la subtarea pedía verificar con:

```bash
node ./node_modules/typescript/bin/tsc --noEmit
```

Ese comando **devuelve exit 0 sin comprobar ni un solo archivo de `src`**. No es
que el flujo OTP esté bien "porque ese comando da verde": es que ese comando
**no mira el código**. Comprobado en esta verificación:

```bash
$ node ./node_modules/typescript/bin/tsc --noEmit --listFilesOnly | grep -c "/src/"
0
$ node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json --listFilesOnly | grep -c "/src/"
130
```

Motivo (dos causas que se suman):

1. **`tsconfig.json` raíz es un config "solution-style"**: tiene `"files": []` y
   delega en *project references* (`tsconfig.app.json` + `tsconfig.node.json`).
   Un `tsc --noEmit` **sin** `-p` ni `-b` toma la config raíz, y como no tiene
   archivos de entrada propios y las referencias solo se siguen en modo build
   (`tsc -b`), no compila nada. Sale verde vacío.
2. **El build de Vite no typechea.** Se usa `@vitejs/plugin-react-swc`: SWC
   **elimina** los tipos sin comprobarlos. Por eso `npm run build` puede dar
   verde con errores de tipos presentes. El `tsc --noEmit` separado es la única
   red que atrapa errores de tipos — y por eso importa ejecutarlo **de verdad**.

### Comando correcto para el gate de "verificación final"

El proyecto ya trae el comando bueno en `package.json`:

```bash
npm run typecheck   # = tsc --noEmit -p tsconfig.app.json  → comprueba 130 archivos de src
npm run build       # = vite build
```

> **Regla:** el gate de cierre debe ejecutar `npm run typecheck && npm run build`.
> Nunca fiarse del `tsc --noEmit` "pelado" contra la config raíz: da verde aunque
> haya errores. (Mismo criterio ya documentado en la verificación de la
> integración Salón OS — ver `VERIFICACION-FINAL-sub9-build-typecheck.md`.)

---

## Evidencia

### 1) Build de producción — `npm run build`

```
vite v5.4.19 building for production...
✓ 2977 modules transformed.
dist/assets/index-BXlAbl6r.js            160.11 kB │ gzip: 50.05 kB
dist/assets/vendor-react-C41SPjrY.js     160.48 kB │ gzip: 52.39 kB
dist/assets/vendor-supabase-CWKEltw6.js  193.92 kB │ gzip: 50.97 kB
dist/assets/vendor-ui-D_jauqZF.js        201.43 kB │ gzip: 63.11 kB
✓ built in 5.75s
PWA v1.3.0 — generateSW — precache 27 entries (964.22 KiB) — dist/sw.js generado
---BUILD_EXIT:0---
```

### 2) Typecheck real — `tsc --noEmit -p tsconfig.app.json`

`exit 0`, sin diagnósticos. Cubre **130 archivos de `src`**. Confirmado que
**todos los módulos del flujo OTP y sus pruebas entran al typecheck**:

```
src/lib/otp.ts                       src/lib/otp.test.ts
src/lib/registration-flow.ts         src/lib/registration-flow.test.ts
src/lib/phone-verification.ts        src/lib/phone-verification.test.ts
src/components/PhoneOtpStep.tsx       src/components/PhoneOtpStep.test.tsx
src/components/ui/input-otp.tsx       src/pages/Register.test.tsx
src/pages/Register.tsx               src/pages/registration-otp.acceptance.test.tsx
src/pages/ForgotPassword.tsx
```

> Nota: `tsconfig.app.json` **excluye a propósito** `src/pages/_deferred`,
> `Club.tsx`, `PremiumBenefits.tsx`, `Promos.tsx`, `src/pages/admin` y
> `RequireAdmin.tsx` — pantallas deshabilitadas sin backend en Salón OS. Es
> intencional y está documentado en el propio `tsconfig.app.json`; no entran al
> bundle (App.tsx no las importa) y **ninguna** pertenece al flujo OTP.

### 3) Pruebas — `npm test`

```
✓ src/test/example.test.ts (1)
✓ src/lib/salon-theme.test.ts (27)
✓ src/lib/salon.test.ts (27)
✓ src/lib/salon-os-api.contract.test.ts (4)
✓ src/lib/registration-flow.test.ts (22)      ← flujo OTP
✓ src/lib/phone-verification.test.ts (19)     ← flujo OTP
✓ src/lib/otp.test.ts (49)                    ← flujo OTP
✓ src/lib/salon-os-api.test.ts (23)
✓ src/lib/appointments.test.ts (26)
✓ src/lib/booking.test.ts (30)
✓ src/lib/salon-os-api.integration.test.ts (11)
✓ src/config/salon-os.test.ts (6)
✓ src/components/PhoneOtpStep.test.tsx (9)     ← flujo OTP
✓ src/pages/Register.test.tsx (6)             ← flujo OTP
✓ src/pages/registration-otp.acceptance.test.tsx (4)  ← flujo OTP

Test Files  15 passed (15)
     Tests  264 passed (264)
---TEST_EXIT:0---
```

De las 264 pruebas, **109 son específicas del flujo OTP** (49 + 22 + 19 + 9 + 6 + 4).

---

## Cómo reproducir

```bash
npm run typecheck   # tsc real contra tsconfig.app.json → debe salir 0 (130 archivos)
npm run build       # vite build → dist/ + PWA
npm test            # 264/264
```

## Conclusión

- ✅ La app **compila** y el **typecheck real pasa**; **264/264** pruebas en verde.
- ✅ **Sin errores de tipos/build introducidos por el flujo OTP** → **0 cambios
  de código necesarios** en sub-9.
- ⚠️ **Acción para el equipo:** el gate de cierre debe usar
  `npm run typecheck && npm run build`. El `tsc --noEmit` "pelado" del enunciado
  es un falso verde (0 archivos comprobados) y no debe usarse como criterio de
  aceptación.
