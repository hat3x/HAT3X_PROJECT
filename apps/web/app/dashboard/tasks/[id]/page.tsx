import { notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase"
import { statusColor, formatDate } from "@/lib/dashboard/formatters"
import type { DashCheckpoint } from "@/lib/dashboard/types"

interface PageProps {
  params: { id: string }
}

export default async function TaskDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const supabase = getServerClient()

  const [taskRes, checkpointsRes] = await Promise.all([
    supabase
      .from("hat3x_tasks")
      .select("id, order_raw, status, control_mode, created_at, subtasks, execution_plan")
      .eq("id", params.id)
      .single(),
    supabase
      .from("hat3x_checkpoints")
      .select("*")
      .eq("task_id", params.id)
      .order("triggered_at", { ascending: true }),
  ])

  if (taskRes.error != null || taskRes.data == null) notFound()

  const task = taskRes.data as {
    id: string
    order_raw: string
    status: string
    control_mode: string
    created_at: string
    subtasks: Array<{ vertical: string; description: string }> | null
    execution_plan: { phases?: Array<{ name: string; subtasks: unknown[] }> } | null
  }

  const checkpoints = (checkpointsRes.data ?? []) as DashCheckpoint[]
  const subtasks = task.subtasks ?? []
  const phases = task.execution_plan?.phases ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-text-primary text-2xl font-semibold font-mono">{task.id}</h1>
          <p className="text-text-secondary mt-1">{task.order_raw}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor(task.status)}`}>
          {task.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-surface-2 border border-border-subtle rounded-xl p-4">
          <p className="text-text-secondary text-xs mb-1">Modo de control</p>
          <p className="text-text-primary">{task.control_mode}</p>
        </div>
        <div className="bg-surface-2 border border-border-subtle rounded-xl p-4">
          <p className="text-text-secondary text-xs mb-1">Creada</p>
          <p className="text-text-primary">{formatDate(task.created_at)}</p>
        </div>
      </div>

      {subtasks.length > 0 && (
        <section>
          <h2 className="text-text-primary font-medium mb-3">Subtasks ({subtasks.length})</h2>
          <ul className="space-y-2">
            {subtasks.map((st, i) => (
              <li key={i} className="bg-surface-2 border border-border-subtle rounded-lg px-4 py-2 text-sm text-text-secondary">
                <span className="text-purple-light mr-2">[{st.vertical}]</span>{st.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {phases.length > 0 && (
        <section>
          <h2 className="text-text-primary font-medium mb-3">Plan de ejecución ({phases.length} fases)</h2>
          <ol className="space-y-2">
            {phases.map((phase, i) => (
              <li key={i} className="bg-surface-2 border border-border-subtle rounded-lg px-4 py-2 text-sm">
                <span className="text-text-secondary">Fase {i + 1}:</span>{" "}
                <span className="text-text-primary">{phase.name}</span>
                <span className="text-text-muted ml-2">({phase.subtasks.length} subtasks)</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {checkpoints.length > 0 && (
        <section>
          <h2 className="text-text-primary font-medium mb-3">Checkpoints ({checkpoints.length})</h2>
          <ul className="space-y-2">
            {checkpoints.map((cp) => (
              <li key={cp.id} className="bg-surface-2 border border-border-subtle rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-text-muted">{cp.id}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(cp.status)}`}>
                    {cp.status}
                  </span>
                </div>
                <p className="text-text-secondary">{cp.reason}</p>
                {cp.feedback != null && (
                  <p className="text-text-muted mt-1 italic">"{cp.feedback}"</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
