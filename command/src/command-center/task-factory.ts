import { getSupabaseClient } from "../database/client.js"
import type { HatTask, ControlMode } from "../types.js"

interface CreateTaskInput {
  orderRaw: string
  controlMode: ControlMode
  clientId?: string
}

// Single-user CLI — sequential ID generation is safe; no concurrent callers expected
async function getNextTaskId(): Promise<string> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from("hat3x_tasks")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (error != null && error.code !== "PGRST116") {
    throw new Error(`Failed to get last task ID: ${error.message}`)
  }

  if (!data) return "HAT3X-001"

  const rawId = (data as { id?: string } | null)?.id ?? ""
  if (!rawId.startsWith("HAT3X-")) return "HAT3X-001"
  const lastNumber = parseInt(rawId.replace("HAT3X-", ""), 10)
  if (isNaN(lastNumber)) return "HAT3X-001"
  return `HAT3X-${String(lastNumber + 1).padStart(3, "0")}`
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

  const row = data as {
    id: string
    client_id: string | null
    order_raw: string
    subtasks: unknown
    execution_plan: unknown
    control_mode: string
    status: string
    created_at: string
  }

  return {
    id: row.id,
    clientId: row.client_id,
    orderRaw: row.order_raw,
    subtasks: row.subtasks,
    executionPlan: row.execution_plan,
    controlMode: row.control_mode as ControlMode,
    status: row.status as HatTask["status"],
    createdAt: row.created_at,
  }
}
