import { describe, it, expect } from "vitest"
import { matchCapabilities } from "../../src/intelligence/capability-matcher"
import type { Subtask, AgentSelection } from "../../src/types"
import type { CapabilityMap } from "../../src/intelligence/capability-map/types"

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

const MOCK_SUBTASKS: Subtask[] = [
  { id: "sub-1", description: "Set up WhatsApp Business API", vertical: "chatbots", skills: ["whatsapp-business"], estimatedHours: 8, dependencies: [] },
  { id: "sub-2", description: "Create CRM pipeline", vertical: "crm", skills: ["integrations/crm"], estimatedHours: 4, dependencies: ["sub-1"] },
]

describe("matchCapabilities", () => {
  it("returns one AgentSelection per subtask", () => {
    const result = matchCapabilities(MOCK_SUBTASKS, MOCK_MAP)
    expect(result).toHaveLength(2)
  })

  it("assigns correct agentId from capability map", () => {
    const result = matchCapabilities(MOCK_SUBTASKS, MOCK_MAP)
    const chatbot = result.find((r) => r.subtaskId === "sub-1")
    expect(chatbot?.agentId).toBe("pm-chatbots")
    const crm = result.find((r) => r.subtaskId === "sub-2")
    expect(crm?.agentId).toBe("pm-automatizaciones")
  })

  it("score is between 0 and 1", () => {
    const result = matchCapabilities(MOCK_SUBTASKS, MOCK_MAP)
    for (const selection of result) {
      expect(selection.score).toBeGreaterThan(0)
      expect(selection.score).toBeLessThanOrEqual(1)
    }
  })

  it("provides non-empty rationale for each selection", () => {
    const result = matchCapabilities(MOCK_SUBTASKS, MOCK_MAP)
    for (const selection of result) {
      expect(typeof selection.rationale).toBe("string")
      expect(selection.rationale.length).toBeGreaterThan(0)
    }
  })
})
