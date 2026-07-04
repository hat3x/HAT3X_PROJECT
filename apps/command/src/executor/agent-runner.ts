import { spawn as nodeSpawn } from "node:child_process"
import { createInterface } from "node:readline"
import type { Subtask } from "../types.js"
import type { RunnerEvent } from "./types.js"
import { buildAgentPrompt } from "./agent-prompt.js"
import { buildAgentSettings } from "./redline-guard.js"

export interface ChildLike {
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  on(ev: "close", cb: (code: number | null) => void): void
}

export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string }) => ChildLike

const defaultSpawn: SpawnFn = (cmd, args, opts) =>
  nodeSpawn(cmd, args, { cwd: opts.cwd, shell: process.platform === "win32" }) as unknown as ChildLike

export interface RunAgentInput {
  subtask: Subtask
  agentId: string
  agentConfig: string
  clientContext: string
  artifacts: string[]
  workspaceDir: string
  onEvent: (ev: RunnerEvent) => Promise<void>
  spawn?: SpawnFn
  timeoutMs?: number
}

export interface RunAgentResult {
  outcome: "completed" | "failed" | "checkpoint"
  checkpointReason?: string
  resultText: string
}

const CHECKPOINT_MARKER = "HAT3X_CHECKPOINT:"

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const spawn = input.spawn ?? defaultSpawn
  const prompt = buildAgentPrompt(input)
  const settings = JSON.stringify(buildAgentSettings(input.workspaceDir))
  const emit = (kind: RunnerEvent["kind"], detail: string) =>
    input.onEvent({ kind, subtaskId: input.subtask.id, agentId: input.agentId, detail })

  await emit("started", input.subtask.description)

  const child = spawn("claude", [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "bypassPermissions",
    "--settings", settings,
  ], { cwd: input.workspaceDir })

  let resultText = ""
  const rl = createInterface({ input: child.stdout })

  const done = new Promise<number | null>((resolve) => {
    child.on("close", resolve)
  })

  for await (const line of rl) {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(line) as Record<string, unknown> } catch { continue }
    if (msg["type"] === "assistant") {
      const message = msg["message"] as { content?: Array<{ type: string; text?: string }> } | undefined
      const text = (message?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(" ").trim()
      if (text.length > 0) await emit("progress", text.slice(0, 120))
    }
    if (msg["type"] === "result") {
      resultText = String(msg["result"] ?? "")
    }
  }

  const code = await done

  if (code !== 0 && code !== null) {
    await emit("failed", `exit code ${code}`)
    return { outcome: "failed", resultText }
  }

  const markerIdx = resultText.indexOf(CHECKPOINT_MARKER)
  if (markerIdx >= 0) {
    const reason = resultText.slice(markerIdx + CHECKPOINT_MARKER.length).trim()
    return { outcome: "checkpoint", checkpointReason: reason, resultText }
  }

  await emit("completed", resultText.slice(0, 120))
  return { outcome: "completed", resultText }
}
