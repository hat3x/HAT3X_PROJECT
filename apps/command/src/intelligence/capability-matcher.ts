import type { Subtask, AgentSelection } from "../types.js"
import type { CapabilityMap } from "./capability-map/types.js"

export function matchCapabilities(
  subtasks: Subtask[],
  map: CapabilityMap
): AgentSelection[] {
  return subtasks.map((subtask) => {
    const entry = map[subtask.vertical]
    if (entry == null) {
      throw new Error(`No capability entry for vertical: ${subtask.vertical}`)
    }

    const matchingSkills = subtask.skills.filter((s) => entry.skills.includes(s))
    const score =
      subtask.skills.length === 0
        ? 0.5
        : matchingSkills.length / subtask.skills.length

    const rationale =
      matchingSkills.length > 0
        ? `${entry.agentId} covers ${matchingSkills.join(", ")} (${Math.round(score * 100)}% skill match)`
        : `${entry.agentId} is the designated agent for ${subtask.vertical}`

    return {
      subtaskId: subtask.id,
      agentId: entry.agentId,
      score,
      rationale,
    }
  })
}
