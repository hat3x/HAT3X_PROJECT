import { getSupabaseClient } from "../database/client.js"
import type { HatCheckpoint } from "../checkpoint/types.js"
import type { NotificationSender } from "../telegram/notifications/sender.js"

const TIMEOUT_MS = 24 * 60 * 60 * 1000  // 24 hours

function rowToCheckpoint(row: Record<string, unknown>): HatCheckpoint {
  return {
    id: row["id"] as string,
    taskId: row["task_id"] as string,
    afterPhase: row["after_phase"] as number,
    reason: row["reason"] as string,
    requiredApproval: row["required_approval"] as HatCheckpoint["requiredApproval"],
    status: row["status"] as HatCheckpoint["status"],
    feedback: (row["feedback"] as string | null) ?? null,
    triggeredAt: row["triggered_at"] as string,
    resolvedAt: (row["resolved_at"] as string | null) ?? null,
  }
}

export async function checkTimeouts(sender: NotificationSender): Promise<void> {
  const cutoff = new Date(Date.now() - TIMEOUT_MS).toISOString()

  const { data, error } = await getSupabaseClient()
    .from("hat3x_checkpoints")
    .select("*")
    .eq("status", "pending")
    .lt("triggered_at", cutoff)

  if (error != null) throw new Error(`Failed to query checkpoints: ${error.message}`)

  for (const row of data ?? []) {
    const checkpoint = rowToCheckpoint(row as Record<string, unknown>)
    try {
      await sender.sendCheckpointReminder(checkpoint)
    } catch (err) {
      console.error(`Failed to remind checkpoint ${checkpoint.id}:`, err)
    }
  }
}
