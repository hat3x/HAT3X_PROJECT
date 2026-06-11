import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../src/database/client")

import { getSupabaseClient } from "../../src/database/client"

const MOCK_TASK = {
  id: "HAT3X-001",
  order_raw: "build a chatbot",
  status: "pending",
  control_mode: "supervised",
  subtasks: [
    {
      id: "sub-1",
      description: "Set up WhatsApp integration",
      vertical: "chatbots",
      skills: ["whatsapp-business"],
      estimatedHours: 8,
      dependencies: [],
    },
  ],
  execution_plan: {
    phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] }],
    checkpoints: [],
    totalEstimatedHours: 8,
    riskLevel: "low",
  },
}

function makeMockClient(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as any
}

describe("runPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches task and displays plan with phases", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(makeMockClient(MOCK_TASK))
    const { runPlan } = await import("../../src/cli/commands/plan")
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await runPlan("HAT3X-001")

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n")
    expect(output).toContain("HAT3X-001")
    expect(output).toContain("Phase 1")

    consoleSpy.mockRestore()
  })

  it("shows 'No execution plan' message when execution_plan is null", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeMockClient({ ...MOCK_TASK, execution_plan: null })
    )
    const { runPlan } = await import("../../src/cli/commands/plan")
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await runPlan("HAT3X-001")

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n")
    expect(output).toContain("No execution plan")

    consoleSpy.mockRestore()
  })

  it("throws when task not found (PGRST116 error)", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeMockClient(null, { code: "PGRST116", message: "not found" })
    )
    const { runPlan } = await import("../../src/cli/commands/plan")

    await expect(runPlan("HAT3X-999")).rejects.toThrow("Task HAT3X-999 not found")
  })
})
