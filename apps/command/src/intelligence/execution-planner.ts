import type { Subtask, AgentSelection, ExecutionPlan, Phase } from "../types.js"

export function planExecution(
  subtasks: Subtask[],
  selections: AgentSelection[]
): ExecutionPlan {
  const selectionMap = new Map(selections.map((s) => [s.subtaskId, s]))
  const phases = topoSort(subtasks, selectionMap)
  const totalEstimatedHours = subtasks.reduce((sum, s) => sum + s.estimatedHours, 0)

  return {
    phases,
    checkpoints: [],
    totalEstimatedHours,
    riskLevel: "low",
  }
}

function topoSort(
  subtasks: Subtask[],
  selectionMap: Map<string, AgentSelection>
): Phase[] {
  const remaining = new Set(subtasks.map((s) => s.id))
  const completed = new Set<string>()
  const phases: Phase[] = []
  const maxIterations = subtasks.length + 1

  let iterations = 0

  while (remaining.size > 0) {
    if (iterations++ > maxIterations) {
      throw new Error("Circular dependency detected in subtask graph")
    }

    const ready = subtasks.filter(
      (s) => remaining.has(s.id) && s.dependencies.every((d) => completed.has(d))
    )

    if (ready.length === 0) {
      throw new Error("Circular dependency detected in subtask graph")
    }

    phases.push({
      phaseNumber: phases.length + 1,
      subtasks: ready.map((s) => ({
        subtaskId: s.id,
        agentId: selectionMap.get(s.id)?.agentId ?? "unknown",
      })),
    })

    for (const s of ready) {
      remaining.delete(s.id)
      completed.add(s.id)
    }
  }

  return phases
}
