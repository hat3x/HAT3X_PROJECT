import { describe, it, expect, vi } from "vitest"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import { runAgent } from "../../src/executor/agent-runner.js"
import type { Subtask } from "../../src/types.js"

const subtask: Subtask = {
  id: "ST-001", description: "Crear landing", vertical: "webs-apps",
  skills: [], estimatedHours: 1, dependencies: [],
}

function fakeChild(lines: string[], exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & { stdout: Readable; stderr: Readable }
  child.stdout = Readable.from(lines.map((l) => l + "\n"))
  child.stderr = Readable.from([])
  child.stdout.on("end", () => setImmediate(() => child.emit("close", exitCode)))
  return child
}

const base = {
  subtask, agentId: "lead-programmer", agentConfig: "config", clientContext: "", artifacts: [],
  workspaceDir: "C:/tmp",
}

describe("runAgent", () => {
  it("emits started, progress and completed on success", async () => {
    const events: string[] = []
    const onEvent = vi.fn(async (ev: { kind: string }) => { events.push(ev.kind) })
    const spawn = vi.fn(() => fakeChild([
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "creando index.html" }] } }),
      JSON.stringify({ type: "result", result: "landing creada" }),
    ]))
    const r = await runAgent({ ...base, onEvent, spawn })
    expect(r.outcome).toBe("completed")
    expect(r.resultText).toBe("landing creada")
    expect(events[0]).toBe("started")
    expect(events).toContain("progress")
    expect(events[events.length - 1]).toBe("completed")
  })

  it("returns checkpoint outcome when marker present", async () => {
    const spawn = vi.fn(() => fakeChild([
      JSON.stringify({ type: "result", result: "hecho.\nHAT3X_CHECKPOINT: necesito hacer deploy" }),
    ]))
    const r = await runAgent({ ...base, onEvent: vi.fn(async () => {}), spawn })
    expect(r.outcome).toBe("checkpoint")
    expect(r.checkpointReason).toBe("necesito hacer deploy")
  })

  it("returns failed on non-zero exit", async () => {
    const spawn = vi.fn(() => fakeChild([], 1))
    const events: string[] = []
    const r = await runAgent({ ...base, onEvent: vi.fn(async (ev: { kind: string }) => { events.push(ev.kind) }), spawn })
    expect(r.outcome).toBe("failed")
    expect(events[events.length - 1]).toBe("failed")
  })
})
