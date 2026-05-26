import { describe, it, expect, expectTypeOf } from "vitest"
import type { HatMeeting, MeetingVote, ConsensusResult, MeetingStatus } from "../../src/coordination/types"

describe("coordination types", () => {
  it("HatMeeting has required fields", () => {
    expectTypeOf<HatMeeting>().toHaveProperty("id")
    expectTypeOf<HatMeeting>().toHaveProperty("taskId")
    expectTypeOf<HatMeeting>().toHaveProperty("topic")
    expectTypeOf<HatMeeting>().toHaveProperty("calledBy")
    expectTypeOf<HatMeeting>().toHaveProperty("status")
    expectTypeOf<HatMeeting>().toHaveProperty("round")
  })

  it("MeetingVote has required fields", () => {
    expectTypeOf<MeetingVote>().toHaveProperty("id")
    expectTypeOf<MeetingVote>().toHaveProperty("meetingId")
    expectTypeOf<MeetingVote>().toHaveProperty("agentId")
    expectTypeOf<MeetingVote>().toHaveProperty("position")
    expectTypeOf<MeetingVote>().toHaveProperty("confidence")
    expectTypeOf<MeetingVote>().toHaveProperty("round")
  })

  it("ConsensusResult has reached and optional fields", () => {
    expectTypeOf<ConsensusResult>().toHaveProperty("reached")
    expectTypeOf<ConsensusResult>().toHaveProperty("position")
    expectTypeOf<ConsensusResult>().toHaveProperty("avgConfidence")
  })

  it("MeetingStatus is a union of literals", () => {
    const s: MeetingStatus = "open"
    const s2: MeetingStatus = "resolved"
    const s3: MeetingStatus = "escalated"
    expect([s, s2, s3]).toEqual(["open", "resolved", "escalated"])
  })
})
