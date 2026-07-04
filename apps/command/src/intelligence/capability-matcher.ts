import type { Subtask, AgentSelection } from "../types.js"
import type { CapabilityMap } from "./capability-map/types.js"
import { selectAgentForSubtask, type Roster } from "./capability-map/roster.js"

export function matchCapabilities(
  subtasks: Subtask[],
  map: CapabilityMap,
  roster: Roster | null = null
): AgentSelection[] {
  return subtasks.map((subtask) => {
    const entry = map[subtask.vertical]
    if (entry == null) {
      throw new Error(`No capability entry for vertical: ${subtask.vertical}`)
    }

    // Pool composable: primero busca el especialista del roster (178 agentes);
    // si ninguno casa con la subtarea, cae al PM de la vertical.
    if (roster !== null) {
      const selection = selectAgentForSubtask(subtask, roster)
      if (selection !== null) {
        return { subtaskId: subtask.id, ...selection }
      }
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
