import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback de carga del panel. Reproduce la retícula real (encabezado +
 * métricas + accesos rápidos) para evitar saltos de layout al hidratar.
 * Solo presentación: no toca datos.
 */
export default function DashboardLoading(): React.ReactElement {
  return (
    <main className="container py-10">
      {/* Encabezado */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Skeleton className="mb-3 h-6 w-40 rounded-full" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Métricas */}
      <div className="mb-10">
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="flex items-start gap-4 p-5">
                <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
                <div className="w-full space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Accesos rápidos */}
      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <Skeleton className="mb-1 h-10 w-10 rounded-lg" />
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-4 w-full max-w-[10rem]" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
