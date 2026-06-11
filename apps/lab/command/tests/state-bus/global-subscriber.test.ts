import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

const MOCK_SENDER = {
  sendCheckpointAlert: vi.fn().mockResolvedValue(undefined),
  sendTaskCompleted: vi.fn().mockResolvedValue(undefined),
  sendAgentBlocked: vi.fn().mockResolvedValue(undefined),
}

const MOCK_CHANNEL_BASE = {
  subscribe: vi.fn().mockImplementation((cb) => {
    cb("SUBSCRIBED", null)
    return MOCK_CHANNEL_BASE
  }),
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.resetModules()
})

describe("createGlobalSubscriber", () => {
  it("subscribes to bus_events and resolves", async () => {
    const MOCK_ON = vi.fn().mockReturnThis()
    vi.mocked(getSupabaseClient).mockReturnValue({
      channel: vi.fn().mockReturnValue({ on: MOCK_ON, ...MOCK_CHANNEL_BASE }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()

    expect(MOCK_ON).toHaveBeenCalledOnce()
  })

  it("calls sendCheckpointAlert when checkpoint.triggered event received", async () => {
    const MOCK_CHECKPOINT_ROW = {
      id: "CHK-001",
      task_id: "HAT3X-001",
      after_phase: 1,
      reason: "Test",
      required_approval: "jose",
      status: "pending",
      feedback: null,
      triggered_at: new Date().toISOString(),
      resolved_at: null,
    }

    vi.mocked(getSupabaseClient).mockReturnValue({
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((_type, _opts, handler) => {
          void Promise.resolve().then(() =>
            handler({
              new: {
                task_id: "HAT3X-001",
                event_type: "checkpoint.triggered",
                agent_id: null,
                payload: { checkpoint: MOCK_CHECKPOINT_ROW },
              },
            })
          )
          return { subscribe: vi.fn().mockImplementation((cb) => { cb("SUBSCRIBED", null) }) }
        }),
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()
    await new Promise((r) => setTimeout(r, 20))

    expect(MOCK_SENDER.sendCheckpointAlert).toHaveBeenCalledOnce()
  })

  it("calls sendTaskCompleted when task.completed event received", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((_type, _opts, handler) => {
          void Promise.resolve().then(() =>
            handler({
              new: {
                task_id: "HAT3X-001",
                event_type: "task.completed",
                agent_id: "pm-chatbots",
                payload: { summary: "Chatbot entregado" },
              },
            })
          )
          return { subscribe: vi.fn().mockImplementation((cb) => { cb("SUBSCRIBED", null) }) }
        }),
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()
    await new Promise((r) => setTimeout(r, 20))

    expect(MOCK_SENDER.sendTaskCompleted).toHaveBeenCalledWith("HAT3X-001", "Chatbot entregado")
  })
})
