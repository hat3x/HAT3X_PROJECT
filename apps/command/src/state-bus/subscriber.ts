import { getSupabaseClient } from "../database/client.js"
import type { BusEvent } from "../types.js"
import type { EventType } from "./event-types.js"
import type { RealtimeChannel } from "@supabase/supabase-js"

type EventHandler = (event: BusEvent) => void | Promise<void>

interface SubscriberOptions {
  taskId: string
  eventTypes: EventType[]
  handler: EventHandler
}

export interface Subscriber {
  subscribe(): Promise<void>
  unsubscribe(): Promise<void>
}

export function createSubscriber(options: SubscriberOptions): Subscriber {
  const client = getSupabaseClient()
  let channel: RealtimeChannel | null = null

  return {
    subscribe() {
      return new Promise<void>((resolve, reject) => {
        channel = client
          .channel(`bus:${options.taskId}`)
          .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "bus_events",
            filter: `task_id=eq.${options.taskId}`,
          }, (payload) => {
            const r = payload.new as Record<string, unknown>
            const eventType = r["event_type"] as string
            if (options.eventTypes.includes(eventType as EventType)) {
              void options.handler({
                id: r["id"] as string,
                taskId: r["task_id"] as string,
                eventType,
                agentId: r["agent_id"] as string | null,
                payload: r["payload"] as Record<string, unknown>,
                createdAt: r["created_at"] as string,
              })
            }
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") resolve()
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              reject(new Error(`Subscription failed: ${status}`))
            }
          })
      })
    },
    async unsubscribe() {
      if (channel) { await client.removeChannel(channel); channel = null }
    },
  }
}
