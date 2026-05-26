import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

const MOCK_SENDER = {
  sendCheckpointAlert: vi.fn().mockResolvedValue(undefined),
  sendTaskCompleted: vi.fn().mockResolvedValue(undefined),
  sendAgentBlocked: vi.fn().mockResolvedValue(undefined),
  sendMeetingCalled: vi.fn().mockResolvedValue(undefined),
  sendMeetingResolved: vi.fn().mockResolvedValue(undefined),
  sendCheckpointReminder: vi.fn().mockResolvedValue(undefined),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

function makeMockChannel(eventRow: Record<string, unknown>) {
  return {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation((_type: unknown, _opts: unknown, handler: (p: { new: Record<string, unknown> }) => void) => {
        void Promise.resolve().then(() => handler({ new: eventRow }))
        return { subscribe: vi.fn().mockImplementation((cb: (s: string, e: null) => void) => { cb("SUBSCRIBED", null) }) }
      }),
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  }
}

describe("meeting.called routing", () => {
  it("calls sendMeetingCalled when meeting.called event received", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(makeMockChannel({
      task_id: "HAT3X-001",
      event_type: "meeting.called",
      agent_id: "pm-chatbots",
      payload: { meeting: { id: "MTG-001", topic: "Launch?", called_by: "pm-chatbots" } },
    }) as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()
    await new Promise((r) => setTimeout(r, 20))

    expect(MOCK_SENDER.sendMeetingCalled).toHaveBeenCalledOnce()
    expect(MOCK_SENDER.sendMeetingCalled).toHaveBeenCalledWith("MTG-001", "HAT3X-001", "Launch?", "pm-chatbots")
  })
})

describe("meeting.resolved routing", () => {
  it("calls sendMeetingResolved when meeting.resolved event received", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(makeMockChannel({
      task_id: "HAT3X-001",
      event_type: "meeting.resolved",
      agent_id: null,
      payload: { meeting: { id: "MTG-001", consensus: "launch" } },
    }) as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()
    await new Promise((r) => setTimeout(r, 20))

    expect(MOCK_SENDER.sendMeetingResolved).toHaveBeenCalledWith("MTG-001", "HAT3X-001", "launch")
  })
})
