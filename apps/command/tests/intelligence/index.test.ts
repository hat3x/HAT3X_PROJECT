import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../src/intelligence/task-analyzer", () => ({
  analyzeTask: vi.fn(),
}))
vi.mock("../../src/intelligence/capability-map/loader", () => ({
  loadCapabilityMap: vi.fn(),
  resetCapabilityMapCache: vi.fn(),
}))
vi.mock("../../src/intelligence/capability-matcher", () => ({
  matchCapabilities: vi.fn(),
}))
vi.mock("../../src/intelligence/execution-planner", () => ({
  planExecution: vi.fn(),
}))
vi.mock("../../src/intelligence/risk-assessor", () => ({
  assessRisk: vi.fn(),
}))

import { runIntelligenceLayer } from "../../src/intelligence/index"
import { analyzeTask } from "../../src/intelligence/task-analyzer"
import { loadCapabilityMap } from "../../src/intelligence/capability-map/loader"
import { matchCapabilities } from "../../src/intelligence/capability-matcher"
import { planExecution } from "../../src/intelligence/execution-planner"
import { assessRisk } from "../../src/intelligence/risk-assessor"
import type { Subtask, AgentSelection, ExecutionPlan } from "../../src/types"
import type { CapabilityMap } from "../../src/intelligence/capability-map/types"

const MOCK_SUBTASKS: Subtask[] = [
  { id: "sub-1", description: "task", vertical: "chatbots", skills: [], estimatedHours: 8, dependencies: [] },
]
const MOCK_SELECTIONS: AgentSelection[] = [
  { subtaskId: "sub-1", agentId: "pm-chatbots", score: 1, rationale: "" },
]
const MOCK_PLAN: ExecutionPlan = {
  phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] }],
  checkpoints: [],
  totalEstimatedHours: 8,
  riskLevel: "low",
}
const MOCK_MAP = {} as CapabilityMap

describe("runIntelligenceLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(analyzeTask).mockResolvedValue(MOCK_SUBTASKS)
    vi.mocked(loadCapabilityMap).mockResolvedValue(MOCK_MAP)
    vi.mocked(matchCapabilities).mockReturnValue(MOCK_SELECTIONS)
    vi.mocked(planExecution).mockReturnValue(MOCK_PLAN)
    vi.mocked(assessRisk).mockReturnValue(MOCK_PLAN)
  })

  it("calls all pipeline steps", async () => {
    await runIntelligenceLayer("some order", null)
    expect(analyzeTask).toHaveBeenCalledWith("some order", null)
    expect(loadCapabilityMap).toHaveBeenCalled()
    expect(matchCapabilities).toHaveBeenCalledWith(MOCK_SUBTASKS, MOCK_MAP)
    expect(planExecution).toHaveBeenCalledWith(MOCK_SUBTASKS, MOCK_SELECTIONS)
    expect(assessRisk).toHaveBeenCalledWith(MOCK_PLAN, MOCK_SUBTASKS, MOCK_MAP)
  })

  it("returns subtasks and execution plan", async () => {
    const result = await runIntelligenceLayer("some order", null)
    expect(result.subtasks).toBe(MOCK_SUBTASKS)
    expect(result.executionPlan).toBe(MOCK_PLAN)
  })
})
