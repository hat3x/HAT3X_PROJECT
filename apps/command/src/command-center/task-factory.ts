import { getSupabaseClient } from "../database/client.js"
import type { HatTask, ControlMode } from "../types.js"

interface CreateTaskInput {
  orderRaw: string
  controlMode: ControlMode
  clientId?: string
}

async function getNextTaskId(): Promise<string> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from("hat3x_tasks")
    .select("id")
    .like("id", "HAT3X-%")

  if (error) {
    throw new Error(`Failed to get last task ID: ${error.message}`)
  }

  if (!data || data.length === 0) return "HAT3X-001"

  const numbers = data.map((row) => parseInt(row.id.replace("HAT3X-", ""), 10)).filter((n) => !isNaN(n))
  const maxNumber = Math.max(...numbers)
  return `HAT3X-${String(maxNumber + 1).padStart(3, "0")}`
}

export async function createTask(input: CreateTaskInput): Promise<HatTask> {
  const client = getSupabaseClient()
  const id = await getNextTaskId()

  const { data, error } = await client
    .from("hat3x_tasks")
    .insert({
      id,
      client_id: input.clientId ?? null,
      order_raw: input.orderRaw,
      subtasks: [],
      execution_plan: {},
      control_mode: input.controlMode,
      status: "pending",
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create task: ${error.message}`)
  if (!data) throw new Error("Task created but no data returned")

  return {
    id: data.id,
    clientId: data.client_id,
    orderRaw: data.order_raw,
    subtasks: data.subtasks,
    executionPlan: data.execution_plan,
    controlMode: data.control_mode,
    status: data.status,
    createdAt: data.created_at,
  }
}
