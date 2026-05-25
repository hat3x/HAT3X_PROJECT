import { createTask } from "./task-factory.js"
import { loadClientMemory } from "./client-memory.js"
import { resolveControlMode } from "./control-mode.js"
import { runIntelligenceLayer } from "../intelligence/index.js"
import { getSupabaseClient } from "../database/client.js"
import type { HatTask, ControlMode } from "../types.js"

interface ProcessOrderInput {
  orderRaw: string
  clientId?: string
  controlMode?: ControlMode
  skipAnalysis?: boolean
}

export class CommandCenter {
  async processOrder(input: ProcessOrderInput): Promise<HatTask> {
    const clientMemory = input.clientId != null ? await loadClientMemory(input.clientId) : null

    const controlMode = resolveControlMode({
      explicitMode: input.controlMode ?? null,
      clientMemory,
      orderRaw: input.orderRaw,
    })

    const task = await createTask({ orderRaw: input.orderRaw, controlMode, clientId: input.clientId })

    if (input.skipAnalysis === true) {
      return task
    }

    const { subtasks, executionPlan } = await runIntelligenceLayer(input.orderRaw, clientMemory)

    const { error } = await getSupabaseClient()
      .from("hat3x_tasks")
      .update({
        subtasks: subtasks as unknown as Record<string, unknown>[],
        execution_plan: executionPlan as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id)

    if (error != null) {
      throw new Error(`Failed to save intelligence results: ${error.message}`)
    }

    return { ...task, subtasks, executionPlan }
  }
}
