import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_SUBTASKS = [
  {
    id: "sub-1",
    description: "Set up WhatsApp Business API integration",
    vertical: "chatbots",
    skills: ["whatsapp-business", "integrations/crm"],
    estimatedHours: 8,
    dependencies: [],
  },
  {
    id: "sub-2",
    description: "Create HubSpot CRM pipeline for new contacts",
    vertical: "crm",
    skills: ["integrations/crm"],
    estimatedHours: 4,
    dependencies: ["sub-1"],
  },
]

vi.mock("openai", () => {
  const mockCreate = vi.fn()
  return {
    default: class MockOpenAI {
      responses = { create: mockCreate }
    },
    _mockCreate: mockCreate,
  }
})

describe("analyzeTask", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env["OPENAI_API_KEY"] = "test-key"
    const sdk = await import("openai")
    ;(sdk as any)._mockCreate.mockResolvedValue({
      output_text: JSON.stringify(MOCK_SUBTASKS),
      output: [],
    })
  })

  it("returns subtasks from LLM response", async () => {
    const { analyzeTask } = await import("../../src/intelligence/task-analyzer")
    const result = await analyzeTask("Integra WhatsApp con HubSpot", null)
    expect(result).toHaveLength(2)
    expect(result[0]!.vertical).toBe("chatbots")
    expect(result[1]!.vertical).toBe("crm")
  })

  it("each subtask has all required fields", async () => {
    const { analyzeTask } = await import("../../src/intelligence/task-analyzer")
    const result = await analyzeTask("any order", null)
    for (const subtask of result) {
      expect(typeof subtask.id).toBe("string")
      expect(typeof subtask.description).toBe("string")
      expect(typeof subtask.vertical).toBe("string")
      expect(Array.isArray(subtask.skills)).toBe(true)
      expect(typeof subtask.estimatedHours).toBe("number")
      expect(Array.isArray(subtask.dependencies)).toBe(true)
    }
  })

  it("throws if LLM returns malformed JSON", async () => {
    const sdk = await import("openai")
    ;(sdk as any)._mockCreate.mockResolvedValue({
      output_text: "not json at all",
      output: [],
    })
    const { analyzeTask } = await import("../../src/intelligence/task-analyzer")
    await expect(analyzeTask("any order", null)).rejects.toThrow("Invalid LLM response")
  })
})
