# Verificación final — gate (sub-8)

> Ejecutada el 2026-07-24 sobre la rama `hat3x/HAT3X-035`. Todas las evidencias de
> abajo son de una ejecución **fresca** en esta sesión (código de salida incluido).
> Alcance del gate: cerrar el entregable de la rama —la **rejilla del día** de la
> reserva pública (sub-1…sub-7)— junto con las dos correcciones de la extensión de
> tipos que quedaban en el árbol de trabajo: el **fix del logo de marca** (Server
> Action con `FormData`) y la **tolerancia a solapes** de la siembra demo. No se
> encontró ningún fallo que corregir: el árbol entra en verde tal cual.

## Resumen (semáforo)

| Comprobación | Comando | Resultado |
|---|---|---|
| Typecheck de la app | `npx tsc --noEmit` | ✅ exit 0, sin salida (limpio) |
| Typecheck de los scripts | `npm run typecheck:scripts` | ✅ exit 0, limpio (cubre el seed modificado) |
| Build de producción | `npm run build` | ✅ exit 0, «✓ Compiled successfully», linting + tipos válidos |
| Suite de tests | `npx vitest run` | ✅ exit 0 · 83 archivos · **1259** tests, 0 fallos, 0 skips |
| Tests del fix de marca + rejilla | `vitest run` (dirigido) | ✅ exit 0 · 3 archivos · 19 tests |

## 1. `npx tsc --noEmit` — typecheck de la app

Exit 0, sin ninguna línea de error. La app tipa limpia, incluida la **extensión de
tipos** de la Server Action de marca: `saveSalonLogo(formData: FormData)` (antes
`saveSalonLogo(file: File)`) y su consumidor `useUploadSalonLogo`, que ahora envuelve
el `File` del formulario en `FormData` antes de invocar la acción.

## 2. `npm run typecheck:scripts` — scripts aislados (imprescindible aquí)

`tsc -p scripts/tsconfig.json --noEmit` → exit 0, limpio.

Verificación **necesaria**, no redundante: el `tsconfig.json` raíz **excluye**
`scripts/`, de modo que el `tsc --noEmit` del punto 1 **no** tipa el seed. Como el
entregable toca `scripts/seed-demo-salon.ts` (tolerancia a la exclusión `23P01`
`appointment_blocks_no_overlap`: si un lote choca, se reinserta fila a fila saltando
solo las que solapan, en vez de abortar la siembra), ese archivo se gatea con su
tsconfig dedicado. Tipa limpio.

## 3. `npm run build` — build de Next.js

`next build` → exit 0, «✓ Compiled successfully», «Linting and checking validity of
types …» sin errores ni warnings. Se genera la tabla completa de rutas de la app
(incluidas `/reservar/[slug]`, `/ajustes/marca`, `/api/public/booking/[slug]/availability`,
…). Ninguna ruta ni chunk proviene de `scripts/` (siguen fuera del bundle).

## 4. `npx vitest run` — suite verde

```
Test Files  83 passed (83)
     Tests  1259 passed (1259)
```

Exit 0, **0 fallos, 0 skips**. Cumple el umbral de la subtarea (**≥ 1107**) con holgura.

**Sobre el recuento (1107 → 1259).** La línea base de 1107 permanece intacta y en
verde; el crecimiento es **aditivo** y trazable a las dos tandas de trabajo previas:

- **+107** del pipeline seed demo (documentado en `seed-demo-verification.md`, sub-12,
  que dejó la suite en 1214 / 80 archivos).
- **+45** de la **rejilla del día** (sub-1…sub-7): 3 archivos de test nuevos
  —`day-slots.test.tsx`, `booking-day-grid-contract.test.tsx` y
  `public-availability-route.test.ts`— más los casos añadidos a los generadores de
  disponibilidad (`generateDaySlots`). Total: 1107 + 107 + 45 = **1259** (83 archivos).

## 5. Tests dirigidos de la extensión de tipos y los componentes nuevos

`npx vitest run` sobre los tres archivos que fijan los contratos que este gate cierra
→ exit 0, **3 archivos / 19 tests**:

| Archivo | Fija |
|---|---|
| `salon-branding-actions.test.ts` | `saveSalonLogo` recibe `FormData` (clave `logo`), **no** un `File` suelto — argumento válido de Server Action |
| `day-slots.test.tsx` | la rejilla del día pinta toda la jornada; ocupados/pasados/cerrados salen `aria-disabled` con `aria-label` del motivo |
| `booking-day-grid-contract.test.tsx` | app de cliente y panel solo reservan huecos libres pese a la rejilla completa |

## 6. Nota sobre el fix del logo (por qué el gate lo valida y no lo detectaban ni build ni tests)

El `File` suelto **compilaba y pasaba los tests** pero fallaba en runtime: los
argumentos de una Server Action deben ser serializables y `File` es una clase, así que
Next lo rechaza («Only plain objects, and a few built-ins, can be passed to Server
Actions»). La corrección —envolver en `FormData`— se refleja en la acción, el hook y su
test, y queda documentada en el propio código. La checklist `DEPLOY-AHORA.md` lo recoge
como ya arreglado. Este gate confirma que el contrato `FormData` tipa, construye y
está cubierto por test.

## Veredicto

**Entregable en verde.** Typecheck de app y de scripts limpios, build de producción OK
(compila, lintea y valida tipos sin errores) y suite de tests verde (**1259**, con la
base de 1107 intacta y crecimiento aditivo y trazable). No hubo ningún fallo derivado de
la extensión de tipos ni de los componentes nuevos que corregir: la rejilla del día, el
fix del logo con `FormData` y la tolerancia a solapes del seed pasan todas las puertas.
Gate **superado**; rama lista para cerrar.
