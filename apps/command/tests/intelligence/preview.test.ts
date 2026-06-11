import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../src/intelligence/task-analyzer.js", () => ({ analyzeTask: vi.fn() }))
vi.mock("../../src/intelligence/capability-matcher.js", () => ({ matchCapabilities: vi.fn() }))
vi.mock("../../src/intelligence/execution-planner.js", () => ({ planExecution: vi.fn() }))
vi.mock("../../src/intelligence/risk-assessor.js", () => ({ assessRisk: vi.fn() }))
vi.mock("../../src/intelligence/capability-map/loader.js", () => ({ loadCapabilityMap: vi.fn() }))
vi.mock("../../src/command-center/client-memory.js", () => ({ loadClientMemory: vi.fn() }))

import { previewExecutionPlan } from "../../src/intelligence/preview.js"
import { analyzeTask } from "../../src/intelligence/task-analyzer.js"
import { matchCapabilities } from "../../src/intelligence/capability-matcher.js"
import { planExecution } from "../../src/intelligence/execution-planner.js"
import { assessRisk } from "../../src/intelligence/risk-assessor.js"
import { loadCapabilityMap } from "../../src/intelligence/capability-map/loader.js"
import { loadClientMemory } from "../../src/command-center/client-memory.js"
import type { AgentSelection, ClientMemory, ExecutionPlan, Subtask } from "../../src/types.js"
import type { CapabilityMap } from "../../src/intelligence/capability-map/types.js"

const SUBTASKS: Subtask[] = [
  { id: "sub-1", description: "Diseñar la landing", vertical: "webs-apps", skills: ["nextjs-shadcn"], estimatedHours: 6, dependencies: [] },
  { id: "sub-2", description: "Configurar chatbot", vertical: "chatbots", skills: ["rag-chatbots"], estimatedHours: 4, dependencies: ["sub-1"] },
]

const SELECTIONS: AgentSelection[] = [
  { subtaskId: "sub-1", agentId: "frontend-developer", score: 1, rationale: "matches web stack" },
  { subtaskId: "sub-2", agentId: "rag-chatbot-specialist", score: 1, rationale: "matches RAG" },
]

const PLAN: ExecutionPlan = {
  phases: [
    { phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "frontend-developer" }] },
    { phaseNumber: 2, subtasks: [{ subtaskId: "sub-2", agentId: "rag-chatbot-specialist" }] },
  ],
  checkpoints: [{ afterPhase: 1, reason: "Jose review required", requiredApproval: "jose" }],
  totalEstimatedHours: 10,
  riskLevel: "medium",
}

const CLIENT_MEMORY: ClientMemory = {
  id: "biodental",
  name: "Biodental",
  sector: "salud",
  previousProjects: ["HAT3X-004"],
  notes: "Demo de voz dental",
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadCapabilityMap).mockResolvedValue({} as CapabilityMap)
  vi.mocked(loadClientMemory).mockResolvedValue(CLIENT_MEMORY)
  vi.mocked(analyzeTask).mockResolvedValue(SUBTASKS)
  vi.mocked(matchCapabilities).mockReturnValue(SELECTIONS)
  vi.mocked(planExecution).mockReturnValue({ ...PLAN, checkpoints: [], riskLevel: "low" })
  vi.mocked(assessRisk).mockReturnValue(PLAN)
})

describe("previewExecutionPlan", () => {
  it("generates subtasks, selections and execution plan without persisting a task", async () => {
    const result = await previewExecutionPlan({
      orderRaw: "Crear web con chatbot para Biodental",
      clientId: "biodental",
    })

    expect(loadClientMemory).toHaveBeenCalledWith("biodental")
    expect(analyzeTask).toHaveBeenCalledWith("Crear web con chatbot para Biodental", CLIENT_MEMORY)
    expect(matchCapabilities).toHaveBeenCalledWith(SUBTASKS, expect.any(Object))
    expect(planExecution).toHaveBeenCalledWith(SUBTASKS, SELECTIONS)
    expect(assessRisk).toHaveBeenCalledOnce()
    expect(result).toEqual({ subtasks: SUBTASKS, selections: SELECTIONS, executionPlan: PLAN })
  })

  it("uses null client memory when no client is provided", async () => {
    await previewExecutionPlan({ orderRaw: "Tarea interna HAT3X" })

    expect(loadClientMemory).not.toHaveBeenCalled()
    expect(analyzeTask).toHaveBeenCalledWith("Tarea interna HAT3X", null)
  })
})
