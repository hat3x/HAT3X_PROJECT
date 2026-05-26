import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../../src/database/client")
vi.mock("../../src/coordination/meeting-factory")
vi.mock("../../src/checkpoint/factory")
vi.mock("../../src/state-bus/publisher")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

function makeVote(position: string, confidence: number, agentId = "agent-1") {
  return { id: "V1", meetingId: "MTG-001", agentId, position, confidence, round: 1, votedAt: "" }
}

describe("detectConsensus", () => {
  it("returns reached:true when avg confidence >= 0.70 and majority position > 50%", async () => {
    const { detectConsensus } = await import("../../src/coordination/meeting-facilitator")
    const votes = [
      makeVote("launch", 0.85, "a1"),
      makeVote("launch", 0.80, "a2"),
      makeVote("delay", 0.60, "a3"),
    ]
    const result = detectConsensus(votes)
    expect(result.reached).toBe(true)
    expect(result.position).toBe("launch")
    expect(result.avgConfidence).toBeCloseTo(0.75)
  })

  it("returns reached:false when avg confidence < 0.70", async () => {
    const { detectConsensus } = await import("../../src/coordination/meeting-facilitator")
    const votes = [
      makeVote("launch", 0.60, "a1"),
      makeVote("launch", 0.65, "a2"),
    ]
    const result = detectConsensus(votes)
    expect(result.reached).toBe(false)
  })

  it("returns reached:false when majority <= 50%", async () => {
    const { detectConsensus } = await import("../../src/coordination/meeting-facilitator")
    const votes = [
      makeVote("launch", 0.90, "a1"),
      makeVote("delay", 0.90, "a2"),
    ]
    const result = detectConsensus(votes)
    expect(result.reached).toBe(false)
  })

  it("returns reached:false for empty votes", async () => {
    const { detectConsensus } = await import("../../src/coordination/meeting-facilitator")
    const result = detectConsensus([])
    expect(result.reached).toBe(false)
    expect(result.avgConfidence).toBe(0)
  })
})

describe("maybeEscalate", () => {
  it("does NOT escalate when round < 2 and consensus reached", async () => {
    const meetingFactoryModule = await import("../../src/coordination/meeting-factory")
    vi.mocked(meetingFactoryModule.closeMeeting).mockResolvedValue(undefined)

    const { maybeEscalate } = await import("../../src/coordination/meeting-facilitator")
    const meeting = { id: "MTG-001", taskId: "T1", topic: "test", calledBy: "a1",
      status: "open" as const, round: 1, consensus: null, createdAt: "", resolvedAt: null }
    const votes = [makeVote("launch", 0.90, "a1"), makeVote("launch", 0.90, "a2")]

    const checkpoint = await maybeEscalate(meeting, votes)
    expect(checkpoint).toBeNull()
    expect(meetingFactoryModule.closeMeeting).toHaveBeenCalledWith("MTG-001", "launch")
  })

  it("escalates to checkpoint when round >= 2 and no consensus", async () => {
    const meetingFactoryModule = await import("../../src/coordination/meeting-factory")
    const checkpointModule = await import("../../src/checkpoint/factory")
    const publisherModule = await import("../../src/state-bus/publisher")

    vi.mocked(meetingFactoryModule.escalateMeeting).mockResolvedValue(undefined)
    vi.mocked(checkpointModule.createCheckpoint).mockResolvedValue({
      id: "CHK-001", taskId: "T1", afterPhase: 2, reason: "No consensus after 2 rounds: test",
      requiredApproval: "jose", status: "pending", feedback: null,
      triggeredAt: "", resolvedAt: null,
    })
    vi.mocked(publisherModule.publishEvent).mockResolvedValue(undefined)

    const { maybeEscalate } = await import("../../src/coordination/meeting-facilitator")
    const meeting = { id: "MTG-001", taskId: "T1", topic: "test", calledBy: "a1",
      status: "open" as const, round: 2, consensus: null, createdAt: "", resolvedAt: null }
    const votes = [makeVote("launch", 0.50, "a1"), makeVote("delay", 0.50, "a2")]

    const checkpoint = await maybeEscalate(meeting, votes)
    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.id).toBe("CHK-001")
    expect(meetingFactoryModule.escalateMeeting).toHaveBeenCalledWith("MTG-001")
    expect(publisherModule.publishEvent).toHaveBeenCalled()
  })
})
