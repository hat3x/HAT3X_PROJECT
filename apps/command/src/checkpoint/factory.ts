import { getSupabaseClient } from "../database/client.js"
import type { HatCheckpoint, CheckpointApproval } from "./types.js"

interface CreateCheckpointInput {
  taskId: string
  afterPhase: number
  reason: string
  requiredApproval: CheckpointApproval
}

let _counter = 0

function nextCheckpointId(): string {
  _counter++
  return `CHK-${String(_counter).padStart(3, "0")}`
}

export async function createCheckpoint(
  input: CreateCheckpointInput
): Promise<HatCheckpoint> {
  const id = nextCheckpointId()
  const now = new Date().toISOString()

  const row = {
    id,
    task_id: input.taskId,
    after_phase: input.afterPhase,
    reason: input.reason,
    required_approval: input.requiredApproval,
    status: "pending" as const,
    feedback: null,
    triggered_at: now,
    resolved_at: null,
  }

  const { error } = await getSupabaseClient()
    .from("hat3x_checkpoints")
    .insert(row)

  if (error != null) {
    throw new Error(`Failed to create checkpoint: ${error.message}`)
  }

  return {
    id,
    taskId: input.taskId,
    afterPhase: input.afterPhase,
    reason: input.reason,
    requiredApproval: input.requiredApproval,
    status: "pending",
    feedback: null,
    triggeredAt: now,
    resolvedAt: null,
  }
}

export async function resolveCheckpoint(
  checkpointId: string,
  status: "approved" | "rejected",
  feedback: string
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("hat3x_checkpoints")
    .update({
      status,
      feedback,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", checkpointId)
    .eq("status", "pending")

  if (error != null) {
    throw new Error(`Failed to resolve checkpoint: ${error.message}`)
  }
}
