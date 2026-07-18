# Verificación final de fase — branding / tematizado white-label del panel (sub-9)

> Gate de cierre de la fase de marca. Evidencia reproducible de que **la fase es
> aditiva en capacidad y no rompe nada**: tipos, tests y build en verde sobre la
> base ya cerrada de la productización. Fecha: 2026-07-18. Rama: `hat3x/HAT3X-025`.

## 1. Alcance revisado

La fase añade el **white-label del panel**: cada salón configura su logo y sus
colores de marca (con aviso de contraste WCAG), el panel se **tematiza en
runtime** con esa marca, y Ajustes gana una vista de **solo lectura** de los
complementos (add-ons) contratados. Todo se apoya en el gating por
`salon_features` ya existente. Cambios del árbol de trabajo (diff `947dec7^..HEAD`):

| Cambio | Archivos | Naturaleza |
|---|---|---|
| Capa de datos de servidor (nueva) | `src/lib/salon-branding/{server,branding,theme}.ts`, `src/lib/salon-features.ts` | Server Actions `"use server"` gateadas por rol/pertenencia; lectura de marca + entitlements |
| Página Ajustes → Marca (nueva) | `src/app/(dashboard)/ajustes/marca/{page,salon-marca-form,actions}.tsx?` | Form de logo + colores; validación de hex, tipo/tamaño de logo y contraste en cliente |
| Vista de complementos (nueva) | `src/app/(dashboard)/ajustes/complementos/{page,complementos-view}.tsx` | **Solo lectura** del mapa de add-ons contratados |
| Tematizado dinámico (nuevo) | `src/components/branding/salon-brand-theme.tsx`, `src/hooks/use-salon-branding.ts` | Inyección de variables HSL de la marca en runtime |
| Integración de navegación/layout | `src/app/(dashboard)/{layout,ajustes/layout,ajustes/ajustes-nav}.tsx`, `src/components/dashboard-nav.tsx` | Cableado de la nueva superficie (sin retirar rutas) |
| Tipos | `src/types/database.ts` | Filas/columnas de marca y features |
| Tests (7 nuevos) | `src/tests/unit/{salon-branding,salon-branding-server,salon-branding-actions,salon-branding-theme,salon-marca-form,complementos-view,customer-loyalty-gate}.test.ts?` | Cobertura de la capa de datos, la UI de marca, la conversión de tema, la vista de add-ons y el gating de fidelización |
| Documentación | `README.md`, `docs/roadmap-productizacion.md` | Documenta la config de marca, la ruta del logo y el tematizado |

La fase es **puramente aditiva**: 26 ficheros, `+3816 / -32`. Las 32 líneas
retiradas son refactor de navegación/layout para acomodar las nuevas entradas;
**no se elimina ninguna funcionalidad, ruta ni test previo**. No toca el motor de
citas/reservas.

## 2. Comprobaciones de base (evidencia)

| Comando | Resultado | Exit code |
|---|---|---|
| `npx tsc --noEmit` | Sin salida (0 errores de tipos) | `0` |
| `npx vitest run` | **43 archivos, 579 tests, 579 passed** (0 fallidos, 0 saltados) | `0` |
| `npm run build` | `✓` compilado, **23/23** páginas generadas (incluye `/ajustes/marca` y `/ajustes/complementos`) | `0` |

- **Tipos:** `tsc --noEmit` limpio.
- **Tests:** verde total. La suite crece desde la base de **483** (cierre de la
  productización, sub-12) hasta **579** (+96 tests, +7 archivos). Ningún test
  previo pasa a rojo; los nuevos cubren la marca, el tema, la vista de add-ons y
  el gate de fidelización.
- **Build:** compila; la tabla de rutas suma las dos páginas nuevas de Ajustes
  (21 → 23 páginas respecto a sub-12) y no hay imports rotos (si los hubiera, el
  build habría fallado).

## 3. El build valida de verdad (no enmascara errores)

`next.config.mjs` es mínimo (`reactStrictMode: true` y nada más): **no** define
`typescript.ignoreBuildErrors` ni `eslint.ignoreDuringBuilds`. Por tanto el
`npm run build` en verde implica que Next ejecutó su propio chequeo de tipos y
lint sobre toda la superficie nueva, y pasó. El verde del gate es real, no
suprimido.

## 4. No-regresión: la marca es opt-in y gateada

- La configuración de marca vive tras Server Actions `"use server"`
  (`src/lib/salon-branding/server.ts`) con defensa en profundidad sobre la RLS:
  rol `staff` ⇒ `forbidden 403`, sin sesión ⇒ `unauthorized 401` (verificado en
  `salon-branding-server.test.ts`).
- El tematizado es aditivo: sin fila de marca, el panel cae al tema por defecto
  (`DEFAULT_PRIMARY_COLOR`), verificado en `salon-marca-form.test.tsx` y
  `salon-branding-theme.test.ts`.
- La vista de complementos es **solo lectura**: refleja el mapa de add-ons
  contratados sin ninguna mutación (`complementos-view.test.tsx`); la
  fidelización ausente o en pausa nunca figura como contratada.

## 5. Conclusión

`tsc --noEmit` limpio, `vitest run` en verde (**579/579**), `npm run build` OK
(23/23 páginas) y sin supresión de errores en `next.config.mjs`. La fase suma el
white-label del panel (marca configurable + tematizado en runtime + vista de
add-ons) **sin romper** tipos, tests ni build, y **sin retirar** funcionalidad
previa. **Apta para cierre de fase.**
