import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../src/database/client.js", () => ({ getSupabaseClient: vi.fn() }))
vi.mock("../../src/intelligence/task-analyzer.js", () => ({ analyzeTask: vi.fn() }))
vi.mock("../../src/intelligence/capability-matcher.js", () => ({ matchCapabilities: vi.fn() }))
vi.mock("../../src/intelligence/execution-planner.js", () => ({ planExecution: vi.fn() }))
vi.mock("../../src/intelligence/risk-assessor.js", () => ({ assessRisk: vi.fn() }))
vi.mock("../../src/intelligence/capability-map/loader.js", () => ({ loadCapabilityMap: vi.fn() }))
vi.mock("../../src/command-center/client-memory.js", () => ({ loadClientMemory: vi.fn() }))
vi.mock("../../src/state-bus/publisher.js", () => ({ publishEvent: vi.fn() }))

import { runIntelligencePipeline } from "../../src/intelligence/pipeline.js"
import { getSupabaseClient } from "../../src/database/client.js"
import { analyzeTask } from "../../src/intelligence/task-analyzer.js"
import { matchCapabilities } from "../../src/intelligence/capability-matcher.js"
import { planExecution } from "../../src/intelligence/execution-planner.js"
import { assessRisk } from "../../src/intelligence/risk-assessor.js"
import { loadCapabilityMap } from "../../src/intelligence/capability-map/loader.js"
import { publishEvent } from "../../src/state-bus/publisher.js"
import type { Subtask, AgentSelection, ExecutionPlan } from "../../src/types.js"
import type { CapabilityMap } from "../../src/intelligence/capability-map/types.js"

const TASK_ID = "HAT3X-TEST-PIPELINE"

const SUBTASKS: Subtask[] = [
  { id: "sub-1", description: "Build chatbot", vertical: "chatbots", skills: ["rag-chatbots"], estimatedHours: 8, dependencies: [] },
]
const SELECTIONS: AgentSelection[] = [
  { subtaskId: "sub-1", agentId: "pm-chatbots", score: 1, rationale: "full match" },
]
const PLAN: ExecutionPlan = {
  phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] }],
  checkpoints: [],
  totalEstimatedHours: 8,
  riskLevel: "low",
}

function makeDb(taskOverride: Record<string, unknown> = {}) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) })
  return {
    from: vi.fn((table: string) => {
      if (table === "hat3x_tasks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: TASK_ID, order_raw: "Build a chatbot", client_id: null, status: "pending", ...taskOverride },
                error: null,
              }),
            }),
          }),
          update,
        }
      }
      return { update }
    }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getSupabaseClient).mockReturnValue(makeDb() as unknown as ReturnType<typeof getSupabaseClient>)
  vi.mocked(loadCapabilityMap).mockResolvedValue({} as CapabilityMap)
  vi.mocked(analyzeTask).mockResolvedValue(SUBTASKS)
  vi.mocked(matchCapabilities).mockReturnValue(SELECTIONS)
  vi.mocked(planExecution).mockReturnValue(PLAN)
  vi.mocked(assessRisk).mockReturnValue(PLAN)
  vi.mocked(publishEvent).mockResolvedValue(undefined as never)
})

describe("runIntelligencePipeline", () => {
  it("runs all 4 steps and returns summary", async () => {
    const result = await runIntelligencePipeline(TASK_ID)

    expect(analyzeTask).toHaveBeenCalledOnce()
    expect(matchCapabilities).toHaveBeenCalledOnce()
    expect(planExecution).toHaveBeenCalledOnce()
    expect(assessRisk).toHaveBeenCalledOnce()
    expect(publishEvent).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      taskId: TASK_ID,
      subtaskCount: 1,
      phaseCount: 1,
      totalEstimatedHours: 8,
      riskLevel: "low",
    })
  })

  it("throws if task status is not pending", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(makeDb({ status: "running" }) as unknown as ReturnType<typeof getSupabaseClient>)
    await expect(runIntelligencePipeline(TASK_ID)).rejects.toThrow("not pending")
  })

  it("throws if task not found", async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error("not found") }),
          }),
        }),
      }),
    }
    vi.mocked(getSupabaseClient).mockReturnValue(db as unknown as ReturnType<typeof getSupabaseClient>)
    await expect(runIntelligencePipeline(TASK_ID)).rejects.toThrow("Task not found")
  })
})
