# SDD ledger — plan: docs/superpowers/plans/2026-08-09-kairos-restauracion-kds.md
Task 1: complete (commit 0adf4ce, review clean).
Task 2: complete (commit 3289f72, review clean).
Task 3: complete (commit d037b8c, review clean).
Task 4: implementado (commit 38b00d2) — review SPEC ✅. 2 Important (KDS no refresca por invalidacion directa, solo Realtime; groupByStation embebido sin test) + 3 Minor.
Task 4: minor (deferido): LiveIndicator duplica RealtimeIndicator; sin useMemo en agrupaciones (recalculo cada 30s, aceptable).
Task 4: fix round 1/5 — invalidar kdsKeys.all en onSuccess de Entregar/Entregado; mover groupByStation a src/lib/restauracion/kds.ts (puro) + test (incluye 'Sin estacion'); tipar KdsItem.status como OrderItemStatus (quitar cast) (en curso).
Task 4: fix round 1/5 (3 addressed: kdsKeys invalidacion + groupKdsItemsByStation puro + status tipado; commit 4958acb).
Task 4: complete (commits 38b00d2 + 4958acb, review clean; 2 minor deferidos: LiveIndicator dup, useMemo).
Task 5: complete (commit 9e02d3f, review clean).
PLAN C: 5 tareas construidas y revisadas (d3ccdbc..9e02d3f). Siguiente: revision final de rama.
FINAL REVIEW (opus): LISTA PARA MERGE, sin bloqueantes. Coherencia end-to-end OK (Mandar->columna correcta en cocina), Realtime bien construido + aislado por salon, transiciones correctas+concurrencia-segura, autorizacion server-side. Todos los hallazgos Minor/cosmeticos.
FINAL: minors follow-up (no bloquean): sin toast en CONFLICTO; sin refetchInterval de respaldo si Realtime cae; copy 'Entregar'->listo (intencional, labels de 100M); rama muerta inofensiva en station-column; LiveIndicator 3a copia de RealtimeIndicator; sin useMemo en agrupaciones.
PLAN C COMPLETO: revision final limpia. Suite 1875 verde, typecheck 0. Commits 0adf4ce..9e02d3f en hat3x/HAT3X-038. Migracion Realtime aplicada. SUB-PROYECTO 1 (Carta+Mostrador+KDS) COMPLETO.
