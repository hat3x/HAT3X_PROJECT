# SDD ledger — plan: docs/superpowers/plans/2026-08-11-modulo-ortodoncia-fase2-economico.md

Branch: hat3x/HAT3X-038 (working branch, no worktree).
Pre-flight scan: limpio (Task 7 obliga a invocar ui-ux-pro-max; Task 3 usa cast a Json para el jsonb de la RPC — plan-mandated).

Task 1: complete (commits 0fc81d8..0e31b9d, review clean)
Task 1: minor (deferred): sin guarda n<=0 en computeInstallmentSchedule; el Zod de Task 2 valida installmentCount>=1
Task 2: complete (commits 0e31b9d..b8023fa, review clean)
Task 2: minor (deferred): regex startDate no valida validez calendarica (del brief)
Task 3: complete (commits b8023fa..a52ba4d, review clean)
Task 3: PENDIENTE OPS: migracion 20260811130000_ortho_payments NO aplicada a la BD (sin token). Aplicar via SQL editor (usuario) antes del deploy (Task 9). NO bloquea Tasks 4-8.
Task 4: complete (commits a52ba4d..4415a6b, review clean)
Task 5: complete (commits 4415a6b..26f5222, review clean)
Task 5: minor (deferred): updates de pay/unpay sin guarda de estado (.eq status) — patron del repo (sibling actions.ts); no-op inofensivo pero superficie de dinero, revisar en hardening
Task 5: minor (deferred): pay/unpay/cancel sin test propio (dentro del scope del brief)
Task 6: complete (commits 26f5222..9c493f8, review clean)
Task 7: fix round 1/5 (3 addressed, 0 open — cancel error silenciado / error cobro obsoleto / autocierre por refetch; commits 3b2d3c9..ab6e71a)
Task 7: complete (commits 9c493f8..ab6e71a, review clean tras fix)
Task 7: minor (deferred): sin walkthrough visual autenticado (no hay login en el entorno); verificar en kairosmanager.app tras deploy
Task 8: complete (commits ab6e71a..e5e41c2, review clean)
Task 8: minor (deferred): dayCustomerIds sin useMemo (negligible); badge emoji sin aria-hidden (cosmetico)
Task 8: NOTA: commit e5e41c2 arrastro la feature previa 'editar notas' (no aislada); actions.ts + use-appointments.ts siguen sin commitear en el arbol.
OUT-OF-SCOPE (feature notas, preexistente): 'Anadir nota' hover roto (falta clase group en el div padre) — bug real de la feature de notas, NO de Fase 2; arreglar en follow-up.
Task 9: verificacion OK — tsc 0, suite 1946 verde, build OK.
Task 9: DEPLOY BLOQUEADO hasta que el usuario aplique la migracion 20260811130000_ortho_payments (REST 404 confirmado: tabla no existe).
Task 3: OPS RESUELTO: migracion ortho_payments aplicada por el usuario; verificada HTTP 200 (ambas tablas).
Task 9: complete — deploy READY en kairosmanager.app (dpl_5HnsXrCk8akH27dtttuCUZgtfTTj).
FASE 2 ECONOMICO COMPLETA Y DESPLEGADA. Review final por subagente: pendiente de decision del usuario.
REVIEW FINAL (opus, c719523..e5e41c2): 0 Critical, 2 Important + minors. Verdict: With fixes.
  - Important #1: plan cancelado seguia marcando moroso (fetchOverdueOrthoCounts sin filtrar plan activo).
  - Important #2: clave de overdue sin todayIso + corte al dia visualizado en vez de hoy real.
  - Build integrity: feature notas a medio commitear (appointments-view usaba useUpdateAppointmentNotes sin hook/action commiteados) -> commiteado b12b3c2.
FIX WAVE (b12b3c2..ef0729f): 3 fixes (morosidad planes activos [2 queries] + hoy real + clave con fecha + 23505). Re-review: ADDRESSED, sin rotura. tsc 0, 11/11 ortho tests.
minor (deferred): mutations no invalidan orthoPaymentKeys.overdue -> agenda quita moroso en siguiente refetch (paginas distintas).
