import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_TASK = { id: "HAT3X-001", title: "Chatbot web", status: "active", priority: "high", current_phase: 2 }
const MOCK_MEETING = { id: "MTG-001", task_id: "HAT3X-001", topic: "Launch?", status: "open", round: 1, called_by: "pm-chatbots", created_at: new Date().toISOString() }
const MOCK_CHECKPOINT = { id: "CHK-001", task_id: "HAT3X-001", reason: "No consensus", status: "pending", triggered_at: new Date().toISOString() }

describe("fetchProgressData", () => {
  it("returns task, open meetings, and pending checkpoints", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "hat3x_tasks") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: MOCK_TASK, error: null }) }) }) }
        }
        if (table === "hat3x_meetings") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [MOCK_MEETING], error: null }) }) }) }
        }
        if (table === "hat3x_checkpoints") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [MOCK_CHECKPOINT], error: null }) }) }) }
        }
        return {}
      }),
    } as any)

    const { fetchProgressData } = await import("../../src/cli/commands/progress")
    const result = await fetchProgressData("HAT3X-001")

    expect(result.task["id"]).toBe("HAT3X-001")
    expect(result.meetings).toHaveLength(1)
    expect(result.checkpoints).toHaveLength(1)
  })

  it("throws when task not found", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }) })
        })
      }),
    } as any)

    const { fetchProgressData } = await import("../../src/cli/commands/progress")
    await expect(fetchProgressData("MISSING")).rejects.toThrow("Task not found")
  })
})
