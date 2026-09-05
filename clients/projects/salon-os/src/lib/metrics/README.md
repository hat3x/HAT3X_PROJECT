# `@/lib/metrics` — capa de agregación del panel (métricas y gráficas)

Envoltorios TS de **solo servidor** sobre las RPC de agregación
(`supabase/migrations/20260723100000_rpc_dashboard_metrics.sql`). La regla de oro
de la tarea: **nunca traer miles de ventas al cliente para sumarlas**. Cada
métrica es una función SQL que hace `date_trunc` + `group by` en la base y
devuelve solo las filas ya agregadas.

> Contrato completo y decisiones de diseño: **`docs/metricas-agregacion-servidor.md`**.

## Uso

```ts
import { createClient } from "@/lib/supabase/server";
import { getActiveSalonId } from "@/lib/salon";
import { getSalesSummary, getRevenueTimeseries } from "@/lib/metrics";
import { formatMoney } from "@/lib/format";

const supabase = createClient();
const salonId = await getActiveSalonId();
if (!salonId) return; // sin salón activo

const period = { from: "2026-07-01", to: "2026-07-31" }; // fechas locales, `to` inclusivo

const kpis = await getSalesSummary(supabase, salonId, period);
const serie = await getRevenueTimeseries(supabase, salonId, period, "day");

formatMoney(kpis.gross_revenue_cents); // "12.300,00 €"
```

## Funciones

| Helper | RPC | Devuelve | Métrica |
|---|---|---|---|
| `getSalesSummary` | `salon_sales_summary` | 1 fila | Facturación, nº tickets, ticket medio |
| `getRevenueTimeseries` | `salon_revenue_timeseries` | serie | Facturación / nº tickets **en el tiempo** |
| `getRevenueByLocation` | `salon_revenue_by_location` | filas | Ingresos por sede |
| `getRevenueByProfessional` | `salon_revenue_by_professional` | ranking | Ingresos por profesional |
| `getTopItems` / `getTopServices` / `getTopProducts` | `salon_top_items` | ranking | Top servicios y productos |
| `getPaymentMethodDistribution` | `salon_payment_method_distribution` | filas | Distribución por método de pago |
| `getNewVsReturningCustomers` | `salon_new_vs_returning_customers` | 1 fila | Clientes nuevos vs recurrentes |
| `getAgendaOccupancy` | `salon_agenda_occupancy` | 1 fila | Ocupación de agenda |

## Reglas

- **Dinero en céntimos.** Todos los `*_cents` son enteros. Formatear con
  `formatMoney(cents)` de `@/lib/format`; **nunca** dividir por 100 a mano.
- **Rango en fechas locales del salón.** `{ from, to }` como ISO `YYYY-MM-DD`;
  `to` es **inclusivo**. Los cortes de día/semana/mes y los límites se calculan en
  `salons.timezone` (por defecto `Europe/Madrid`).
- **Facturación = ventas `completed`.** Tickets abiertos, anulados o devueltos no
  cuentan como ingreso.
- **Aislamiento por RLS.** Las RPC son `SECURITY INVOKER`: pasando el cliente RLS
  de la sesión, un miembro solo ve las métricas de **su** salón. No hace falta
  cliente admin para leer.
- **Solo servidor.** Usar en Server Components / Route Handlers con el cliente de
  `@/lib/supabase/server`. No importar `server.ts` desde componentes cliente
  (los tipos de `types.ts` sí son seguros para cliente).
