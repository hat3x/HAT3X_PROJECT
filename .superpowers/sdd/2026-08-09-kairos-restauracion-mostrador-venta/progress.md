# SDD ledger — plan: docs/superpowers/plans/2026-08-09-kairos-restauracion-mostrador-venta.md
Task 1: minor (deferido): alias OrderInsert/OrderItemInsert extra (consistentes con estilo repo).
Task 1: complete (commit ad2c14f, review clean; 1 minor deferido).
Task 2: complete (commit 80d3874, review clean).
Task 3: complete (commit a9c110d, review clean).
Task 4: implementado (commit e263ac1) — review SPEC ✅, 1 Important + 2 Minor.
Task 4: fix round 1/5 — (Important) gatear voidOrderItem por order.status='abierta'; (Minor) createOrder idempotente robusto (catch unique 23505 -> re-fetch); (Minor) rechazar anular una anulacion (item ya status='anulado') (en curso).
Task 4: fix round 1/5 (3 addressed: gate void + idempotencia 23505 + no-double-void; commit 69a89b8).
Task 4: CROSS-TASK gap (controlador): voidOrderItem inserta fila de anulacion pero NO marca el ORIGINAL como anulado -> settleOrder (Task 6, filtra status!=anulado) lo cobraria. Fix round 2: voidOrderItem tambien UPDATE original.status='anulado' (cierra ademas doble-anulado del mismo original).
Task 4: fix round 2/5 (1 addressed: original marcado anulado -> excluido del cobro; commit 31cee5b).
Task 4: complete (commits e263ac1 + 69a89b8 + 31cee5b, review clean).
Task 5: minor (deferido): setOrderItemStatus sin validacion de transicion legal from->to (solo guarda de concurrencia; brief no lo pide).
Task 5: complete (commit 75787bd, review clean; 1 minor deferido).
Task 6: implementado (commit 6f460c6) — review SPEC ✅. CALIDAD: 1 Critical (sin cobertura de pagos) + 1 Important (idempotencia sin backstop BD: pos_sales.order_id sin unique) + 2 Minor (gate settle por abierta; rollback si falla update orders.status). Mock supabase-mock.ts extendido = aditivo (verificado).
Task 6: fix round 1/5 — (Critical) assertTendersCoverTotal antes de cobrar + amountCents>0; (Important) migracion indice unico parcial pos_sales(order_id) + catch 23505 re-fetch idempotente; (Minor) gate settle por status='abierta'; (Minor) rollback si falla update orders.status (en curso).
Task 6: fix round 1/5 (4 addressed: cobertura pagos Critical, idempotencia BD+23505 Important, gate abierta, rollback status; commit fc40223).
Task 6: complete (commits 6f460c6 + fc40223, review clean).
Task 7: complete (commit 8fa60a6, review clean).
Task 8: implementado (commit f3b8098) — review SPEC ✅. Cobertura de pagos OK. CALIDAD: 2 Important (race al cambiar de cuenta; tender fantasma 0€) + testing gap en payment-sheet + 4 minor.
Task 8: minor (deferido): use-menu keys ad-hoc (no via factory); payment-sheet casi-duplicado de payment-dialog; error state no se limpia al cerrar sheet; total=0 nunca confirmable.
Task 8: fix round 1/5 — (Important) limpiar items/pendingIds sincrono al seleccionar otra cuenta; (Important) filtrar tenders 0€ antes de onConfirm; + test de payment-sheet (cobertura/cambio) y del clear al cambiar de cuenta (en curso).
Task 8: fix round 1/5 (2 addressed: race al cambiar de cuenta + tender fantasma 0€; commit 0b1d270).
Task 8: complete (commits f3b8098 + 0b1d270, review clean; 4 minor deferidos).
Task 9: complete (commit d963ce7, review clean).
PLAN B: 9 tareas construidas y revisadas (52b86aa..d963ce7). Siguiente: revision final de rama.
FINAL REVIEW (opus): LISTA PARA MERGE tras 1 fix barato. Nucleo financiero (settleOrder) + anulacion append-only CORRECTOS end-to-end. Sin cobro erroneo/duplicado en uso normal. Idempotencia en capas, cobertura exacta, arqueo cuadra, aislamiento multi-tenant verificado.
FINAL: Important A1 (a arreglar) — setOrderItemStatus permite from/to='anulado' -> resucita una linea anulada y la re-cobraria; LATENTE (sin UI que lo invoque) pero action publica. Fix: rechazar transiciones con from/to=='anulado' (anulado terminal, solo voidOrderItem lo fija).
FINAL: minors follow-up: A2 (pay-first fallo parcial deja items + retry 23505), A3 (doble-clic puede crear 2 pedidos), A4 (total desajuste bajo anulacion concurrente, fail-closed).
FINAL: fix wave (A1 guard anulado) en curso.
FINAL: fix wave 1/1 (A1 addressed: anulado terminal; commit d3ccdbc).
PLAN B COMPLETO: revision final limpia, sin bloqueantes. Suite 1866 verde, typecheck 0. Commits ad2c14f..d3ccdbc en hat3x/HAT3X-038. Migraciones aplicadas en prod. NO desplegado a Vercel.
