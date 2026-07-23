# Auditoría RLS — aislamiento multi-tenant de facturación, ventas y analítica

> Sub-tarea **sub-14** · Vertical webs-apps · Rol: PM Security
> Fecha: 2026-07-23 · Rama: `hat3x/HAT3X-033`
> Alcance: **todas las consultas y RPC nuevas** de facturación (`pos_invoices`),
> ventas/tickets (`pos_sales`) y analítica/dashboard (sub-2, sub-5…sub-11). Objetivo:
> **un salón jamás ve facturas ni ventas de otro salón**, y todo agregado/filtro está
> acotado por `salon_id`.
>
> **Auditoría de SOLO LECTURA.** No se modificó ninguna migración ni código de la app.
> Base de invariantes: [`docs/rls-pos-audit.md`](./rls-pos-audit.md) (sub-5),
> [`docs/convenciones-rls-rpc-audit.md`](./convenciones-rls-rpc-audit.md) (§5) y
> [`docs/metricas-agregacion-servidor.md`](./metricas-agregacion-servidor.md).

## Veredicto

**PASS — el aislamiento multi-tenant está garantizado en toda la superficie nueva.**
Ninguna RPC, consulta directa o Route Handler de facturación/ventas/analítica puede
devolver datos de un salón al que el usuario no pertenece. Se probaron los vectores
adversariales habituales (ver más abajo) y **todos quedan bloqueados**. Los agregados
(Σ, `count`, `group by`, rankings, series temporales) y los filtros (rango, sede, tipo
F1/F2, método de pago, búsqueda) están **siempre** acotados por `salon_id` **y**
respaldados por la RLS de las tablas base. No se hallaron fugas cross-tenant.

El aislamiento se sostiene sobre **tres capas independientes** (defensa en profundidad);
que fallara una sola no filtra datos de otro tenant.

## Modelo de aislamiento — tres capas

1. **Origen del `salon_id`: la SESIÓN, nunca el cliente.** Todo punto de entrada
   resuelve el salón con `getActiveSalon()` / `getActiveSalonId()` /
   `getActiveMembership()` (`src/lib/salon.ts`), que parten de `auth.getUser()` y leen
   `salon_members` del usuario autenticado. **El `salon_id`/`p_salon_id` no procede
   jamás de la URL, el body ni la query string.** Un atacante no puede "pedir" otro
   salón: solo puede operar sobre el suyo.

2. **Acotación explícita `salon_id = p_salon_id` / `.eq("salon_id", …)`** en cada
   consulta y cada RPC. Es la barrera de rendimiento (usa los índices
   `(salon_id, issued_at)` / `(salon_id, sold_at)`) y de intención, pero **no** es la
   que garantiza el aislamiento por sí sola.

3. **RLS en TODAS las tablas base (el backstop real).** Las funciones de lectura son
   `SECURITY INVOKER`: se ejecutan con los privilegios del llamador (`authenticated`),
   así que la RLS de `pos_invoices`/`pos_sales`/… **sigue aplicándose dentro de la
   función**. Aunque un `p_salon_id` ajeno se colara (capas 1-2), la RLS
   (`salon_id in (select app.user_salon_ids())`) devuelve **0 filas**. Reforzado por el
   guardián de catálogo `20260714110000_rls_multitenant_guard.sql`, que **aborta** una
   migración futura que deshabilite RLS o borre la política de SELECT.

### El helper de tenant (ancla de la capa 3)

```sql
-- app.user_salon_ids()  ·  SECURITY DEFINER · STABLE · search_path=''
select salon_id from public.salon_members where user_id = (select auth.uid());
```

`SECURITY DEFINER` solo para **evitar recursión RLS** sobre `salon_members` (patrón del
proyecto); acotado a `auth.uid()`; `revoke` a `anon`/`public`, `grant` a `authenticated`.
Devuelve exclusivamente los salones del usuario ⇒ es imposible que la RLS "vea" un salón
ajeno.

### Desviación deliberada: RPC de lectura = `SECURITY INVOKER` (no `definer`)

