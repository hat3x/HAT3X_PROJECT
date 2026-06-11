const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-400 bg-green-400/10",
  running:   "text-yellow-400 bg-yellow-400/10",
  pending:   "text-blue-400 bg-blue-400/10",
  failed:    "text-red-400 bg-red-400/10",
}

const IMPACT_COLORS: Record<string, string> = {
  high:   "text-red-400 bg-red-400/10",
  medium: "text-yellow-400 bg-yellow-400/10",
  low:    "text-blue-400 bg-blue-400/10",
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "text-gray-400 bg-gray-400/10"
}

export function impactColor(impact: string): string {
  return IMPACT_COLORS[impact] ?? "text-gray-400 bg-gray-400/10"
}

export function formatDate(iso: string | null): string {
  if (iso == null) return "—"
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
