import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback de carga de Facturación → Tickets / Ventas. Reproduce la retícula real
 * (cabecera de sección + nota de inmutabilidad + tabla) para evitar saltos de layout
 * mientras el servidor resuelve el histórico de ventas. Solo presentación.
 */
export default function TicketsLoading(): React.ReactElement {
  return (
    <div>
      {/* Cabecera de sección */}
      <div className="mb-6 flex items-start gap-3.5">
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="space-y-2 pt-1">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </div>

      {/* Nota de inmutabilidad */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="w-full space-y-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border bg-[var(--glass-bg-dense)] backdrop-blur-xl shadow-sm">
        <div className="border-b bg-muted/30 px-3 py-3">
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b px-3 py-3.5 last:border-0"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="ml-auto h-4 w-16" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
