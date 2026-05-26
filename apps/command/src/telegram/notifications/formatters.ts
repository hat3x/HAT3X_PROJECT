import type { ExecutionPlan, Subtask } from "../../types.js"
import type { HatCheckpoint } from "../../checkpoint/types.js"

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  running: "🟢",
  paused: "⏸",
  completed: "✅",
  failed: "❌",
}

const RISK_EMOJI: Record<string, string> = {
  low: "🟢",
  medium: "🟡",
  high: "🔴",
}

interface TaskRow {
  id: string
  order_raw: string
  status: string
  control_mode: string
  created_at: string
}

export function formatTaskSummary(task: TaskRow): string {
  const icon = STATUS_EMOJI[task.status] ?? "?"
  const date = new Date(task.created_at).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  return [
    `${icon} *${task.id}*`,
    `📋 ${task.order_raw}`,
    `Estado: \`${task.status}\` | Modo: \`${task.control_mode}\``,
    `Creado: ${date}`,
  ].join("\n")
}

export function formatTaskList(tasks: TaskRow[]): string {
  if (tasks.length === 0) {
    return "📭 Sin proyectos activos en HAT3X Command."
  }
  const lines = ["*HAT3X Command — Proyectos recientes:*", ""]
  for (const t of tasks) {
    const icon = STATUS_EMOJI[t.status] ?? "?"
    lines.push(`${icon} \`${t.id}\` — ${t.order_raw.slice(0, 45)}`)
  }
  return lines.join("\n")
}

export function formatPlanMessage(
  taskId: string,
  plan: ExecutionPlan | null,
  subtasks: Subtask[]
): string {
  if (plan == null) {
    return `*${taskId}* — Sin plan de ejecución (análisis pendiente).`
  }

  const subtaskMap = new Map(subtasks.map((s) => [s.id, s]))
  const riskIcon = RISK_EMOJI[plan.riskLevel] ?? "?"
  const lines = [
    `*Plan — ${taskId}*`,
    `${riskIcon} Riesgo: ${plan.riskLevel} | ⏱ ${plan.totalEstimatedHours}h estimadas`,
    `Fases: ${plan.phases.length} | Checkpoints: ${plan.checkpoints.length}`,
    "",
  ]

  for (const phase of plan.phases) {
    lines.push(`*Fase ${phase.phaseNumber}:*`)
    for (const ps of phase.subtasks) {
      const subtask = subtaskMap.get(ps.subtaskId)
      const desc = subtask?.description ?? ps.subtaskId
      lines.push(`  • [${ps.agentId}] ${desc}`)
    }
    const checkpoint = plan.checkpoints.find((c) => c.afterPhase === phase.phaseNumber)
    if (checkpoint != null) {
      lines.push(`  🚩 *Checkpoint:* ${checkpoint.reason} (${checkpoint.requiredApproval})`)
    }
    lines.push("")
  }

  return lines.join("\n").trim()
}

export function formatCheckpointAlert(checkpoint: HatCheckpoint): string {
  return [
    `🚨 *Checkpoint pendiente: ${checkpoint.id}*`,
    `Tarea: \`${checkpoint.taskId}\` — Después de Fase ${checkpoint.afterPhase}`,
    `Motivo: ${checkpoint.reason}`,
    `Aprobación requerida: \`${checkpoint.requiredApproval}\``,
    "",
    `Usa /aprobar ${checkpoint.id} o /rechazar ${checkpoint.id} <motivo>`,
  ].join("\n")
}

export function formatCheckpointList(checkpoints: HatCheckpoint[]): string {
  if (checkpoints.length === 0) {
    return "✅ Sin checkpoints pendientes."
  }
  const lines = [`*Checkpoints pendientes (${checkpoints.length}):*`, ""]
  for (const cp of checkpoints) {
    lines.push(`🚩 \`${cp.id}\` — Tarea ${cp.taskId} | Fase ${cp.afterPhase}`)
    lines.push(`   ${cp.reason}`)
    lines.push("")
  }
  return lines.join("\n").trim()
}
