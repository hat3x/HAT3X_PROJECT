import { spawn as nodeSpawn } from "node:child_process"
import { createInterface } from "node:readline"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Subtask } from "../types.js"
import type { RunnerEvent } from "./types.js"
import { buildAgentPrompt } from "./agent-prompt.js"
import { buildAgentSettings } from "./redline-guard.js"

export interface ChildLike {
  stdin: { write(data: string): void; end(): void }
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  on(ev: "close", cb: (code: number | null) => void): void
}

export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string }) => ChildLike

// Sin shell: el prompt viaja por stdin y los settings por fichero, así no hay
// problemas de escaping de argumentos en Windows.
const defaultSpawn: SpawnFn = (cmd, args, opts) =>
  nodeSpawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] }) as unknown as ChildLike

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
  const settingsPath = join(input.workspaceDir, ".hat3x-agent-settings.json")
  writeFileSync(settingsPath, JSON.stringify(buildAgentSettings(input.workspaceDir)))
  const emit = (kind: RunnerEvent["kind"], detail: string) =>
    input.onEvent({ kind, subtaskId: input.subtask.id, agentId: input.agentId, detail })

  await emit("started", input.subtask.description)

  const child = spawn("claude", [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "bypassPermissions",
    "--settings", settingsPath,
  ], { cwd: input.workspaceDir })

  child.stdin.write(prompt)
  child.stdin.end()

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
