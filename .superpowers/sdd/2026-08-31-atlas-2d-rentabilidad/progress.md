# SDD ledger — plan: docs/superpowers/plans/2026-08-31-atlas-2d-rentabilidad.md

Spec: docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md (§4.8, §6.3, §8, decisiones 7/8, §13).
Rama: feature/atlas. Briefs extraídos a mano por «Tarea N».

## Barrido previo

| Par | Produce / consume | Hallazgo |
|---|---|---|
| T1 ↔ T3 | RLS `for all` propietario / tests: colab select [] e insert RLS error; leerAjustes lanza sin fila | coherente |
| T2 ↔ T3 | `minutosDe(t, ahoraMs)`, `limitesMesMadrid`, `mesVecino` / rentabilidad.ts | **Defecto corregido antes de extraer**: `hastaDia` usaba `.hasta.slice(0,7)`, que da el mismo mes (hasta = día 31 T22:00Z). Ahora `mesVecino(mes,1)`. |
| T2 ↔ T5/T6 | `FilaMargen`, `Linea`, `Rentabilidad` / pantalla y ResumenMargen | firmas coinciden |
| T3 ↔ T4/T5 | `EntradaAjustes`, acciones cerrar/reabrir | coinciden |
| T3 ↔ T6 | `margenDe` reutiliza `rentabilidadDelMes` | coherente |

| Tarea | Consistencia interna | Hallazgo |
|---|---|---|
| T2 | aritmética de los tests | comprobada a mano: Bio 24170, Kairos 500, total 24230, cuadre por ambos ejes ✓; `costeDeMinutos(7,3333)`=389 ✓ |
| T3 | test de cierre | AHORA en 2090-05: cerrar 2090-05 → error, 2090-03 → ok ✓ |
| T4 | `toHaveValue("30,00")` | defaultValue de texto ✓; depende de que `aCentimos` admita coma (2A lo usa en formularios) |
| T5 | `searchParams.mes!` | Ruling 1: sin `!`; guardar el parámetro en una variable y comprobarla |
| T6 | fichas | importan `mesDe`, `hoyEnMadrid`, `margenDe` |

Ruling 1 (T5): ningún `!` nuevo; el parámetro `mes` se valida en una variable local.

## Tarea 1
- BASE: 7e30ec8
- Implementada por a70725ffaa7a0574a. Commit 8448ef4. 5/5 dos corridas; suite 722/722; tsc 0.
- PAUSA pedida por el usuario («para un momento»). Al retomar: empaquetar 7e30ec8..8448ef4 y despachar la revisión de la tarea 1.
- Reanudado («sigue»). Revisión de la tarea 1 en marcha.

## Tarea 2
- BASE: 8448ef4 (en paralelo con la revisión de la 1; ficheros disjuntos)
- Tarea 1: revisión — cumplimiento ✅, calidad aprobada, 2 Menores archivados (Ruling 2: la fila única compartida entre ficheros de test es una asunción del diseño; la tarea 3 restaura coste_hora en afterAll. La reaplicación de la migración sigue la convención del repo).
- Tarea 1: complete (commit 8448ef4).
- Tarea 2: el implementador a0518ef74e5ca49e6 se cortó por límite de sesión (429) a mitad; se reanuda («puedes seguir»).
- Tarea 2: implementada (reanudada). Commit b462aaa. Suite 736/736, tsc 0. Cuadre: opción 1.

## Tarea 3
- BASE: b462aaa (en paralelo con la revisión de la 2; ficheros disjuntos)
- Tarea 2: revisión — cumplimiento ✅, 1 Menor (total.horasCentimos con redondeo único puede diferir 1-2 cts de la suma de filas). Ruling 3: se cambia a la opción 2 —el total de horas es la suma de filas y líneas— porque la pantalla enseña filas y total juntos y un total que no cuadra con sus filas parece un error aunque no lo sea; con test de minutos no múltiplos de 60. Ronda 1/5.
- Tarea 3: implementada por a7890c1a08d9b696b. Commit 8090ff5. 9/9 dos corridas; suite 745/745; tsc 0. proyectoNombre de línea resuelto con nombresDeProyectos+Map. Revisión en marcha.

## Tarea 4
- BASE: 8090ff5 (en paralelo con la ronda de la 2 y la revisión de la 3; ficheros disjuntos)
- Tarea 2: fix round 1/5 (a0f3b19, cuadre por suma de filas, 11/11). Tarea 4: implementada por af6bf2b74ac82be20 (c2e1d2a; suite 749/749, tsc 0). HEAD c2e1d2a. Re-revisión 2, revisión 3 y revisión 4 en marcha.

