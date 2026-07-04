import { describe, it, expect, vi } from "vitest"
import { createReporter } from "../../src/executor/reporter.js"
import type { RunnerEvent } from "../../src/executor/types.js"

describe("createReporter", () => {
  it.each([
    ["started", "task.started"],
    ["progress", "task.progress"],
    ["completed", "task.completed"],
    ["failed", "task.failed"],
    ["artifact", "artifact.shared"],
  ] as const)("maps runner kind %s to bus event %s", async (kind, eventType) => {
    const publish = vi.fn().mockResolvedValue(undefined)
    const report = createReporter("HAT3X-001", publish)
    const ev: RunnerEvent = { kind, subtaskId: "ST-001", agentId: "architect", detail: "diseñando schema" }
    await report(ev)
    expect(publish).toHaveBeenCalledWith({
      taskId: "HAT3X-001",
      eventType,
      agentId: "architect",
      payload: { subtaskId: "ST-001", detail: "diseñando schema" },
    })
  })
})
