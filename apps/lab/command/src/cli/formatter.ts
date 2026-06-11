import type { HatTask } from "../types.js"

const STATUS_ICON: Record<string, string> = {
  pending: "⏳", running: "🟢", paused: "⏸", completed: "✅", failed: "❌",
}

export function formatTask(task: HatTask): string {
  return [
    `HAT3X Command ⚡`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `${STATUS_ICON[task.status] ?? "?"} Proyecto: ${task.id}`,
    `   Modo:    ${task.controlMode}`,
    `   Estado:  ${task.status}`,
    `   Orden:   "${task.orderRaw}"`,
    `   Creado:  ${new Date(task.createdAt).toLocaleString("es-ES")}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n")
}

export function formatTaskList(tasks: HatTask[]): string {
  if (tasks.length === 0) return "HAT3X Command — Sin proyectos activos."

  const lines = ["HAT3X Command ⚡", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "PROYECTOS ACTIVOS", ""]
  for (const t of tasks) {
    lines.push(`  ${STATUS_ICON[t.status] ?? "?"}  ${t.id}  [${t.status}]  "${t.orderRaw.slice(0, 50)}"`)
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  return lines.join("\n")
}
