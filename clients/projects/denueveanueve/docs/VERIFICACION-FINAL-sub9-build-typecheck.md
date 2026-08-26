# Verificación final (sub-9) — build + typecheck de la integración Salón OS

> Cierre de la integración (sub-1 … sub-8). Objetivo: confirmar que la app
> **compila** (`npm run build`) y que el **typecheck pasa** con el `tsc` del
> proyecto, y corregir cualquier error de tipos/build derivado de la integración.
>
> **Resultado: verde en todo. No hubo errores derivados de la integración que
> corregir.** La app compila, el typecheck real pasa y las 155 pruebas pasan.

Fecha: 2026-07-19 · Rama: `hat3x/HAT3X-028`

---

## TL;DR

| Verificación | Comando | Resultado |
|---|---|---|
| Build de producción | `npm run build` | ✅ exit 0 — 2971 módulos, ~5 s, PWA generada |
| Typecheck **real** | `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) | ✅ exit 0 — 120 archivos de `src` comprobados |
| Suite de pruebas | `npm test` | ✅ 155/155 en 9 archivos |
| Typecheck literal del enunciado | `node ./node_modules/typescript/bin/tsc --noEmit` | ⚠️ exit 0 **pero no comprueba nada** (0 archivos) — ver aviso |

No se modificó código de la aplicación: la integración ya tipa y bundlea limpio.

---

## ⚠️ Aviso importante — el comando literal del enunciado es un "falso verde"

El enunciado de la subtarea pedía verificar con:

```bash
node ./node_modules/typescript/bin/tsc --noEmit
```

Ese comando **devuelve exit 0 sin comprobar ni un solo archivo de `src`**. No es
que la integración esté bien "porque ese comando da verde": es que ese comando
**no mira el código**. Comprobado:

```bash
$ node ./node_modules/typescript/bin/tsc --noEmit --listFilesOnly | grep -c "/src/"
0
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
npm run typecheck   # = tsc --noEmit -p tsconfig.app.json  → comprueba 120 archivos de src
npm run build       # = vite build
```

> **Regla:** el gate de cierre debe ejecutar `npm run typecheck && npm run build`.
> Nunca fiarse del `tsc --noEmit` "pelado" contra la config raíz: da verde aunque
> haya errores.

No se restructuró el modelo de *project references* (es el scaffold estándar de
Vite/Lovable y lo consumen el editor y el plugin de Vite); la remediación correcta
es usar el comando que ya existe, no tocar los tsconfig.

---

## Evidencia

### 1) Build de producción — `npm run build`

```
vite v5.4.19 building for production...
✓ 2971 modules transformed.
dist/assets/index-EFoIxluw.js            131.13 kB │ gzip: 41.54 kB
dist/assets/vendor-react-C41SPjrY.js     160.48 kB │ gzip: 52.39 kB
dist/assets/vendor-supabase-CWKEltw6.js  193.92 kB │ gzip: 50.97 kB
dist/assets/vendor-ui-BHh_3qrV.js        198.98 kB │ gzip: 62.60 kB
✓ built in 5.06s
PWA v1.3.0 — precache 27 entries (931.52 KiB) — dist/sw.js generado
---BUILD_EXIT:0---
```

### 2) Typecheck real — `tsc --noEmit -p tsconfig.app.json`

`exit 0`, sin diagnósticos. Cubre **120 archivos de `src`**, incluidos todos los
módulos de la integración y sus pruebas:

```
src/config/salon-os.ts        src/lib/salon-os-api.ts
src/config/features.ts        src/lib/booking.ts
src/lib/salon.ts              src/lib/appointments.ts
src/pages/BookAppointment.tsx src/hooks/useAppointments.ts
src/pages/Appointments.tsx
src/config/salon-os.test.ts             src/lib/appointments.test.ts
src/lib/booking.test.ts                 src/lib/salon-os-api.contract.test.ts
src/lib/salon-os-api.integration.test.ts  src/lib/salon-os-api.test.ts
... (120 en total)
```

> Nota: `tsconfig.app.json` **excluye a propósito** `src/pages/_deferred`,
> `Club.tsx`, `PremiumBenefits.tsx`, `Promos.tsx`, `src/pages/admin` y
> `RequireAdmin.tsx` — pantallas deshabilitadas sin backend en Salón OS que
> referencian tablas aún inexistentes. Es intencional y está documentado en el
> propio `tsconfig.app.json`; no entran al bundle (App.tsx no las importa).

### 3) Pruebas — `npm test`

```
✓ src/test/example.test.ts (1)
✓ src/lib/salon-os-api.contract.test.ts (4)
✓ src/lib/salon.test.ts (27)
✓ src/lib/salon-os-api.test.ts (23)
✓ src/lib/salon-theme.test.ts (27)
✓ src/lib/booking.test.ts (30)
✓ src/lib/salon-os-api.integration.test.ts (11)
✓ src/lib/appointments.test.ts (26)
✓ src/config/salon-os.test.ts (6)

Test Files  9 passed (9)
     Tests  155 passed (155)
---TEST_EXIT:0---
```

---

## Cómo reproducir

```bash
npm run typecheck   # tsc real contra tsconfig.app.json → debe salir 0
npm run build       # vite build → dist/ + PWA
npm test            # 155/155
```

## Conclusión

- ✅ La app **compila** y el **typecheck real pasa**; 155/155 pruebas en verde.
- ✅ **Sin errores de tipos/build derivados de la integración** → 0 cambios de
  código necesarios en sub-9.
- ⚠️ **Acción para el equipo:** el gate de cierre debe usar
  `npm run typecheck && npm run build`. El `tsc --noEmit` "pelado" del enunciado
  es un falso verde y no debe usarse como criterio de aceptación.
