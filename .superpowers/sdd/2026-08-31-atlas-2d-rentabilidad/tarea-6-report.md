# Tarea 6 — Informe

**Estado:** Completada.

**Hash del commit:** `60640bd` — "feat(atlas): el dinero del mes en la ficha del cliente y del proyecto" (rama `feature/atlas`).

**Tests:** `npx vitest run` → 83 test files, 753 tests, todos en verde (incluidos los 3 nuevos casos de `margenDe` en `src/tests/db/rentabilidad.test.ts`, ahora 13/13 en ese fichero). Nota: una primera pasada de la batería completa mostró 5 fallos en `src/tests/db/fichajes.test.ts` ("No hay sesión.", RLS que no ve filas); reejecutado ese fichero solo (18/18 verde) y la batería entera de nuevo (753/753 verde) — fue contención transitoria contra la base local de pruebas (Supabase compartido), no relacionada con los ficheros de esta tarea, que no toca `fichajes.ts` ni su test.

**Build:** `npm run build` → compiló y generó las 24 páginas sin error, con el servidor de desarrollo parado (puerto 3010 libre antes de correrlo). Incluye `/clientes/[slug]` y `/proyectos/[slug]`.

**`npx tsc --noEmit`:**
```
EXIT_CODE=0
```

**Ficheros tocados** (commit exacto, más `acciones-economia.ts` por la nota de revisión de la tarea 4):
- `apps/atlas/src/lib/db/rentabilidad.ts` — `margenDe`.
- `apps/atlas/src/components/dinero/ResumenMargen.tsx` — nuevo, componente de servidor.
- `apps/atlas/src/app/clientes/[slug]/page.tsx` y `apps/atlas/src/app/proyectos/[slug]/page.tsx` — montaje gated por `verImportes`.
- `apps/atlas/src/lib/db/acciones-economia.ts` — `revalidatePath("/clientes", "layout")` y `revalidatePath("/proyectos", "layout")` añadidos a `guardarAjustesEconomia`, `cerrarMesAccion` y `reabrirMesAccion`.
- `apps/atlas/src/tests/db/rentabilidad.test.ts` — `describe("margenDe")` con 3 casos, insertado entre `describe("rentabilidadDelMes")` y `describe("cierres")`.
- `apps/atlas/README.md` y `apps/atlas/MANTENIMIENTO.md` — documentación.

**No se tocaron** `src/lib/rentabilidad/margen.ts`, `src/tests/rentabilidad/margen.test.ts` ni `src/app/dinero/rentabilidad/page.tsx` (confirmado en `git status` antes y después del commit: sin cambios).

**Dudas:** ninguna. Un detalle a vuestro criterio: en `acciones-economia.ts` añadí un comentario de una línea en cada una de las tres funciones (en vez de uno solo compartido), porque cada llamada a `revalidatePath` está en un sitio distinto del fichero — si preferís un único comentario más arriba, es un cambio trivial.
