import type { ExecutionPlan, Subtask, Checkpoint, RiskLevel } from "../types.js"
import type { CapabilityMap } from "./capability-map/types.js"

const LOW_RISK_HOURS = 20
const HIGH_RISK_HOURS = 40

export function assessRisk(
  plan: ExecutionPlan,
  subtasks: Subtask[],
  map: CapabilityMap
): ExecutionPlan {
  const riskLevel = computeRiskLevel(plan.totalEstimatedHours)
  const checkpoints = computeCheckpoints(plan, subtasks, map, riskLevel)
  return { ...plan, riskLevel, checkpoints }
}

function computeRiskLevel(totalHours: number): RiskLevel {
  if (totalHours > HIGH_RISK_HOURS) return "high"
  if (totalHours > LOW_RISK_HOURS) return "medium"
  return "low"
}

function computeCheckpoints(
  plan: ExecutionPlan,
  subtasks: Subtask[],
  map: CapabilityMap,
  riskLevel: RiskLevel
): Checkpoint[] {
  const checkpoints: Checkpoint[] = []
  const subtaskMap = new Map(subtasks.map((s) => [s.id, s]))

  for (const phase of plan.phases) {
    // No checkpoint after the last phase
    if (phase.phaseNumber === plan.phases.length) continue

    const phaseSubtasks = phase.subtasks
      .map((ps) => subtaskMap.get(ps.subtaskId))
      .filter((s): s is Subtask => s != null)

    const needsClientApproval = phaseSubtasks.some((s) => {
      const entry = map[s.vertical]
      return entry?.requiresClientApproval === true
    })

    const needsCheckpoint = riskLevel !== "low" || needsClientApproval

    if (needsCheckpoint) {
      checkpoints.push({
        afterPhase: phase.phaseNumber,
        reason: needsClientApproval
          ? "Client-facing deliverable requires approval before next phase"
          : "Risk threshold exceeded — Jose review required",
        requiredApproval: needsClientApproval ? "both" : "jose",
      })
    }
  }

  return checkpoints
}
