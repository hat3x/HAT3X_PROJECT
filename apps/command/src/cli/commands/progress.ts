import { getSupabaseClient } from "../../database/client.js"

export interface ProgressData {
  task: Record<string, unknown>
  meetings: Record<string, unknown>[]
  checkpoints: Record<string, unknown>[]
}

export async function fetchProgressData(taskId: string): Promise<ProgressData> {
  const client = getSupabaseClient()

  const { data: task, error: taskError } = await client
    .from("hat3x_tasks")
    .select("*")
    .eq("id", taskId)
    .single()

  if (taskError != null || task == null) {
    throw new Error(`Task not found: ${taskId}`)
  }

  const { data: meetings, error: mtgError } = await client
    .from("hat3x_meetings")
    .select("*")
    .eq("task_id", taskId)
    .eq("status", "open")

  if (mtgError != null) throw new Error(`Failed to fetch meetings: ${mtgError.message}`)

  const { data: checkpoints, error: cpError } = await client
    .from("hat3x_checkpoints")
    .select("*")
    .eq("task_id", taskId)
    .eq("status", "pending")

  if (cpError != null) throw new Error(`Failed to fetch checkpoints: ${cpError.message}`)

  return {
    task: task as Record<string, unknown>,
    meetings: (meetings ?? []) as Record<string, unknown>[],
    checkpoints: (checkpoints ?? []) as Record<string, unknown>[],
  }
}

export function formatProgress(data: ProgressData): string {
  const task = data.task
  const lines: string[] = [
    `═══ PROGRESO: ${task["id"]} ═══`,
    `Título:  ${task["title"]}`,
    `Estado:  ${task["status"]}`,
    `Fase:    ${task["current_phase"] ?? "—"}`,
    `Prioridad: ${task["priority"] ?? "—"}`,
    "",
  ]

  if (data.meetings.length > 0) {
    lines.push(`── Reuniones abiertas (${data.meetings.length}) ──`)
    for (const m of data.meetings) {
      lines.push(`  [${m["id"]}] ${m["topic"]} · ronda ${m["round"]} · por ${m["called_by"]}`)
    }
    lines.push("")
  }

  if (data.checkpoints.length > 0) {
    lines.push(`── Checkpoints pendientes (${data.checkpoints.length}) ──`)
    for (const c of data.checkpoints) {
      lines.push(`  [${c["id"]}] ${c["reason"]}`)
      lines.push(`    → /aprobar ${c["id"]}  |  /rechazar ${c["id"]} <motivo>`)
    }
    lines.push("")
  }

  if (data.meetings.length === 0 && data.checkpoints.length === 0) {
    lines.push("Sin reuniones ni checkpoints pendientes.")
  }

  return lines.join("\n")
}
