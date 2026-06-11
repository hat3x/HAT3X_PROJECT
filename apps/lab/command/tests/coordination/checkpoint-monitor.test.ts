import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_SENDER = {
  sendCheckpointReminder: vi.fn().mockResolvedValue(undefined),
}

const STALE_ROW = {
  id: "CHK-001",
  task_id: "HAT3X-001",
  after_phase: 1,
  reason: "Old checkpoint",
  required_approval: "jose",
  status: "pending",
  feedback: null,
  triggered_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  resolved_at: null,
}

describe("checkTimeouts", () => {
  it("calls sendCheckpointReminder for each stale pending checkpoint", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: [STALE_ROW], error: null }),
          }),
        }),
      }),
    } as any)

    const { checkTimeouts } = await import("../../src/coordination/checkpoint-monitor")
    await checkTimeouts(MOCK_SENDER as any)

    expect(MOCK_SENDER.sendCheckpointReminder).toHaveBeenCalledOnce()
    const arg = MOCK_SENDER.sendCheckpointReminder.mock.calls[0][0]
    expect(arg.id).toBe("CHK-001")
  })

  it("does nothing when no stale checkpoints", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any)

    const { checkTimeouts } = await import("../../src/coordination/checkpoint-monitor")
    await checkTimeouts(MOCK_SENDER as any)

    expect(MOCK_SENDER.sendCheckpointReminder).not.toHaveBeenCalled()
  })

  it("throws when query fails", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
          }),
        }),
      }),
    } as any)

    const { checkTimeouts } = await import("../../src/coordination/checkpoint-monitor")
    await expect(checkTimeouts(MOCK_SENDER as any)).rejects.toThrow("Failed to query checkpoints")
  })
})
