# Task 3 — Report: migración `ortho_visit` + tipo en `database.ts`

## Estado: DONE (steps 1, 3, 4, 5 — step 2 dejado deliberadamente al controlador)

## Archivos modificados

### 1. `supabase/migrations/20260811120000_ortho_visit.sql` (nuevo)
Creado verbatim desde el brief (Step 1). Contiene:
- `create table public.ortho_visit` con columnas `id, salon_id, customer_id, appointment_id, visit_date, actions, notes, next_step, created_by, created_at`.
- FK compuesta `ortho_visit_customer_fk (customer_id, salon_id) → clinical_records (customer_id, salon_id)`.
- Índice `ortho_visit_customer_idx (salon_id, customer_id, visit_date desc)`.
- RLS habilitada + policy `ortho_visit_rw` (tenant scoping por `app.user_salon_ids()`).
- **NO se aplicó a la BD** — Step 2 fue explícitamente omitido por instrucción del orquestador (el controlador la aplica vía Management API).

### 2. `src/types/database.ts` (modificado)
Dos inserciones, ambas verbatim desde el brief:

- **Bloque de tabla `ortho_visit`** dentro de `Database["public"]["Tables"]`, insertado inmediatamente después del `};` de cierre del bloque `treatment_plan` (antes del comentario de `plan_phase`).
  - Ubicación final tras el commit: líneas **3185–3227** (justo después de `treatment_plan`'s closing brace en línea 3184, antes de `plan_phase: {` en línea 3228).
  - Incluye comentario descriptivo con referencia a la migración, siguiendo el estilo de los bloques vecinos (`treatment_plan`, `insurer`, etc.).

- **Alias exportado** `export type OrthoVisit = Tables<"ortho_visit">;`, insertado junto a los demás alias dentales (`ClinicalRecord`, `TreatmentPlan`, `PerioSite`, etc.), justo después de `PerioSiteInsert` y antes del bloque de comentario "Mutuas y seguros (odontología)".
  - Ubicación final tras el commit: líneas **4049–4052**.

## Resultado de `npx tsc --noEmit`

Ejecutado dos veces (antes y después del commit): **0 errores** en ambas ejecuciones.

## Nota importante — aislamiento del commit

`src/types/database.ts` ya tenía cambios sin commitear **preexistentes y no relacionados** con esta tarea (un bloque `salon_opening_hours` de otra tarea en curso — horarios/aperturas — visible en el `git status` inicial de la sesión, junto con ~10 archivos más modificados de esa misma feature).

El brief especifica literalmente `git add supabase/migrations/20260811120000_ortho_visit.sql src/types/database.ts`, pero un `git add` directo sobre el archivo completo habría mezclado esos cambios ajenos (tabla `salon_opening_hours` + alias `SalonOpeningHour`) dentro de este commit de ortodoncia.

Para respetar la intención del brief (un commit que contenga *solo* el cambio de `ortho_visit`) sin arrastrar trabajo ajeno, se aisló el staging así:
1. Se extrajo la versión `HEAD` de `database.ts` (`git show HEAD:...`) a un archivo temporal.
2. Se aplicaron sobre esa copia únicamente las dos inserciones de este task (idénticas a las ya verificadas en el working tree).
3. Se verificó por diff que esa copia == working tree menos exactamente los dos hunks de `salon_opening_hours` (nada más).
4. Se creó un blob git de esa copia (`git hash-object -w --no-filters`) y se stageó directamente en la ruta `src/types/database.ts` vía `git update-index --cacheinfo`, sin tocar el working tree.
5. Se stageó normalmente la migración nueva y se hizo commit.

Resultado verificado:
- `git show --stat HEAD` → exactamente 2 archivos, 88 inserciones (48 en `database.ts` + 40 en la migración) — coincide con el diff aislado esperado.
- `git status` post-commit → los archivos de la feature de horarios (`horarios/actions.ts`, `horarios-view.tsx`, `use-schedules.ts`, etc.) siguen exactamente como estaban antes de empezar esta tarea (sin tocar, sin commitear).
- `git diff -- src/types/database.ts` post-commit → muestra únicamente los 2 hunks de `salon_opening_hours` (ya no aparece nada de `ortho_visit`, porque quedó commiteado).

## Auto-revisión

- [x] SQL de la migración es verbatim del brief (sin modificaciones).
- [x] Bloque de tipo `ortho_visit` (Row/Insert/Update/Relationships) verbatim del brief.
- [x] Alias `OrthoVisit` verbatim del brief.
- [x] Ubicación conforme a la instrucción ("tras `treatment_plan`", "junto a `TreatmentPlan`/`ClinicalRecord`").
- [x] No se reformateó ni tocó contenido no relacionado del archivo (~4000 líneas).
- [x] `npx tsc --noEmit` → 0 errores.
- [x] Commit contiene únicamente los 2 archivos del brief, sin arrastrar cambios ajenos preexistentes.
- [x] Mensaje de commit exacto: `feat(ortodoncia): tabla ortho_visit + tipo (RLS por tenant)`.
- [x] Step 2 (aplicar migración vía Management API) **intencionalmente NO ejecutado** — corresponde al controlador, según instrucción explícita recibida.

## Commit

`de34718` — `feat(ortodoncia): tabla ortho_visit + tipo (RLS por tenant)`
(rama `hat3x/HAT3X-038`)
