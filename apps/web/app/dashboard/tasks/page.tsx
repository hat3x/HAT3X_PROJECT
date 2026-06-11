import Link from "next/link"
import { getServerClient } from "@/lib/supabase"
import { statusColor, formatDate } from "@/lib/dashboard/formatters"
import type { DashTask } from "@/lib/dashboard/types"

export default async function TasksPage(): Promise<JSX.Element> {
  const supabase = getServerClient()
  const { data } = await supabase
    .from("hat3x_tasks")
    .select("id, client_id, order_raw, status, control_mode, created_at")
    .order("created_at", { ascending: false })
    .limit(50)

  const tasks = (data ?? []) as DashTask[]

  return (
    <div className="space-y-4">
      <h1 className="text-text-primary text-2xl font-semibold">Tareas</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-secondary border-b border-border-subtle">
              <th className="text-left py-2 pr-4">ID</th>
              <th className="text-left py-2 pr-4">Orden</th>
              <th className="text-left py-2 pr-4">Estado</th>
              <th className="text-left py-2 pr-4">Modo</th>
              <th className="text-left py-2">Creada</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-b border-border-subtle hover:bg-surface-2 transition-colors">
                <td className="py-3 pr-4">
                  <Link
                    href={`/dashboard/tasks/${task.id}`}
                    className="text-purple-light hover:underline font-mono text-xs"
                  >
                    {task.id}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-text-primary max-w-xs truncate">{task.order_raw}</td>
                <td className="py-3 pr-4">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(task.status)}`}>
                    {task.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-text-secondary">{task.control_mode}</td>
                <td className="py-3 text-text-muted">{formatDate(task.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && (
          <p className="text-text-muted text-sm py-8 text-center">Sin tareas todavía</p>
        )}
      </div>
    </div>
  )
}
