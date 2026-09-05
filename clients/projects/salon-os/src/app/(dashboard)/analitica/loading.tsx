import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback de carga de `/analitica`. Reproduce la retícula real (cabecera + selector
 * de rango + KPIs + gráficas + ocupación) para evitar saltos de layout mientras el
 * servidor agrega las métricas del periodo — y se muestra también al cambiar de rango
 * (el `RangeSelector` reescribe la URL y el segmento se vuelve a resolver). Solo
 * presentación: no toca datos.
 */
export default function AnaliticaLoading(): React.ReactElement {
  return (
    <main className="container py-8 md:py-10">
      {/* Encabezado + selector de rango */}
      <div className="mb-8 space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 rounded-full" />
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-lg" />
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex items-start gap-4 p-5">
              <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
              <div className="w-full space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfica de tendencia */}
      <div className="mt-8">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-56 rounded-lg" />
            <Skeleton className="mt-4 h-[300px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>

      {/* Dos columnas de rankings / donuts */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[220px] w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ocupación de agenda */}
      <div className="mt-8">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-2.5 w-full rounded-full" />
            <Skeleton className="mt-3 h-4 w-72 max-w-full" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
