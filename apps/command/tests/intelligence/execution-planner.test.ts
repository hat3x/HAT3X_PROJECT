import { describe, it, expect } from "vitest"
import { planExecution } from "../../src/intelligence/execution-planner"
import type { Subtask, AgentSelection } from "../../src/types"

const SUBTASKS: Subtask[] = [
  { id: "sub-1", description: "A", vertical: "chatbots", skills: [], estimatedHours: 8, dependencies: [] },
  { id: "sub-2", description: "B", vertical: "crm", skills: [], estimatedHours: 4, dependencies: ["sub-1"] },
  { id: "sub-3", description: "C", vertical: "webs-apps", skills: [], estimatedHours: 6, dependencies: [] },
  { id: "sub-4", description: "D", vertical: "testing", skills: [], estimatedHours: 3, dependencies: ["sub-2", "sub-3"] },
]

const SELECTIONS: AgentSelection[] = [
  { subtaskId: "sub-1", agentId: "pm-chatbots", score: 1, rationale: "" },
  { subtaskId: "sub-2", agentId: "pm-automatizaciones", score: 1, rationale: "" },
  { subtaskId: "sub-3", agentId: "pm-webs-apps", score: 1, rationale: "" },
  { subtaskId: "sub-4", agentId: "pm-webs-apps", score: 1, rationale: "" },
]

describe("planExecution", () => {
  it("groups independent subtasks into phase 1", () => {
    const plan = planExecution(SUBTASKS, SELECTIONS)
    const phase1 = plan.phases.find((p) => p.phaseNumber === 1)
    expect(phase1).toBeDefined()
    const ids = phase1!.subtasks.map((s) => s.subtaskId)
    expect(ids).toContain("sub-1")
    expect(ids).toContain("sub-3")
  })

  it("puts dependent subtasks in later phases", () => {
    const plan = planExecution(SUBTASKS, SELECTIONS)
    const phase1Ids = new Set(plan.phases[0]!.subtasks.map((s) => s.subtaskId))
    expect(phase1Ids.has("sub-2")).toBe(false)
    expect(phase1Ids.has("sub-4")).toBe(false)
  })

  it("sub-4 comes after sub-2 and sub-3", () => {
    const plan = planExecution(SUBTASKS, SELECTIONS)
    const phaseOf = (id: string) =>
      plan.phases.find((p) => p.subtasks.some((s) => s.subtaskId === id))?.phaseNumber ?? -1
    expect(phaseOf("sub-4")).toBeGreaterThan(phaseOf("sub-2"))
    expect(phaseOf("sub-4")).toBeGreaterThan(phaseOf("sub-3"))
  })

  it("totalEstimatedHours is sum of all subtask hours", () => {
    const plan = planExecution(SUBTASKS, SELECTIONS)
    expect(plan.totalEstimatedHours).toBe(21)
  })

  it("throws on circular dependency", () => {
    const circular: Subtask[] = [
      { id: "a", description: "", vertical: "chatbots", skills: [], estimatedHours: 1, dependencies: ["b"] },
      { id: "b", description: "", vertical: "crm", skills: [], estimatedHours: 1, dependencies: ["a"] },
    ]
    const circularSelections: AgentSelection[] = [
      { subtaskId: "a", agentId: "pm-chatbots", score: 1, rationale: "" },
      { subtaskId: "b", agentId: "pm-automatizaciones", score: 1, rationale: "" },
    ]
    expect(() => planExecution(circular, circularSelections)).toThrow("Circular dependency")
  })
})
