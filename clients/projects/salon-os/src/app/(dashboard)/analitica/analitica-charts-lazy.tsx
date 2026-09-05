"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/*
 * Carga DIFERIDA de las gráficas de /analitica (recharts).
 * ---------------------------------------------------------------------
 * recharts es la dependencia más pesada de la ruta. Con `next/dynamic` su chunk
 * se separa del bundle inicial de la página y se descarga bajo demanda, de modo
 * que la vista es interactiva antes; mientras llega, se muestra un esqueleto de la
 * misma altura (sin salto de layout). Los componentes ya son cliente puro (miden
 * su contenedor en el navegador), así que `ssr: false` no cambia el resultado
 * visible —el propio gráfico ya renderizaba un esqueleto hasta montar— solo lo
 * saca del render de servidor y del bundle inicial.
 *
 * La implementación real vive en `./analitica-charts`; aquí solo re-exportamos
 * versiones diferidas con el mismo contrato de props.
 */

/** Fallback de carga: esqueleto del alto real del gráfico (evita CLS). */
function chartLoader(height: number): () => React.ReactElement {
  return function ChartLoading(): React.ReactElement {
    return (
      <div role="img" aria-label="Cargando la gráfica…">
        <Skeleton className="w-full rounded-lg" style={{ height }} />
      </div>
    );
  };
}

export const SalesTrendChart = dynamic(
  () =>
    import("@/app/(dashboard)/analitica/analitica-charts").then(
      (m) => m.SalesTrendChart,
    ),
  { ssr: false, loading: chartLoader(300) },
);

export const PaymentMethodChart = dynamic(
  () =>
    import("@/app/(dashboard)/analitica/analitica-charts").then(
      (m) => m.PaymentMethodChart,
    ),
  { ssr: false, loading: chartLoader(220) },
);

export const CustomersSplitChart = dynamic(
  () =>
    import("@/app/(dashboard)/analitica/analitica-charts").then(
      (m) => m.CustomersSplitChart,
    ),
  { ssr: false, loading: chartLoader(220) },
);
