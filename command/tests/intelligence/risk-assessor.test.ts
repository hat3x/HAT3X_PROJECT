import { describe, it, expect } from "vitest"
import { assessRisk } from "../../src/intelligence/risk-assessor"
import type { ExecutionPlan, Phase, Subtask } from "../../src/types"
import type { CapabilityMap } from "../../src/intelligence/capability-map/types"

function makePlan(phases: Phase[], totalHours: number): ExecutionPlan {
  return { phases, checkpoints: [], totalEstimatedHours: totalHours, riskLevel: "low" }
}

const MOCK_MAP: CapabilityMap = {
  chatbots: { vertical: "chatbots", agentId: "pm-chatbots", skills: ["rag-chatbots", "whatsapp-business", "voice-prompt-engineering"], maxParallelSubtasks: 3, typicalHoursPerSubtask: 8, requiresClientApproval: true },
  crm: { vertical: "crm", agentId: "pm-automatizaciones", skills: ["integrations/crm", "integrations/database", "api-design"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 4, requiresClientApproval: false },
  voz: { vertical: "voz", agentId: "pm-voz", skills: ["retell-ai", "elevenlabs", "voice-prompt-engineering"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 10, requiresClientApproval: true },
  "webs-apps": { vertical: "webs-apps", agentId: "pm-webs-apps", skills: ["nextjs-shadcn", "supabase-rls", "testing-vitest"], maxParallelSubtasks: 4, typicalHoursPerSubtask: 6, requiresClientApproval: true },
  automatizaciones: { vertical: "automatizaciones", agentId: "pm-automatizaciones", skills: ["n8n-advanced", "integrations/crm", "api-design"], maxParallelSubtasks: 3, typicalHoursPerSubtask: 5, requiresClientApproval: false },
  calendar: { vertical: "calendar", agentId: "pm-automatizaciones", skills: ["integrations/calendar", "integrations/crm", "n8n-advanced"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 3, requiresClientApproval: false },
  database: { vertical: "database", agentId: "pm-webs-apps", skills: ["supabase-rls", "integrations/database", "api-design"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 4, requiresClientApproval: false },
  github: { vertical: "github", agentId: "pm-webs-apps", skills: ["github", "testing-qa", "agile-workflow"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 3, requiresClientApproval: false },
  testing: { vertical: "testing", agentId: "pm-webs-apps", skills: ["testing-qa", "testing-vitest", "code-review"], maxParallelSubtasks: 3, typicalHoursPerSubtask: 4, requiresClientApproval: false },
  security: { vertical: "security", agentId: "pm-webs-apps", skills: ["security-audit", "code-review", "api-design"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 5, requiresClientApproval: true },
  documentation: { vertical: "documentation", agentId: "pm-webs-apps", skills: ["documentation", "api-design", "agile-workflow"], maxParallelSubtasks: 3, typicalHoursPerSubtask: 3, requiresClientApproval: false },
  deployment: { vertical: "deployment", agentId: "pm-webs-apps", skills: ["deploy-vercel", "github", "testing-vitest"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 3, requiresClientApproval: false },
}

describe("assessRisk", () => {
  it("returns low risk and no checkpoints for short single-phase plan", () => {
    const plan = makePlan(
      [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-automatizaciones" }] }],
      8
    )
    const subtasks: Subtask[] = [
      { id: "sub-1", description: "", vertical: "crm", skills: [], estimatedHours: 8, dependencies: [] },
    ]
    const result = assessRisk(plan, subtasks, MOCK_MAP)
    expect(result.riskLevel).toBe("low")
    expect(result.checkpoints).toHaveLength(0)
  })

  it("returns medium risk for 21-40 hours", () => {
    const plan = makePlan(
      [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-crm" }] }],
      30
    )
    const subtasks: Subtask[] = [
      { id: "sub-1", description: "", vertical: "crm", skills: [], estimatedHours: 30, dependencies: [] },
    ]
    const result = assessRisk(plan, subtasks, MOCK_MAP)
    expect(result.riskLevel).toBe("medium")
  })

  it("returns high risk for > 40 hours", () => {
    const plan = makePlan(
      [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-crm" }] }],
      45
    )
    const subtasks: Subtask[] = [
      { id: "sub-1", description: "", vertical: "crm", skills: [], estimatedHours: 45, dependencies: [] },
    ]
    const result = assessRisk(plan, subtasks, MOCK_MAP)
    expect(result.riskLevel).toBe("high")
  })

  it("injects checkpoint after phase 1 when medium risk and multi-phase", () => {
    const plan = makePlan(
      [
        { phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-crm" }] },
        { phaseNumber: 2, subtasks: [{ subtaskId: "sub-2", agentId: "pm-crm" }] },
      ],
      25
    )
    const subtasks: Subtask[] = [
      { id: "sub-1", description: "", vertical: "crm", skills: [], estimatedHours: 12, dependencies: [] },
      { id: "sub-2", description: "", vertical: "crm", skills: [], estimatedHours: 13, dependencies: ["sub-1"] },
    ]
    const result = assessRisk(plan, subtasks, MOCK_MAP)
    expect(result.checkpoints.length).toBeGreaterThan(0)
    const cp = result.checkpoints.find((c) => c.afterPhase === 1)
    expect(cp).toBeDefined()
    expect(cp!.requiredApproval).toBe("jose")
  })

  it("injects client checkpoint when phase has requiresClientApproval vertical", () => {
    const plan = makePlan(
      [
        { phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] },
        { phaseNumber: 2, subtasks: [{ subtaskId: "sub-2", agentId: "pm-chatbots" }] },
      ],
      25
    )
    const subtasks: Subtask[] = [
      { id: "sub-1", description: "", vertical: "chatbots", skills: [], estimatedHours: 12, dependencies: [] },
      { id: "sub-2", description: "", vertical: "chatbots", skills: [], estimatedHours: 13, dependencies: ["sub-1"] },
    ]
    const result = assessRisk(plan, subtasks, MOCK_MAP)
    const cp = result.checkpoints.find((c) => c.afterPhase === 1)
    expect(cp).toBeDefined()
    expect(cp!.requiredApproval).toBe("both")
  })
})
