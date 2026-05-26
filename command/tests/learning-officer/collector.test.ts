import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_TASK = {
  id: "HAT3X-001",
  order_raw: "Chatbot web para clínica",
  status: "completed",
  control_mode: "autopilot",
  subtasks: [
    { id: "S1", vertical: "chatbots", description: "RAG setup" },
    { id: "S2", vertical: "chatbots", description: "API" },
  ],
  execution_plan: {
    phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: "S1", agentId: "pm-chatbots" }] }],
  },
  created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
}

const MOCK_CHECKPOINT_APPROVED = {
  id: "CHK-001",
  task_id: "HAT3X-001",
  reason: "Deployment ready",
  status: "approved",
  feedback: "Excellent work, very fast delivery",
  triggered_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  resolved_at: new Date().toISOString(),
}

describe("collectSignals", () => {
  it("returns one signal per completed task with outcome=success for approved checkpoint", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "hat3x_tasks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [MOCK_TASK], error: null }),
            }),
          }
        }
        if (table === "hat3x_checkpoints") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: [MOCK_CHECKPOINT_APPROVED], error: null }),
              }),
            }),
          }
        }
        return {}
      }),
    } as any)

    const { collectSignals } = await import("../../src/learning-officer/collector")
    const signals = await collectSignals()

    expect(signals).toHaveLength(1)
    expect(signals[0].taskId).toBe("HAT3X-001")
    expect(signals[0].vertical).toBe("chatbots")
    expect(signals[0].agentId).toBe("pm-chatbots")
    expect(signals[0].outcome).toBe("success")
    expect(signals[0].checkpointFeedback).toContain("fast delivery")
  })

  it("maps rejected checkpoint to outcome=failure", async () => {
    const rejectedCheckpoint = { ...MOCK_CHECKPOINT_APPROVED, status: "rejected", feedback: "Missing tests" }

    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "hat3x_tasks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [MOCK_TASK], error: null }),
            }),
          }
        }
        if (table === "hat3x_checkpoints") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: [rejectedCheckpoint], error: null }),
              }),
            }),
          }
        }
        return {}
      }),
    } as any)

    const { collectSignals } = await import("../../src/learning-officer/collector")
    const signals = await collectSignals()

    expect(signals[0].outcome).toBe("failure")
  })

  it("returns empty array when no completed tasks", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as any)

    const { collectSignals } = await import("../../src/learning-officer/collector")
    const signals = await collectSignals()
    expect(signals).toHaveLength(0)
  })

  it("throws when tasks query fails", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      }),
    } as any)

    const { collectSignals } = await import("../../src/learning-officer/collector")
    await expect(collectSignals()).rejects.toThrow("Failed to collect tasks")
  })
})
