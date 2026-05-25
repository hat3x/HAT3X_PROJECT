import { getSupabaseClient } from "../../database/client.js"
import { formatTask, formatTaskList } from "../formatter.js"
import type { HatTask } from "../../types.js"

function toHatTask(d: Record<string, unknown>): HatTask {
  return {
    id: d["id"] as string,
    clientId: (d["client_id"] as string | null) ?? null,
    orderRaw: d["order_raw"] as string,
    subtasks: (d["subtasks"] as HatTask["subtasks"]) ?? [],
    executionPlan: (d["execution_plan"] as HatTask["executionPlan"]) ?? null,
    controlMode: d["control_mode"] as HatTask["controlMode"],
    status: d["status"] as HatTask["status"],
    createdAt: d["created_at"] as string,
  }
}

export async function runStatus(options: { id?: string }): Promise<string> {
  const client = getSupabaseClient()

  if (options.id != null) {
    const { data, error } = await client.from("hat3x_tasks").select("*").eq("id", options.id).single()
    if (error != null || data == null) return `Proyecto ${options.id} no encontrado.`
    return formatTask(toHatTask(data as Record<string, unknown>))
  }

  const { data } = await client.from("hat3x_tasks").select("*").in("status", ["pending", "running", "paused"]).order("created_at", { ascending: false })
  return formatTaskList((data ?? []).map((d) => toHatTask(d as Record<string, unknown>)))
}
