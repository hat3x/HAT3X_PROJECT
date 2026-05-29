import { analyzeTask } from "./task-analyzer.js"
import { loadCapabilityMap } from "./capability-map/loader.js"
import { matchCapabilities } from "./capability-matcher.js"
import { planExecution } from "./execution-planner.js"
import { assessRisk } from "./risk-assessor.js"
import type { Subtask, ExecutionPlan, ClientMemory } from "../types.js"

export interface IntelligenceResult {
  subtasks: Subtask[]
  executionPlan: ExecutionPlan
}

export async function runIntelligenceLayer(
  order: string,
  clientMemory: ClientMemory | null
): Promise<IntelligenceResult> {
  const [subtasks, map] = await Promise.all([
    analyzeTask(order, clientMemory),
    loadCapabilityMap(),
  ])

  const selections = matchCapabilities(subtasks, map)
  const rawPlan = planExecution(subtasks, selections)
  const executionPlan = assessRisk(rawPlan, subtasks, map)

  return { subtasks, executionPlan }
}
