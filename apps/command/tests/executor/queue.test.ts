import { describe, it, expect, vi } from "vitest"
import { executePlan } from "../../src/executor/queue.js"
import type { ExecutionPlan, Subtask } from "../../src/types.js"

function mkSubtask(id: string): Subtask {
  return { id, description: id, vertical: "webs-apps", skills: [], estimatedHours: 1, dependencies: [] }
}

const subtasks = ["A", "B", "C", "D", "E"].map(mkSubtask)
const plan: ExecutionPlan = {
  phases: [
    { phaseNumber: 1, subtasks: [{ subtaskId: "A", agentId: "a1" }, { subtaskId: "B", agentId: "a2" }, { subtaskId: "C", agentId: "a3" }] },
    { phaseNumber: 2, subtasks: [{ subtaskId: "D", agentId: "a4" }, { subtaskId: "E", agentId: "a5" }] },
  ],
  checkpoints: [], totalEstimatedHours: 5, riskLevel: "low",
}

describe("executePlan", () => {
  it("runs all phases and respects maxConcurrent", async () => {
    let active = 0
    let maxActive = 0
    const runSubtask = vi.fn(async () => {
      active++; maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      return { outcome: "completed" as const }
    })
    const r = await executePlan({ plan, subtasks, maxConcurrent: 2, runSubtask, onCheckpoint: vi.fn() })
    expect(r.completed).toEqual(["A", "B", "C", "D", "E"])
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it("stops advancing phases after a checkpoint and calls onCheckpoint", async () => {
    const onCheckpoint = vi.fn()
    const runSubtask = vi.fn(async (s: Subtask) =>
      s.id === "B" ? { outcome: "checkpoint" as const, checkpointReason: "deploy" } : { outcome: "completed" as const }
    )
    const r = await executePlan({ plan, subtasks, maxConcurrent: 4, runSubtask, onCheckpoint })
    expect(onCheckpoint).toHaveBeenCalledWith({ afterSubtaskId: "B", reason: "deploy" })
    expect(r.checkpoints).toBe(1)
    expect(r.completed).not.toContain("D")
  })

  it("stops after a failure", async () => {
    const runSubtask = vi.fn(async (s: Subtask) =>
      s.id === "A" ? { outcome: "failed" as const } : { outcome: "completed" as const }
    )
    const r = await executePlan({ plan, subtasks, maxConcurrent: 4, runSubtask, onCheckpoint: vi.fn() })
    expect(r.failed).toEqual(["A"])
    expect(r.completed).not.toContain("D")
  })
})
