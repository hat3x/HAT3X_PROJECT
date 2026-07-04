import { getSupabaseClient } from "../../src/database/client.js"
import type { SupabaseClient } from "@supabase/supabase-js"

// Tests de integración: solo corren con HAT3X_TEST_LIVE=1 y un proyecto Supabase accesible
export const LIVE = process.env["HAT3X_TEST_LIVE"] === "1"

export function getTestClient(): SupabaseClient {
  return getSupabaseClient()
}

export async function cleanTestData(taskId: string): Promise<void> {
  const client = getTestClient()
  await client.from("bus_events").delete().eq("task_id", taskId)
  await client.from("hat3x_tasks").delete().eq("id", taskId)
}
