# Task 3 — Migración combos — Informe

## STATUS: DONE

## Resumen

Implementada, con TDD estricto y en el orden indicado por el brief, la tabla de
combos del backoffice de carta (Kairos, sector restauración): `combo_components`,
que vincula un producto combo (`products.is_combo = true`) con sus piezas y permite
el ruteo por pieza a una estación distinta de la del producto (comida→cocina,
bebida→barra).

## Pasos ejecutados

1. **Test (falla ENOENT)** — Creado `src/tests/unit/restauracion-combos-sql.test.ts`
   (transcripción exacta del brief). Ejecutado `npm test -- restauracion-combos-sql`:
   falló con `ENOENT` sobre el `.sql` inexistente, como se esperaba.
2. **Migración** — Creado
   `supabase/migrations/20260809122000_restauracion_combos.sql` (transcripción exacta
   del brief): tabla `combo_components` con clave compuesta `(id, salon_id)`
   (`combo_components_id_salon_key`), tres FKs de dominio compuestas
   (`combo_components_combo_fkey` → `products(id, salon_id)` on delete cascade,
   `combo_components_component_fkey` → `products(id, salon_id)` on delete cascade,
   `combo_components_station_fkey` → `stations(id, salon_id)` on delete set null),
   `qty integer not null default 1 check (qty > 0)`, `station_id_override` nullable
   para el ruteo por pieza, RLS (lectura miembros vía `app.user_salon_ids()`, gestión
   owner/manager vía `app.has_salon_role(...)`) y bloque guardián `do $guard$` que
   verifica ≥4 políticas creadas.
3. **Test (pasa)** — `npm test -- restauracion-combos-sql`: **3/3 tests PASS**.
   También se corrió `npm test -- restauracion` (incluye Tasks 1 y 2): **4 ficheros /
   13 tests PASS** — sin regresiones sobre `menu_categories`/`stations`/modificadores.
4. **Tipos** — Añadida en `src/types/database.ts` la entrada `combo_components`
   (Row/Insert/Update/Relationships, con las 3 Relationships FK compuestas hacia
   `products` ×2 y `stations`), insertada justo después del bloque
   `product_modifier_groups` y antes de `stock_movement` (mismo patrón usado en
   Tasks 1-2). Alias `ComboComponent` añadido junto a `ModifierGroup` /
   `ProductModifierGroup`.
5. **Aplicación a BD real** — Ejecutado el script de Management API indicado en el
   brief desde la raíz del repo. Resultado: **`(201, [])`** — aplicada sin errores en
   un único intento.
6. **Typecheck** — `npm run typecheck` (`tsc --noEmit`) desde
   `clients/projects/salon-os`: **exit 0**, sin errores.
7. **Commit** — Commit por pathspec explícito, únicamente los 3 ficheros de esta
   tarea (migración, test, `database.ts`). `.claude/` quedó intacto y untracked, sin
   arrastrar nada ajeno. Verificado `git status` post-commit: árbol limpio salvo
   `.claude/` untracked.

## Commit

- Hash: `587c244`
- Rama: `hat3x/HAT3X-038` (repo anidado `clients/projects/salon-os`, sin remoto)
- Mensaje: `feat(restauracion): combos — piezas con ruteo por estación`
- Ficheros: `supabase/migrations/20260809122000_restauracion_combos.sql`,
  `src/tests/unit/restauracion-combos-sql.test.ts`, `src/types/database.ts`

## Resultados de tests

- `restauracion-combos-sql.test.ts`: 3/3 PASS.
- `restauracion` (suite completa, incluye Tasks 1-2): 4 ficheros / 13 tests PASS.
- `typecheck`: exit 0.
- Migración en BD real (Management API): `(201, [])`.

## Preocupaciones

Ninguna. TDD respetado en el orden exacto del brief (test falla → migración → test
pasa → tipos → aplicar → typecheck → commit), SQL y test transcritos verbatim del
brief, migración aplicada con éxito a la BD real en un único intento (no fue
necesario limpiar por fallo parcial), y el commit no arrastró ficheros ajenos.
