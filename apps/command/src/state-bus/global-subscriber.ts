import { getSupabaseClient } from "../database/client.js"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { NotificationSender } from "../telegram/notifications/sender.js"
import type { HatCheckpoint } from "../checkpoint/types.js"

export interface GlobalSubscriber {
  subscribe(): Promise<void>
  unsubscribe(): Promise<void>
}

export function createGlobalSubscriber(sender: NotificationSender): GlobalSubscriber {
  const client = getSupabaseClient()
  let channel: RealtimeChannel | null = null

  async function handleEvent(row: Record<string, unknown>): Promise<void> {
    const eventType = row["event_type"] as string
    const taskId = row["task_id"] as string
    const payload = row["payload"] as Record<string, unknown>

    if (eventType === "checkpoint.triggered") {
      const cpRow = payload["checkpoint"] as Record<string, unknown> | undefined
      if (cpRow == null) return
      const checkpoint: HatCheckpoint = {
        id: cpRow["id"] as string,
        taskId: cpRow["task_id"] as string,
        afterPhase: cpRow["after_phase"] as number,
        reason: cpRow["reason"] as string,
        requiredApproval: cpRow["required_approval"] as HatCheckpoint["requiredApproval"],
        status: "pending",
        feedback: null,
        triggeredAt: cpRow["triggered_at"] as string,
        resolvedAt: null,
      }
      await sender.sendCheckpointAlert(checkpoint)
      return
    }

    if (eventType === "task.completed") {
      const summary = (payload["summary"] as string | undefined) ?? "Tarea completada."
      await sender.sendTaskCompleted(taskId, summary)
      return
    }

    if (eventType === "task.blocked") {
      const agentId = (row["agent_id"] as string | null) ?? "unknown"
      const reason = (payload["reason"] as string | undefined) ?? "Razón desconocida"
      await sender.sendAgentBlocked(taskId, agentId, reason)
      return
    }

    if (eventType === "meeting.called") {
      const mtgRow = payload["meeting"] as Record<string, unknown> | undefined
      if (mtgRow == null) return
      await sender.sendMeetingCalled(
        mtgRow["id"] as string,
        taskId,
        mtgRow["topic"] as string,
        mtgRow["called_by"] as string
      )
      return
    }

    if (eventType === "meeting.resolved") {
      const mtgRow = payload["meeting"] as Record<string, unknown> | undefined
      if (mtgRow == null) return
      const consensus = mtgRow["consensus"] as string | undefined
      if (consensus == null || consensus === "") {
        console.warn(`meeting.resolved event for ${taskId} has no consensus value`)
        return
      }
      await sender.sendMeetingResolved(mtgRow["id"] as string, taskId, consensus)
      return
    }
  }

  return {
    async subscribe() {
      await new Promise<void>((resolve, reject) => {
        channel = client
          .channel("global-bus-telegram")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "bus_events" },
            (payload) => {
              void handleEvent(payload.new as Record<string, unknown>).catch((err) =>
                console.error("handleEvent failed:", err)
              )
            }
          )
          .subscribe((status, err) => {
            if (status === "SUBSCRIBED") {
              resolve()
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              reject(
                new Error(
                  `Global subscriber failed: ${status}${err ? ` — ${String(err)}` : ""}`
                )
              )
            }
          })
      })
    },

    async unsubscribe() {
      if (channel != null) {
        await client.removeChannel(channel)
        channel = null
      }
    },
  }
}
