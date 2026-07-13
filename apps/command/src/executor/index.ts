import { join, resolve } from "node:path"
import { readFileSync, existsSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { getSupabaseClient } from "../database/client.js"
import { publishEvent } from "../state-bus/publisher.js"
import { EVENT_TYPES } from "../state-bus/event-types.js"
import type { HatTask, Subtask, TaskStatus } from "../types.js"
import type { PublishFn } from "./types.js"
import { createReporter } from "./reporter.js"
import { runAgent } from "./agent-runner.js"
import { prepareWorkspace } from "./workspace.js"
import { executePlan, type RunSubtaskFn, type ExecutePlanResult } from "./queue.js"
import { loadRoster, findRosterAgent } from "../intelligence/capability-map/roster.js"

export interface ExecutorDeps {
  loadTask(taskId: string): Promise<HatTask>
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>
  runSubtask: RunSubtaskFn
  publish: PublishFn
  insertCheckpoint(input: { taskId: string; reason: string }): Promise<void>
  prepareWorkspaceFn(input: { taskId: string; clientId: string | null; reposRoot: string }): Promise<{ dir: string; branch: string }>
  loadCompletedSubtasks(taskId: string): Promise<Set<string>>
  reposRoot: string
  maxConcurrent: number
}

async function defaultLoadTask(taskId: string): Promise<HatTask> {
  const { data, error } = await getSupabaseClient().from("hat3x_tasks").select("*").eq("id", taskId).single()
  if (error != null || data == null) throw new Error(`Tarea ${taskId} no encontrada: ${error?.message ?? ""}`)
  const row = data as Record<string, unknown>
  return {
        id: row["id"] as string,
        clientId: (row["client_id"] as string | null) ?? null,
        orderRaw: row["order_raw"] as string,
        subtasks: (row["subtasks"] as HatTask["subtasks"]) ?? [],
        executionPlan: (row["execution_plan"] as HatTask["executionPlan"]) ?? null,
    controlMode: row["control_mode"] as HatTask["controlMode"],
    status: row["status"] as HatTask["status"],
    createdAt: row["created_at"] as string,
  }
}

async function defaultUpdateStatus(taskId: string, status: TaskStatus): Promise<void> {
  const { error } = await getSupabaseClient().from("hat3x_tasks").update({ status }).eq("id", taskId)
  if (error != null) throw new Error(`No se pudo actualizar ${taskId}: ${error.message}`)
}

async function defaultLoadCompletedSubtasks(taskId: string): Promise<Set<string>> {
  const { data, error } = await getSupabaseClient()
    .from("bus_events")
    .select("payload")
    .eq("task_id", taskId)
    .eq("event_type", "task.completed")
  if (error != null) return new Set()
  const ids = new Set<string>()
  for (const row of data ?? []) {
    const sid = (row as { payload?: { subtaskId?: string } }).payload?.subtaskId
    if (typeof sid === "string") ids.add(sid)
  }
  return ids
}

async function defaultInsertCheckpoint(input: { taskId: string; reason: string }): Promise<void> {
  // hat3x_checkpoints.id es TEXT PRIMARY KEY sin default en la DB — hay que generarlo aquí.
  const { error } = await getSupabaseClient().from("hat3x_checkpoints").insert({
    id: randomUUID(),
    task_id: input.taskId,
    after_phase: 0,
    reason: input.reason,
    required_approval: "jose",
    status: "pending",
    triggered_at: new Date().toISOString(),
  })
  if (error != null) throw new Error(`No se pudo crear checkpoint: ${error.message}`)
  await publishEvent({
    taskId: input.taskId,
    eventType: EVENT_TYPES.CHECKPOINT_TRIGGERED,
    agentId: null,
    payload: { reason: input.reason },
  })
}

function loadAgentConfig(agentId: string, vertical: string): string {
  const root = process.env["AGENTS_ROOT"] ?? resolve(process.cwd(), "..", "..", "agents")
  const candidates = [
    join(root, vertical, "subagentes", agentId, "CLAUDE.md"),
    join(root, vertical, "CLAUDE.md"),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return readFileSync(c, "utf8")
  }
  return `Eres ${agentId}, un agente experto de HAT3X en ${vertical}. Trabajas con profesionalidad y entregas trabajo verificado.`
}

export async function executeTask(taskId: string, overrides: Partial<ExecutorDeps> = {}): Promise<ExecutePlanResult> {
  const loadTask = overrides.loadTask ?? defaultLoadTask
  const task = await loadTask(taskId)
  if (task.executionPlan === null) {
    throw new Error(`La tarea ${taskId} no tiene plan. Ejecuta primero el pipeline (/api/process).`)
  }

  const publish = overrides.publish ?? (publishEvent as PublishFn)
  const updateTaskStatus = overrides.updateTaskStatus ?? defaultUpdateStatus
  const insertCheckpoint = overrides.insertCheckpoint ?? defaultInsertCheckpoint
  const prepareWorkspaceFn = overrides.prepareWorkspaceFn ?? prepareWorkspace
  const reposRoot = overrides.reposRoot
    ?? process.env["HAT3X_REPOS_ROOT"]
    ?? resolve(process.cwd(), "..", "..", "clients", "projects")
  const maxConcurrent = overrides.maxConcurrent ?? parseInt(process.env["MAX_CONCURRENT_AGENTS"] ?? "4", 10)

  const ws = await prepareWorkspaceFn({ taskId, clientId: task.clientId, reposRoot })
  const report = createReporter(taskId, publish)
  const roster = overrides.runSubtask !== undefined ? null : await loadRoster()
  const repoRoot = resolve(process.cwd(), "..", "..")

  const runSubtask: RunSubtaskFn = overrides.runSubtask ?? (async (subtask: Subtask, agentId: string) => {
    // Identidad: primero la ruta exacta del roster (pool de 178), luego el PM de la vertical
    const rosterAgent = findRosterAgent(roster, agentId)
    const rosterConfig = rosterAgent !== null && existsSync(join(repoRoot, rosterAgent.configPath))
      ? readFileSync(join(repoRoot, rosterAgent.configPath), "utf8")
      : null
    const r = await runAgent({
      subtask,
      agentId,
      agentConfig: rosterConfig ?? loadAgentConfig(agentId, subtask.vertical),
      clientContext: task.clientId !== null ? `Cliente: ${task.clientId}` : "",
      artifacts: [],
      workspaceDir: ws.dir,
      onEvent: report,
    })
    return r.outcome === "checkpoint"
      ? { outcome: r.outcome, checkpointReason: r.checkpointReason ?? "checkpoint" }
      : { outcome: r.outcome }
  })

  await updateTaskStatus(taskId, "running")

  const loadCompleted = overrides.loadCompletedSubtasks ?? defaultLoadCompletedSubtasks
  const alreadyCompleted = await loadCompleted(taskId)

  const result = await executePlan({
    plan: task.executionPlan,
    subtasks: task.subtasks,
    maxConcurrent,
    runSubtask,
    onCheckpoint: async ({ reason }) => { await insertCheckpoint({ taskId, reason }) },
    alreadyCompleted,
  })

  const finalStatus: TaskStatus =
    result.failed.length > 0 ? "failed" : result.checkpoints > 0 ? "paused" : "completed"
  await updateTaskStatus(taskId, finalStatus)
  return result
}