## Tarea 5
- BASE: c2e1d2a
- Tarea 2: re-revisión ADDRESSED. complete (b462aaa, a0f3b19).
- Tarea 3: revisión — cumplimiento ✅; 1 Importante (cerrarMes usa el mes UTC y el resto corta en Madrid: entre 00:00 y 02:00 del día 1 no deja cerrar el mes recién terminado) + 2 Menores (costeOriginal capturable ya corrompido tras una corrida cortada; comentario «200 en un mes» debe decir «200 en total»). Ruling 4: el Importante y el comentario se arreglan; el Menor de costeOriginal SE ARCHIVA (solo afecta a la base local y se cura con reset; no hay mitigación barata).
- Tarea 4: revisión — cumplimiento ✅; 1 Importante (cerrarMesAccion acepta el coste desde la red: una pestaña vieja congela un coste desactualizado). Ruling 5: la acción lee el coste con leerAjustes en el servidor y deja de aceptarlo por parámetro; cerrarMes(sb, mes, coste, ahora) se queda como está para poder probarse; BotonCierreMes deja de pasar el coste. Ronda conjunta 3+4 (1/5) con el agente de la 3.
- Tarea 5: implementada por a58b4089c82bddb70. Commit d38892a. Suite 749/749, build ok, tsc 0. Revisión pendiente.
- Tarea 5: revisión — cumplimiento ✅; 2 Importantes (KPI «Horas» enseña euros; la tabla por proyecto no cuadra a la vista porque el facturado sin proyecto no aparece) + 3 Menores (estructura repetida sin nota; fila «sin repartir» oculta si solo tiene minutos con coste 0; array de KPIs sin tipar). Ruling 6: `calcularMargen` expone `facturadoSinProyectoCentimos` y la tabla de proyectos pinta una fila «Sin proyecto» con él, para que cuadre a la vista como la de clientes. Ronda 1/5 con los cinco, DESPUÉS de que entre la ronda 3+4 (comparten page.tsx).
- Ronda 3+4 (1/5): commit a6e6351 (mesEnMadrid; comentario 200 en total; acción lee el coste en servidor). 10/10 x2, suite 750/750, tsc 0. El agente corrigió mi instante de prueba (00:30Z ya es junio en ambas zonas → usó 22:30Z del 31). Re-revisión en marcha; ronda de la 5 despachada.
- Ronda 3+4: re-revisión 3/3 ADDRESSED. Tarea 3 complete (8090ff5, a6e6351). Tarea 4 complete (c2e1d2a, a6e6351).

## Tarea 6
- BASE: a6e6351 (en paralelo con la ronda de la 5; ficheros disjuntos)
- Tarea 5: fix round 1/5 (e8b55ef). Tarea 6: implementada por a236b1e6b8be9685f (60640bd; suite 753/753, build ok, tsc 0; 5 fallos transitorios en fichajes.test.ts por dos agentes corriendo la suite contra la misma base a la vez — no es defecto de código). HEAD 60640bd. Re-revisión 5 y revisión 6 en marcha.
- Tarea 5: re-revisión 5/5 ADDRESSED. complete (d38892a, e8b55ef).
- Tarea 6: revisión — cumplimiento ✅, calidad aprobada, 1 Menor archivado (margenDe recalcula el mes: aceptable con cinco clientes; el brief lo pedía así). complete (60640bd).

## Revisión final de la rama
- Rango: 7e30ec8..60640bd
- Revisión final: diseño cubierto con dos huecos; calidad aprobada con reservas. 3 Importantes, 6 Menores.
Ruling 7 (I1): se arregla ahora: `listarFacturas` gana `{desde, hasta}` por `fecha_emision` (mismo patrón que listarGastos) y `rentabilidadDelMes` lo usa. Es el único camino por el que un mes cerrado cambia sin que nadie toque nada, y además cada ficha traía 200 facturas con líneas. Coste si me equivoco: un cambio pequeño en un módulo del 2A, con su test.
Ruling 8 (I2): etiquetas «(base)» en ResumenMargen y una frase en /dinero diciendo que allí son totales (caja) y en Rentabilidad bases (margen).
Ruling 9 (I3): el test de esquema deja de exigir coste 0: afirma una fila y coste >= 0. Revoca en parte el archivo del Ruling 2/4: el alcance del estado compartido era mayor.
Ruling 10 (M1, Ruling 6 revisado): `Linea` gana `facturadoCentimos` (0 en sinCliente y estructura); `sinProyecto.facturadoCentimos` sustituye a `facturadoSinProyectoCentimos`; la tabla de proyectos pinta UNA fila «De clientes sin proyecto» con facturado, gastos y minutos. Tests ajustados.
Ruling 11 (M3, M4): `cerrarMes`/`reabrirMes` validan `AAAA-MM` con la misma expresión; los controles de la pantalla solo para `mes < mesActual`.
Ruling 12 (M2): SE ARCHIVA. `resumen-dinero.ts` necesita `hasta` inclusivo por día y `rentabilidad.ts` exclusivo; unificarlo es un refactor del 2A sin ganancia funcional. Se documenta en el comentario de `rentabilidad.ts`. M5 se cura con I1. M6 es el patrón heredado del 2A.
Ruling 13 (hueco §8 facturas en ficha): SE APARCA para 2E, donde la factura se emite desde Atlas y la ficha recibe su lista con acciones; hoy sería una tabla de lectura sin nada que hacer sobre ella. Puntero para el plan 2E.
Ruling 14 (§4.8): lo que SÍ mueve un mes cerrado (gasto/factura/tramo con fecha atrasada) se documenta en MANTENIMIENTO; avisar en los formularios queda para 2E.
- Ronda final de arreglos: despachada.
- Ronda final: commit 84123db (acf4ec4619293dcb3). Suite 755/755, build ok, tsc 0. Re-revisión acotada pendiente.
- Re-revisión de la ronda final: 7/7 ADDRESSED, sin roturas (nota: un `!` preexistente en facturas.ts:74 del 2A, no de esta rama). RAMA LIMPIA.
- Plan 2D completo: 7e30ec8..84123db, 10 commits, suite 755/755, build ok, tsc 0. Aparcado: unificar cortes de mes (M2), facturas en la ficha (→2E), avisos de mes cerrado en formularios (→2E).
