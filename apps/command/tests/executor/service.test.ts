import { describe, it, expect, vi } from "vitest"
import { executeTask } from "../../src/executor/index.js"
import type { HatTask } from "../../src/types.js"

const task: HatTask = {
  id: "HAT3X-001", clientId: null, orderRaw: "landing",
  subtasks: [
    { id: "A", description: "hacer A", vertical: "webs-apps", skills: [], estimatedHours: 1, dependencies: [] },
  ],
  executionPlan: {
    phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: "A", agentId: "lead-programmer" }] }],
    checkpoints: [], totalEstimatedHours: 1, riskLevel: "low",
  },
  controlMode: "autopilot", status: "pending", createdAt: new Date().toISOString(),
}

describe("executeTask", () => {
  it("runs the plan with injected deps and reports status transitions", async () => {
    const statusUpdates: string[] = []
    const r = await executeTask("HAT3X-001", {
      loadTask: vi.fn(async () => task),
      updateTaskStatus: vi.fn(async (_id: string, s: string) => { statusUpdates.push(s) }),
      runSubtask: vi.fn(async () => ({ outcome: "completed" as const })),
      publish: vi.fn(async () => {}),
      insertCheckpoint: vi.fn(async () => {}),
      prepareWorkspaceFn: vi.fn(async () => ({ dir: "C:/tmp", branch: "hat3x/HAT3X-001" })),
      maxConcurrent: 4,
    })
    expect(r.completed).toEqual(["A"])
    expect(statusUpdates).toEqual(["running", "completed"])
  })

  it("throws a clear error when the task has no plan", async () => {
    await expect(executeTask("HAT3X-002", {
      loadTask: vi.fn(async () => ({ ...task, id: "HAT3X-002", executionPlan: null })),
    })).rejects.toThrow(/no tiene plan/)
  })
})
