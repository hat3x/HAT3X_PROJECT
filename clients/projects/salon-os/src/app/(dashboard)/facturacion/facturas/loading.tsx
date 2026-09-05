import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback de carga de Facturación → Facturas. Reproduce la retícula real
 * (cabecera + barra de filtros + tabla con pie de totales) para evitar saltos de
 * layout mientras el servidor resuelve filtros, lista y totales. Solo presentación.
 */
export default function FacturasLoading(): React.ReactElement {
  return (
    <div>
      {/* Cabecera de sección */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="space-y-2 pt-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-32 shrink-0 rounded-md" />
      </div>

      {/* Barra de filtros */}
      <div className="mb-4 space-y-3 rounded-xl border border-border/70 bg-secondary/40 p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Skeleton className="h-10 flex-1" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex">
            <Skeleton className="h-9 lg:w-[11rem]" />
            <Skeleton className="h-9 lg:w-[11rem]" />
            <Skeleton className="h-9 lg:w-[11rem]" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Skeleton className="h-9 w-[9.5rem]" />
          <Skeleton className="h-9 w-[9.5rem]" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 shadow-sm">
        <div className="border-b bg-muted/30 px-3 py-3">
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b px-3 py-3.5 last:border-0"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-9 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="ml-auto h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
        {/* Pie de totales */}
        <div className="flex items-center gap-4 bg-muted/40 px-3 py-3.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}
