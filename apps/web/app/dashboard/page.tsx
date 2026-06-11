import { getServerClient } from "@/lib/supabase"
import { formatDate } from "@/lib/dashboard/formatters"
import type { DashTask, EvolutionEntry } from "@/lib/dashboard/types"

async function getOverviewData() {
  const supabase = getServerClient()

  const [tasksRes, checkpointsRes, lastEvoRes] = await Promise.all([
    supabase.from("hat3x_tasks").select("status"),
    supabase
      .from("hat3x_checkpoints")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("evolution_log")
      .select("applied_at, description")
      .order("applied_at", { ascending: false })
      .limit(1),
  ])

  const tasks = (tasksRes.data ?? []) as Pick<DashTask, "status">[]
  const byStatus = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})

  const lastEvo = ((lastEvoRes.data ?? []) as Pick<EvolutionEntry, "applied_at" | "description">[])[0]

  return {
    byStatus,
    total: tasks.length,
    pendingCheckpoints: checkpointsRes.count ?? 0,
    lastEvo,
  }
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const { byStatus, total, pendingCheckpoints, lastEvo } = await getOverviewData()

  const statCards = [
    { label: "Total tareas", value: total },
    { label: "Completadas", value: byStatus["completed"] ?? 0 },
    { label: "En curso", value: byStatus["running"] ?? 0 },
    { label: "Pendientes", value: byStatus["pending"] ?? 0 },
    { label: "Checkpoints pendientes", value: pendingCheckpoints },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-text-primary text-2xl font-semibold">Resumen</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-surface-2 border border-border-subtle rounded-xl p-4">
            <p className="text-text-secondary text-xs mb-1">{card.label}</p>
            <p className="text-text-primary text-3xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>
      {lastEvo != null && (
        <div className="bg-surface-2 border border-border-subtle rounded-xl p-4">
          <p className="text-text-secondary text-xs mb-1">Última evolución</p>
          <p className="text-text-primary text-sm">{lastEvo.description}</p>
          <p className="text-text-muted text-xs mt-1">{formatDate(lastEvo.applied_at)}</p>
        </div>
      )}
    </div>
  )
}
