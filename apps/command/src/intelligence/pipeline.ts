import { getSupabaseClient } from "../database/client.js"
import { analyzeTask } from "./task-analyzer.js"
import { matchCapabilities } from "./capability-matcher.js"
import { planExecution } from "./execution-planner.js"
import { assessRisk } from "./risk-assessor.js"
import { loadCapabilityMap } from "./capability-map/loader.js"
import { loadRoster } from "./capability-map/roster.js"
import { refineSelectionsWithLLM } from "./agent-selector.js"
import { loadClientMemory } from "../command-center/client-memory.js"
import { publishEvent } from "../state-bus/publisher.js"
import { EVENT_TYPES } from "../state-bus/event-types.js"

export interface PipelineResult {
  taskId: string
  subtaskCount: number
  phaseCount: number
  totalEstimatedHours: number
  riskLevel: string
}

export async function runIntelligencePipeline(taskId: string): Promise<PipelineResult> {
  const db = getSupabaseClient()

  const { data: task, error } = await db
    .from("hat3x_tasks")
    .select("*")
    .eq("id", taskId)
    .single()

  if (error || !task) throw new Error(`Task not found: ${taskId}`)
  if (task.status !== "pending") throw new Error(`Task ${taskId} is not pending (status: ${task.status})`)

  const [capMap, roster, clientMemory] = await Promise.all([
    loadCapabilityMap(),
    loadRoster(),
    task.client_id ? loadClientMemory(task.client_id as string) : Promise.resolve(null),
  ])

  const subtasks = await analyzeTask(task.order_raw as string, clientMemory)
  let selections = matchCapabilities(subtasks, capMap, roster)
  if (roster !== null) {
    selections = await refineSelectionsWithLLM(subtasks, selections, roster)
  }
  const rawPlan = planExecution(subtasks, selections)
  const finalPlan = assessRisk(rawPlan, subtasks, capMap)

  await db
    .from("hat3x_tasks")
    .update({ subtasks, execution_plan: finalPlan, status: "running" })
    .eq("id", taskId)

  await publishEvent({
    taskId,
    eventType: EVENT_TYPES.TASK_STARTED,
    agentId: "intelligence-layer",
    payload: {
      subtaskCount: subtasks.length,
      phaseCount: finalPlan.phases.length,
      totalEstimatedHours: finalPlan.totalEstimatedHours,
      riskLevel: finalPlan.riskLevel,
    },
  })

  return {
    taskId,
    subtaskCount: subtasks.length,
    phaseCount: finalPlan.phases.length,
    totalEstimatedHours: finalPlan.totalEstimatedHours,
    riskLevel: finalPlan.riskLevel,
  }
}
