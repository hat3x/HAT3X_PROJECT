import { getSupabaseClient } from "../database/client.js"
import type { EventType } from "./event-types.js"

interface PublishEventInput {
  taskId: string
  eventType: EventType
  agentId: string | null
  payload: Record<string, unknown>
}

export async function publishEvent(input: PublishEventInput): Promise<void> {
  const { error } = await getSupabaseClient().from("bus_events").insert({
    task_id: input.taskId,
    event_type: input.eventType,
    agent_id: input.agentId,
    payload: input.payload,
  })
  if (error != null) throw new Error(`Failed to publish event: ${error.message}`)
}
