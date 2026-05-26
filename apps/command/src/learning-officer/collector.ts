import { getSupabaseClient } from "../database/client.js"
import type { LearningSignal, SignalOutcome } from "./types.js"

interface SubtaskRow {
  vertical?: string
  [key: string]: unknown
}

interface PhaseRow {
  subtasks?: Array<{ subtaskId?: string; agentId?: string }>
}

interface ExecutionPlanRow {
  phases?: PhaseRow[]
}

function deriveVertical(subtasks: SubtaskRow[]): string {
  if (subtasks.length === 0) return "unknown"
  const counts = new Map<string, number>()
  for (const s of subtasks) {
    if (s.vertical) counts.set(s.vertical, (counts.get(s.vertical) ?? 0) + 1)
  }
  let top = "unknown"
  let max = 0
  for (const [v, c] of counts.entries()) {
    if (c > max) { max = c; top = v }
  }
  return top
}

function deriveAgentId(plan: ExecutionPlanRow | null): string {
  const firstPhase = plan?.phases?.[0]
  const firstSubtask = firstPhase?.subtasks?.[0]
  return firstSubtask?.agentId ?? "unknown"
}

function outcomeFromCheckpoints(checkpoints: Record<string, unknown>[]): SignalOutcome {
  if (checkpoints.length === 0) return "success"
  const hasRejected = checkpoints.some((c) => c["status"] === "rejected")
  return hasRejected ? "failure" : "success"
}

function mergedFeedback(checkpoints: Record<string, unknown>[]): string | null {
  const texts = checkpoints
    .map((c) => c["feedback"] as string | null)
    .filter((f): f is string => f != null && f.length > 0)
  return texts.length > 0 ? texts.join(" | ") : null
}

export async function collectSignals(): Promise<LearningSignal[]> {
  const client = getSupabaseClient()

  const { data: tasks, error: taskError } = await client
    .from("hat3x_tasks")
    .select("*")
    .eq("status", "completed")

  if (taskError != null) throw new Error(`Failed to collect tasks: ${taskError.message}`)
  if (!tasks || tasks.length === 0) return []

  const taskIds = tasks.map((t: Record<string, unknown>) => t["id"] as string)

  const { data: checkpoints, error: cpError } = await client
    .from("hat3x_checkpoints")
    .select("*")
    .in("task_id", taskIds)
    .not("feedback", "is", null)

  if (cpError != null) throw new Error(`Failed to collect checkpoints: ${cpError.message}`)

  const checkpointsByTask = new Map<string, Record<string, unknown>[]>()
  for (const cp of (checkpoints ?? []) as Record<string, unknown>[]) {
    const tid = cp["task_id"] as string
    if (!checkpointsByTask.has(tid)) checkpointsByTask.set(tid, [])
    checkpointsByTask.get(tid)!.push(cp)
  }

  return tasks.map((task: Record<string, unknown>): LearningSignal => {
    const cps = checkpointsByTask.get(task["id"] as string) ?? []
    const subtasks = (task["subtasks"] as SubtaskRow[] | null) ?? []
    const plan = (task["execution_plan"] as ExecutionPlanRow | null) ?? null

    return {
      taskId: task["id"] as string,
      vertical: deriveVertical(subtasks),
      agentId: deriveAgentId(plan),
      outcome: outcomeFromCheckpoints(cps),
      checkpointFeedback: mergedFeedback(cps),
      durationHours: null,
      failureReason: null,
    }
  })
}
