import Link from "next/link"
import { getServerClient } from "@/lib/supabase"
import { statusColor, formatDate } from "@/lib/dashboard/formatters"
import type { DashCheckpoint } from "@/lib/dashboard/types"

function CheckpointRow({ cp }: { cp: DashCheckpoint }): JSX.Element {
  return (
    <tr className="border-b border-border-subtle hover:bg-surface-2 transition-colors">
      <td className="py-3 pr-4 font-mono text-xs text-text-muted">{cp.id}</td>
      <td className="py-3 pr-4">
        <Link href={`/dashboard/tasks/${cp.task_id}`} className="text-purple-light hover:underline font-mono text-xs">
          {cp.task_id}
        </Link>
      </td>
      <td className="py-3 pr-4 text-text-secondary text-sm max-w-xs truncate">{cp.reason}</td>
      <td className="py-3 pr-4">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(cp.status)}`}>
          {cp.status}
        </span>
      </td>
      <td className="py-3 text-text-muted text-xs">{formatDate(cp.triggered_at)}</td>
    </tr>
  )
}

function CheckpointTable({ items, title }: { items: DashCheckpoint[]; title: string }): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-text-primary font-medium">{title} ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-text-muted text-sm py-4">Sin registros</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-secondary border-b border-border-subtle">
                <th className="text-left py-2 pr-4">ID</th>
                <th className="text-left py-2 pr-4">Tarea</th>
                <th className="text-left py-2 pr-4">Motivo</th>
                <th className="text-left py-2 pr-4">Estado</th>
                <th className="text-left py-2">Creado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((cp) => <CheckpointRow key={cp.id} cp={cp} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default async function CheckpointsPage(): Promise<JSX.Element> {
  const supabase = getServerClient()
  const { data } = await supabase
    .from("hat3x_checkpoints")
    .select("id, task_id, after_phase, reason, required_approval, status, feedback, triggered_at, resolved_at")
    .order("triggered_at", { ascending: false })
    .limit(100)

  const checkpoints = (data ?? []) as DashCheckpoint[]
  const pending = checkpoints.filter((c) => c.status === "pending")
  const resolved = checkpoints.filter((c) => c.status !== "pending")

  return (
    <div className="space-y-8">
      <h1 className="text-text-primary text-2xl font-semibold">Checkpoints</h1>
      <CheckpointTable items={pending} title="Pendientes" />
      <CheckpointTable items={resolved} title="Resueltos" />
    </div>
  )
}
