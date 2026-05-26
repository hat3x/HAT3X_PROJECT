import { getSupabaseClient } from "../../database/client.js"
import type { ExecutionPlan, Subtask } from "../../types.js"

interface TaskRow {
  id: string
  order_raw: string
  status: string
  control_mode: string
  subtasks: Subtask[] | null
  execution_plan: ExecutionPlan | null
}

export async function runPlan(taskId: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_tasks")
    .select("id, order_raw, status, control_mode, subtasks, execution_plan")
    .eq("id", taskId)
    .single()

  if (error != null || data == null) {
    throw new Error(`Task ${taskId} not found`)
  }

  const task = data as TaskRow

  console.log(`\n=== ${task.id} ===`)
  console.log(`Order: ${task.order_raw}`)
  console.log(`Status: ${task.status} | Mode: ${task.control_mode}`)

  if (task.execution_plan == null) {
    console.log("\nNo execution plan yet (analysis pending or skipped).")
    return
  }

  const plan = task.execution_plan
  console.log(`\nRisk: ${plan.riskLevel} | Estimated: ${plan.totalEstimatedHours}h`)
  console.log(`Phases: ${plan.phases.length} | Checkpoints: ${plan.checkpoints.length}`)

  for (const phase of plan.phases) {
    const checkpoint = plan.checkpoints.find((c) => c.afterPhase === phase.phaseNumber)
    console.log(`\nPhase ${phase.phaseNumber}:`)
    for (const ps of phase.subtasks) {
      const subtask = (task.subtasks ?? []).find((s) => s.id === ps.subtaskId)
      const desc = subtask?.description ?? ps.subtaskId
      console.log(`  [${ps.agentId}] ${desc}`)
    }
    if (checkpoint != null) {
      console.log(`  -- Checkpoint: ${checkpoint.reason} (${checkpoint.requiredApproval})`)
    }
  }
}
