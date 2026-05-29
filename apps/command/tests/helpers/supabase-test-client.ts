import { getSupabaseClient } from "../../src/database/client.js"
import type { SupabaseClient } from "@supabase/supabase-js"

export function getTestClient(): SupabaseClient {
  return getSupabaseClient()
}

export async function cleanTestData(taskId: string): Promise<void> {
  const client = getTestClient()
  await client.from("bus_events").delete().eq("task_id", taskId)
  await client.from("hat3x_tasks").delete().eq("id", taskId)
}
