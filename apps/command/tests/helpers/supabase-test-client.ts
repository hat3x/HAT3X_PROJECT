import { getSupabaseClient } from "../../src/database/client.js"
import type { SupabaseClient } from "@supabase/supabase-js"

export function getTestClient(): SupabaseClient {
  return getSupabaseClient()
}

export async function cleanTestData(taskId: string): Promise<void> {
  const client = getTestClient()
  const { error: eventsError } = await client.from("bus_events").delete().eq("task_id", taskId)
  if (eventsError) throw new Error(`cleanTestData: failed to delete bus_events: ${eventsError.message}`)
  const { error: tasksError } = await client.from("hat3x_tasks").delete().eq("id", taskId)
  if (tasksError) throw new Error(`cleanTestData: failed to delete hat3x_tasks: ${tasksError.message}`)
}
