import { analyzeTask } from "./task-analyzer.js"
import { loadCapabilityMap } from "./capability-map/loader.js"
import { matchCapabilities } from "./capability-matcher.js"
import { planExecution } from "./execution-planner.js"
import { assessRisk } from "./risk-assessor.js"
import { loadClientMemory } from "../command-center/client-memory.js"
import type { AgentSelection, ExecutionPlan, Subtask } from "../types.js"

export interface PreviewExecutionPlanInput {
  orderRaw: string
  clientId?: string | null
}

export interface PreviewExecutionPlanResult {
  subtasks: Subtask[]
  selections: AgentSelection[]
  executionPlan: ExecutionPlan
}

export async function previewExecutionPlan(
  input: PreviewExecutionPlanInput
): Promise<PreviewExecutionPlanResult> {
  const [capMap, clientMemory] = await Promise.all([
    loadCapabilityMap(),
    input.clientId ? loadClientMemory(input.clientId) : Promise.resolve(null),
  ])

  const subtasks = await analyzeTask(input.orderRaw, clientMemory)
  const selections = matchCapabilities(subtasks, capMap)
  const rawPlan = planExecution(subtasks, selections)
  const executionPlan = assessRisk(rawPlan, subtasks, capMap)

  return { subtasks, selections, executionPlan }
}
