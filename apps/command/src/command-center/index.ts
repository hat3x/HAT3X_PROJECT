import { createTask } from "./task-factory.js"
import { loadClientMemory } from "./client-memory.js"
import { resolveControlMode } from "./control-mode.js"
import type { HatTask, ControlMode } from "../types.js"

interface ProcessOrderInput {
  orderRaw: string
  clientId?: string
  controlMode?: ControlMode
}

export class CommandCenter {
  async processOrder(input: ProcessOrderInput): Promise<HatTask> {
    const clientMemory = input.clientId ? await loadClientMemory(input.clientId) : null

    const controlMode = resolveControlMode({
      explicitMode: input.controlMode ?? null,
      clientMemory,
      orderRaw: input.orderRaw,
    })

    return createTask({ orderRaw: input.orderRaw, controlMode, clientId: input.clientId })
  }
}