La convención general (`convenciones-rls-rpc-audit §5`) dice *"RPC nueva = `security
definer`"*, pensada para RPC de **escritura** que necesitan bypasear RLS de forma
controlada (`register_my_customer_account`, `staff_award_visit`). Las **11 RPC de
lectura** de esta superficie **rompen esa convención a propósito y con buen criterio**:

- Son **solo lectura** (nunca escriben).
- `SECURITY INVOKER` hace que la **RLS del salón se aplique dentro de la función** — el
  aislamiento lo garantiza la RLS existente, no un `WHERE` frágil. Un error en una de
  estas consultas **no puede** filtrar otro tenant. Para lectura analítica, *invoker es
  estrictamente más seguro que definer.*
- La desviación está **documentada en la cabecera de cada migración**
  (`…100000_rpc_dashboard_metrics.sql`, `…110000_rpc_invoices_filtered.sql`).

> **Verificado:** ninguna de estas RPC lleva `security definer` (grep = 0 coincidencias),
> y **ningún** camino de métricas/facturación/analítica llama a `createAdminClient()`
> (service_role). Es decir, siempre se invocan con el **cliente RLS de sesión**, por lo
> que la RLS efectivamente se aplica. La única forma de neutralizar la capa 3 sería
> llamarlas con service_role y un `p_salon_id` arbitrario — algo que **no ocurre** en el
> código y que la capa 1 (salón de sesión) impide de todos modos.

## Inventario auditado y su barrera

### RPC de agregación (`…100000_rpc_dashboard_metrics.sql` · SECURITY INVOKER)

| RPC | Acota `salon_id` | Agregado | Aislamiento |
|---|---|---|---|
| `salon_sales_summary` | ✅ `where s.salon_id = p_salon_id` | KPIs (Σ, count, ticket medio) | RLS `pos_sales` |
| `salon_revenue_timeseries` | ✅ | serie temporal (`date_trunc`+`group by`) | RLS `pos_sales` |
| `salon_revenue_by_location` | ✅ | ingresos/sede | RLS `pos_sales` + join `pos_sessions`/`locations` anclado a `s.salon_id` |
| `salon_revenue_by_professional` | ✅ | ranking/profesional | RLS `pos_sales` + join `professionals` anclado |
| `salon_top_items` | ✅ (`l.salon_id` + join `s.salon_id`) | top servicios/productos | RLS `pos_sale_lines`/`pos_sales` |
| `salon_payment_method_distribution` | ✅ (`pm.salon_id` + join `s.salon_id`) | distribución de cobros | RLS `pos_payments`/`pos_sales` |
| `salon_new_vs_returning_customers` | ✅ (incl. subconsulta `first_seen`) | nuevos vs recurrentes | RLS `pos_sales` |
| `salon_agenda_occupancy` | ✅ (`pros`, `capacity`, `booked` todos por `p_salon_id`) | ocupación agenda | RLS `professionals`/`schedule_exceptions`/`professional_schedules`/`appointments` |
| `app.salon_period_bounds` (helper) | lee `salons` por `p_salon_id` | huso horario | RLS `salons` (no-miembro → default tz, 0 filas aguas abajo) |

### RPC de libro de facturas (`…110000_rpc_invoices_filtered.sql` · SECURITY INVOKER)

| RPC | Acota `salon_id` | Nota |
|---|---|---|
| `app.salon_filtered_invoices` (helper interno, esquema `app`) | ✅ `where i.salon_id = p_salon_id` | Fuente única del filtro; joins a `pos_sales`/`pos_sessions`/`customers`/`pos_payments` **anclados a `i.salon_id`**; método por `EXISTS` (sin fan-out); búsqueda con `%`/`_`/`\` escapados (LIKE literal) |
| `salon_invoices_filtered` | ✅ (delega en el helper) | Lista ordenada + `limit` |
| `salon_invoices_totals` | ✅ (mismo helper, sin `limit`) | Totales del **mismo** conjunto ⇒ lista y totales nunca aplican filtros distintos |

### Consultas directas y Route Handlers

| Punto de entrada | Salón de sesión | `.eq("salon_id")` | IDOR |
|---|---|---|---|
| `queries.ts::fetchRecentInvoices/fetchFilteredInvoices/fetchInvoiceTotals` | ✅ (página) | ✅ / vía RPC | — |
| `queries.ts::fetchRecentSales` | ✅ | ✅ | — |
| `queries.ts::fetchSaleDetail(salonId, saleId)` | ✅ | ✅ + `.eq("id")` `.maybeSingle()` | **404 sin fuga de existencia** |
| `metrics/server.ts` (11 wrappers) | ✅ (cliente RLS de sesión + `salonId` explícito) | vía RPC | — |
| `GET /api/facturacion/export` | ✅ `getActiveMembership()` | ✅ `membership.salonId` | RBAC owner/manager + zod en query |
| `GET /api/facturacion/documento/[id]` | ✅ `getActiveSalon()` | ✅ `.eq("id").eq("salon_id")` | **404 sin fuga**; sub-query de líneas también acotada |
| `GET /api/facturacion/ticket/[id]` | ✅ `getActiveSalon()` | ✅ vía `fetchSaleDetail` | **404 sin fuga** |
| `invoicing/emit.ts::fetchSeriesTail` + insert | ✅ (server action) | ✅ `.eq("salon_id").eq("series")` | numeración/`previous_hash` leídos solo del propio salón; insert bajo RLS `with check` |
| `facturas/page.tsx` (sedes del selector) | ✅ | ✅ `.eq("salon_id")` | filtro `location_id` de la URL **validado contra las sedes propias** (`parseInvoiceFilters`) |
| `analitica/page.tsx` · `dashboard/page.tsx` | ✅ + RBAC owner/manager | vía RPC | gating `pos`: sin TPV ni se consultan las métricas de ventas |

## Matriz RLS de las tablas base tocadas (SELECT)

Todas con RLS **habilitada** (deny-by-default) y política de SELECT acotada por
`salon_id in (select app.user_salon_ids())` para `authenticated`, ninguna a `anon`/`public`:

| Tabla | RLS on | SELECT por `user_salon_ids()` | Migración |
|---|---|---|---|
| `pos_invoices` | ✅ | ✅ (+ inmutable: sin UPDATE/DELETE) | `verifactu_invoices` |
| `pos_sales` | ✅ | ✅ | `pos_base` |
| `pos_sale_lines` | ✅ | ✅ | `pos_base` |
| `pos_payments` | ✅ | ✅ | `pos_base` |
| `pos_sessions` | ✅ | ✅ | `pos_base` |
| `pos_payment_methods` | ✅ | ✅ | `pos_base` |
| `customers` | ✅ | ✅ | `rls_policies` |
| `locations` | ✅ | ✅ | `locations` |
| `professionals` | ✅ | ✅ | `rls_policies` |
| `appointments` | ✅ | ✅ | `rls_policies` |
| `professional_schedules` | ✅ | ✅ | `availability` |
| `schedule_exceptions` | ✅ | ✅ | `availability` |
| `salons` | ✅ | ✅ (`id in (select app.user_salon_ids())`) | `rls_policies` |

Además, las **FKs compuestas** `(fk_id, salon_id) → tabla(id, salon_id)` (ver
`rls-pos-audit`) impiden que un join dentro de una RPC cruce a otro tenant aunque se
conozcan UUIDs ajenos: cada join lleva `… and X.salon_id = <tabla ancla>.salon_id`.

## Análisis adversarial (vectores probados)

| Vector | Resultado | Barrera |
|---|---|---|
| Llamar `salon_invoices_filtered(p_salon_id => <salón ajeno>)` | **0 filas** | Capa 3: RLS `pos_invoices` (el salón ajeno no está en `user_salon_ids()`) |
| Llamar cualquier RPC de métricas con `p_salon_id` ajeno | **0 filas / ceros** | Capa 3: RLS de la tabla agregada |
| `GET /documento/[id]` o `/ticket/[id]` con id de factura/venta de otro salón | **404** | `.eq("salon_id")` + `maybeSingle()` ⇒ null; no revela existencia |
| `?sede=<location_id ajeno>` en el libro de facturas | filtro **descartado** | `parseInvoiceFilters` valida contra sedes propias; la RLS+join lo blindaría igual |
| Búsqueda `p_search` con comodines `%`/`_` para "ensanchar" | literal | escape de `%`,`_`,`\` en el helper |
| Inflar totales vía join a `pos_payments` (método) | totales cuadran | filtro por `EXISTS` (sin fan-out): cada factura suma una vez |
| Suplantar `salon_id` desde el navegador (query/body) | imposible | Capa 1: `salon_id` sale de la sesión, no del cliente |
| Neutralizar RLS llamando con service_role | no ocurre | ningún path de esta superficie usa `createAdminClient()` |
| Acceso sin autenticar (`anon`) | bloqueado | RPC `grant` solo a `authenticated`; RLS deny-by-default |
| Modificar/borrar una factura para tapar rastro | bloqueado | inmutabilidad `pos_invoices` (trigger a nivel motor) |

## Observaciones menores (no son hallazgos de seguridad)

1. **"Salón activo" = primera pertenencia (más antigua).** `getActiveSalonId` toma la
   membresía más antigua; aún no hay selector de salón. Es una **limitación de
   producto**, no de seguridad: el usuario solo ve un salón al que **ya pertenece**.
   *Recomendación:* cuando se añada el conmutador, que el `salon_id` elegido se valide
   contra `salon_members` (o simplemente se apoye en la RLS, que ya lo bloquea).

2. **Caveat de `SECURITY INVOKER` para el futuro.** Estas RPC son seguras **porque** se
   llaman con el cliente de sesión (RLS). Si algún día se invocaran con
   `createAdminClient()` (service_role), la RLS se bypasearía y **solo** quedaría el
   `WHERE salon_id = p_salon_id` como barrera. *Regla:* estas RPC de lectura se llaman
   **siempre** con el cliente RLS de servidor; nunca con el admin.

3. **RLS `ENABLE` (no `FORCE`).** Suficiente aquí: `authenticated` no es propietario de
   las tablas ni tiene `BYPASSRLS`, así que la RLS se aplica. `FORCE` solo afectaría al
   propietario/service_role (contexto de servidor de confianza). No forzar RLS es además
   necesario para no romper los triggers de autoprovisión `SECURITY DEFINER`.

4. **Tipos al día.** Las 11 RPC están reflejadas en el bloque `Functions` de
   `src/types/database.ts` (p. ej. líneas ~1775/1874/1898) — sin el gap de tipos que
   señalaba `convenciones-rls-rpc-audit §0.1`.

## Checklist de regresión para futuras consultas/RPC de esta superficie

- [ ] **RPC de lectura nueva** → `SECURITY INVOKER` + `set search_path=''` + objetos
      cualificados por esquema + `where <tabla>.salon_id = p_salon_id` + `grant execute`
      solo a `authenticated`/`service_role`. Reflejarla en `database.ts::Functions`.
- [ ] **Todo join** dentro de una RPC → anclar `X.salon_id = <ancla>.salon_id` (aprovecha
      las FKs compuestas). Nunca unir por id "a pelo".
- [ ] **Consulta directa nueva** (`.from("pos_*")`) → resolver salón por sesión
      (`getActiveSalon*`) + `.eq("salon_id", …)`; lecturas por id → `.eq("id").eq("salon_id")`
      + `.maybeSingle()` para responder 404 sin filtrar existencia (anti-IDOR).
- [ ] **Nunca** aceptar `salon_id` desde URL/body/query; **nunca** llamar estas RPC/
      consultas con `createAdminClient()`.
- [ ] **Filtro que llega de la URL** (sede, serie, método…) → validar contra el catálogo
      propio del salón antes de confiar en él (como `parseInvoiceFilters`).
- [ ] Si se añade una tabla al alcance, incluirla en el guardián
      `rls_multitenant_guard` (RLS on + SELECT anclado + nada a anon/public).

---

*Auditoría de solo lectura. No se modificó ninguna migración ni código de la app.
Confirma que la sub-14 (aislamiento multi-tenant de facturación/ventas/analítica) queda
cerrada: un salón nunca ve facturas ni ventas de otro salón, y todos los agregados y
filtros están acotados por `salon_id` con respaldo de RLS.*
