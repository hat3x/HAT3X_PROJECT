# SDD ledger — plan: docs/superpowers/plans/2026-08-09-kairos-restauracion-carta-backoffice.md
Task 1: implementado (commit eb679f3, repo anidado hat3x/HAT3X-038) — review SPEC ❌ Critical: el commit de database.ts arrastro tipos de 3 tablas (time_clock/clinical_history/billing_history) del trabajo Biodental SIN COMMITEAR (~34 ficheros vivos en Vercel pero no en git). BLOQUEADO: consultar a Jose como limpiar el arbol antes de seguir (Tasks 2/3 tambien editan database.ts).
Task 1: repo resuelto — trabajo Biodental comiteado aparte (b75baca, 35 ficheros). Arbol limpio.
Task 1: parked (Critical contaminacion database.ts en eb679f3) — ruling: Jose acepta el commit como esta; los 3 tipos (time_clock/clinical_history/billing_history) son validos, sus tablas comiteadas en b75baca.
Task 1: parked (Important idempotencia constraints/triggers en 20260809120000) — ruling: corre en una sola transaccion y ya esta aplicada; guardas IF NOT EXISTS solo importarian para re-runs que no hacemos.
Task 1: fix round 1/5 — anadir indices FK products(category_id/station_id) via migracion 20260809120500 (en curso).
Task 1: fix round 1/5 (1 addressed [indices FK], 0 open; commit 75f044f).
Task 1: complete (commits eb679f3 + 75f044f, review clean; 2 parked con ruling: contaminacion database.ts [Jose acepta], idempotencia base [aplicada en 1 tx]).
Task 2: complete (commit 202480b, review clean).
Task 3: complete (commit 587c244, review clean).
Task 4: complete (commit de655d7, review clean).
Task 5: complete (commit 28eef16, review clean).
Task 6: implementado (commit df322aa) — review SPEC ✅, CALIDAD 1 Important + 2 Minor.
Task 6: minor (deferido): saveModifierGroupSchema duplica modifierGroupSchema (riesgo de desincronizacion) — cosmetico.
Task 6: minor (deferido): borra+inserta no transaccional en saveModifierGroup/setProductModifierGroups/saveCombo (recurso sin hijos si falla insert tras delete) — consecuencia del diseno sin RPC del brief; bajo riesgo (edicion de carta, manager-only); candidato a RPC en Plan B.
Task 6: fix round 1/5 — anadir pre-validacion de pertenencia al salon en setProductModifierGroups/saveCombo (paridad con ajustes/personal assertXInSalon, errores en espanol) (en curso).
Task 6: fix round 1/5 (1 addressed [pre-validacion pertenencia], 0 open; commit 10dcf3e).
Task 6: complete (commits df322aa + 10dcf3e, review clean; 2 minor deferidos: schema duplicado, borra+inserta no transaccional).
Task 7: implementado (commit 94060bc) — review SPEC ✅, 1 Important + 3 Minor.
Task 7: minor (deferido): nombres de categoria/estacion del CSV sin validar longitud (varchar 120 error crudo).
Task 7: minor (deferido): matching de nombres case-sensitive → posibles duplicados (bebidas vs Bebidas); heredado de createCategory.
Task 7: minor (deferido): importMenuCsv sin test propio (solo parseMenuCsv testeado); el contrato ok:false-ante-errores va sin verificar.
Task 7: fix round 1/5 — revalidatePath('/carta') debe ejecutarse aunque se cree algo y luego falle (UI stale) (en curso).
Task 7: fix round 1/5 (1 addressed [revalidatePath try/finally], 0 open; commit 65d207d).
Task 7: complete (commits 94060bc + 65d207d, review clean; 3 minor deferidos).
Task 8: implementado (commit d122b04) — review SPEC ✅, 1 Important + 2 Minor. Suite 1827 verde.
Task 8: PARKED (Important carta-view.tsx 985 lineas) — ruling: reviewer lo marca no-bloqueante y recomienda refactor separado; sin duplicacion ni acoplamiento oculto (confirmado); NO hay test de render de carta-view -> partirlo al final anade riesgo de regresion sin cobertura. DEFERIDO a tarea de refactor propia (shell + categories/products/modifiers/combos-section). Para revision final.
Task 8: minor (deferido): ProductModifierGroupsDialog sin key={product.id} (inofensivo, modal).
Task 8: minor (deferido): falta borrar grupo de modificadores (requiere Server Action nueva, fuera de alcance UI).
Task 8: complete (commit d122b04, review clean; 1 Important parkeado + 2 minor deferidos).
Task 9: complete (commits 18f8d9d + 71bfd9b, review clean; 2 tests preexistentes actualizados legitimamente; 1 minor nav-restructure benigno).
FINAL REVIEW (opus): LISTA PARA MERGE tras arreglo trivial. Sin bloqueantes. Coherencia end-to-end OK, seguridad multi-tenant solida (5 tablas RLS+guardian, 12 actions+importador acotados por salon_id, /carta defendido en 3 capas), contratos entre tareas sin fragilidad.
FINAL: Important (a arreglar) — input type=number con decimal en coma -> campo en blanco al EDITAR (menu-item-form.tsx:161 precio, modifier-group-form.tsx:196 delta). Fix: input texto + inputMode=decimal (patron product-form.tsx:130).
FINAL: nuevos minors -> follow-up: combo_components sin CHECK anti-autorreferencia/unique; sin renombrar categoria/estacion en UI (hooks update existen, no cableados); key={index} en listas de ComboEditor/ModifierGroupForm.
FINAL: triaje diferidos -> TODOS follow-up aceptable (carta-view split, schema dup, borra+inserta no-transaccional, CSV longitud/case/test, dialog key, delete modifier group). importMenuCsv sin test: follow-up recomendado.
FINAL: fix wave (1 Important) en curso.
FINAL: fix wave 1/1 (1 addressed [precio inputMode decimal], 0 open; commit 52b86aa).
PLAN A COMPLETO: revision final limpia, sin bloqueantes. Suite 1830 verde, typecheck 0. Todos los commits en repo anidado hat3x/HAT3X-038. Migraciones aplicadas en prod (jztoyekixcziaicrnlce). NO desplegado a Vercel aun.
