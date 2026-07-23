# Verificación final del entregable — Facturación y Analítica (sub-17)

**Fecha:** 2026-07-23 · **Rama:** `hat3x/HAT3X-033` · **Agente:** pm-testing

Gate de cierre de la fase de **Facturación + Analítica**. Toda afirmación de este
documento va acompañada de la evidencia del comando que la respalda (ejecutados
frescos en esta verificación, no reutilizados).

---

## 1. Resultado de los tres gates

| Gate | Comando | Resultado | Exit |
|---|---|---|---|
| Tipos | `npx tsc --noEmit` | **Limpio, sin errores** | `0` |
| Tests | `npx vitest run` | **75 archivos · 1107 tests · 0 fallos** | `0` |
| Build | `npm run build` | **Compila; todas las rutas generadas** | `0` |

### Evidencia — Tipos
```
$ npx tsc --noEmit
TSC_EXIT_CODE=0
```

### Evidencia — Tests
```
$ npx vitest run
 Test Files  75 passed (75)
      Tests  1107 passed (1107)
   Duration  11.17s
VITEST_PIPESTATUS=0
```
El objetivo pedía «844 previos + nuevos en verde». El total actual (1107)
supera holgadamente ese baseline y pasa completo, sin fallos ni tests omitidos.

### Evidencia — Build
```
$ npm run build
... (route table completa: /tpv, /facturacion/*, /analitica, /reservar/[slug],
     /ajustes/fiscal, /api/facturacion/*, /api/reception/*, /dashboard ...)
BUILD_PIPESTATUS=0
```

---

## 2. Confirmación de intangibles — «no se tocó»

Alcance analizado: diff de la **fase actual** (facturación/analítica),
`ba98e0e^..HEAD` (sub-1 «reconocimiento» → HEAD). 70 ficheros, todos de
lectura/presentación de datos ya existentes.

### 2.1 Motor de reservas — NO tocado ✅
El diff de la fase **no incluye ningún** fichero de:
`src/lib/booking/**`, `src/app/(public)/reservar/**`, `src/app/api/public/booking/**`,
`src/app/api/reception/**`, `src/lib/reception/**`.

```
$ git diff --stat ba98e0e^..HEAD -- "src/lib/booking/**" \
    "src/app/(public)/reservar/**" "src/app/api/reception/**" \
    "src/lib/reception/**" "src/app/api/public/booking/**"
(sin salida → sin cambios)
```

### 2.2 TPV de cobro — NO tocado ✅
Sin cambios en `src/app/(dashboard)/tpv/**`, `src/lib/payments/**`,
`src/hooks/use-tpv.ts`. La lógica de creación/cierre de venta (`createSale`,
carrito, totales, periféricos) queda intacta.

```
$ git diff --stat ba98e0e^..HEAD -- "src/app/(dashboard)/tpv/**" \
    "src/lib/payments/**" "src/hooks/use-tpv.ts"
(sin salida → sin cambios)
```

> La fase sí añade **vistas de solo lectura** de tickets de venta ya emitidos
> (`facturacion/tickets/**`, `lib/facturacion/sale-ticket.ts`,
> `api/facturacion/ticket/[id]/route.ts`). Son consultas/reimpresión, **no**
> cobran ni mutan ventas (ver §2.3).

### 2.3 Lógica fiscal — solo LECTURA de facturas ya emitidas ✅
Sin cambios en `src/app/(dashboard)/ajustes/fiscal/**` (config fiscal / Veri*factu).
Lo fiscal que aporta la fase es exclusivamente consulta:

- **`src/lib/facturacion/{queries,rows,filters,sale-ticket}.ts`** — sin
  `.insert()/.update()/.delete()/.upsert()`. `queries.ts` solo hace
  `.from("pos_invoices").select(...)` y `.from("pos_sales").select(...)`.
- **`api/facturacion/ticket/[id]/route.ts`** — únicamente `export async function GET(`.
- **Migración `20260723110000_rpc_invoices_filtered.sql`** — 3 funciones
  (`app.salon_filtered_invoices`, `public.salon_invoices_filtered`,
  `public.salon_invoices_totals`): `returns table` · `language sql` · `stable` ·
  **`security invoker`** (aislamiento por RLS). Sin ningún
  `insert/update/delete/truncate/drop/alter/create table`.
- **Migración `20260723100000_rpc_dashboard_metrics.sql`** (8 RPC de métricas):
  igualmente sin DML/DDL de escritura; funciones de agregación de solo lectura.

Conclusión: la fase **lee** `pos_invoices`/`pos_sales` para listar, filtrar,
totalizar y exportar; **no emite, ni modifica, ni anula** facturas. La emisión
fiscal (numeración correlativa, Veri*factu, inmutabilidad) permanece intacta.

---

## 3. Notas de estado (fuera del alcance de sub-17)

Al iniciar la verificación, el árbol de trabajo tenía cambios **preexistentes**
(de una sesión previa, no producidos por sub-17):

- `src/app/(dashboard)/ajustes/marca/actions.ts`, `src/hooks/use-salon-branding.ts`,
  `src/tests/unit/salon-branding-actions.test.ts` — fix de branding
  (`saveSalonLogo` pasa a recibir `FormData` en vez de un `File` suelto, que Next
  rechaza como argumento de Server Action). Bien documentado y con tests.
- `DEPLOY-AHORA.md` (sin trackear) — checklist de primer despliegue.

Los tres gates se ejecutaron **con esos cambios presentes** y salieron en verde.
Son branding/deploy, **ajenos** a reservas/TPV/fiscal, por lo que no alteran las
conclusiones del §2. Su commit corresponde a su sub-tarea de origen; no se
incluyen en el commit de sub-17.

---

## Veredicto

**ENTREGABLE VERIFICADO ✅** — `tsc` limpio, `vitest` 1107/1107, `build` OK, e
intangibles (motor de reservas, TPV de cobro, emisión fiscal) confirmados sin
tocar. La capa de Facturación/Analítica es aditiva y de solo lectura.
