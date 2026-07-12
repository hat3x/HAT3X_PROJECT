import type { ExecutionPlan, Subtask } from "../types.js"

export type RunSubtaskFn = (
  subtask: Subtask,
  agentId: string
) => Promise<{ outcome: "completed" | "failed" | "checkpoint"; checkpointReason?: string }>

export type CheckpointFn = (input: { afterSubtaskId: string; reason: string }) => Promise<void>

export interface ExecutePlanInput {
  plan: ExecutionPlan
  subtasks: Subtask[]
  maxConcurrent: number
  runSubtask: RunSubtaskFn
  onCheckpoint: CheckpointFn
  /** IDs de subtareas ya completadas en una ejecución previa: no se reejecutan. */
  alreadyCompleted?: Set<string>
}

export interface ExecutePlanResult {
  completed: string[]
  failed: string[]
  checkpoints: number
}

export async function executePlan(input: ExecutePlanInput): Promise<ExecutePlanResult> {
  const byId = new Map(input.subtasks.map((s) => [s.id, s]))
  const done = input.alreadyCompleted ?? new Set<string>()
  const completed: string[] = [...done]
  const failed: string[] = []
  let checkpoints = 0

  for (const phase of input.plan.phases) {
    const pending = phase.subtasks.filter((s) => !done.has(s.subtaskId))
    let halt = false

    async function worker(): Promise<void> {
      for (;;) {
        const item = pending.shift()
        if (item === undefined) return
        const subtask = byId.get(item.subtaskId)
        if (subtask === undefined) {
          failed.push(item.subtaskId)
          halt = true
          continue
        }
        const result = await input.runSubtask(subtask, item.agentId)
        if (result.outcome === "completed") {
          completed.push(subtask.id)
        } else if (result.outcome === "failed") {
          failed.push(subtask.id)
          halt = true
        } else {
          checkpoints++
          halt = true
          await input.onCheckpoint({ afterSubtaskId: subtask.id, reason: result.checkpointReason ?? "checkpoint" })
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(input.maxConcurrent, phase.subtasks.length) },
      () => worker()
    )
    await Promise.all(workers)
    if (halt) break
  }

  return { completed, failed, checkpoints }
}
