import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")
vi.mock("../../src/state-bus/publisher")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_INSERT = vi.fn().mockResolvedValue({ error: null })

describe("createMeeting", () => {
  it("inserts to hat3x_meetings and returns HatMeeting", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: MOCK_INSERT }),
    } as any)

    const { createMeeting } = await import("../../src/coordination/meeting-factory")
    const meeting = await createMeeting({ taskId: "HAT3X-001", topic: "Launch scope?", calledBy: "pm-chatbots" })

    expect(MOCK_INSERT).toHaveBeenCalledOnce()
    expect(meeting.taskId).toBe("HAT3X-001")
    expect(meeting.topic).toBe("Launch scope?")
    expect(meeting.calledBy).toBe("pm-chatbots")
    expect(meeting.status).toBe("open")
    expect(meeting.round).toBe(1)
    expect(meeting.id).toMatch(/^MTG-\d{3}$/)
  })

  it("throws if insert fails", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: "DB error" } }) }),
    } as any)

    const { createMeeting } = await import("../../src/coordination/meeting-factory")
    await expect(createMeeting({ taskId: "T1", topic: "test", calledBy: "agent" })).rejects.toThrow("Failed to create meeting")
  })
})

describe("castVote", () => {
  it("inserts to hat3x_meeting_votes and returns MeetingVote", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: MOCK_INSERT }),
    } as any)

    const { castVote } = await import("../../src/coordination/meeting-factory")
    const vote = await castVote({ meetingId: "MTG-001", agentId: "pm-voz", position: "delay", confidence: 0.6, round: 1 })

    expect(MOCK_INSERT).toHaveBeenCalledOnce()
    expect(vote.position).toBe("delay")
    expect(vote.confidence).toBe(0.6)
  })
})

describe("closeMeeting", () => {
  it("updates meeting to resolved with consensus", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      }),
    } as any)

    const { closeMeeting } = await import("../../src/coordination/meeting-factory")
    await expect(closeMeeting("MTG-001", "launch")).resolves.toBeUndefined()
  })
})

describe("escalateMeeting", () => {
  it("updates meeting to escalated", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      }),
    } as any)

    const { escalateMeeting } = await import("../../src/coordination/meeting-factory")
    await expect(escalateMeeting("MTG-001")).resolves.toBeUndefined()
  })
})
