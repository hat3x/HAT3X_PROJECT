import { closeMeeting, escalateMeeting } from "./meeting-factory.js"
import { createCheckpoint } from "../checkpoint/factory.js"
import { publishEvent } from "../state-bus/publisher.js"
import { EVENT_TYPES } from "../state-bus/event-types.js"
import type { HatMeeting, MeetingVote, ConsensusResult } from "./types.js"
import type { HatCheckpoint } from "../checkpoint/types.js"

export function detectConsensus(votes: MeetingVote[]): ConsensusResult {
  if (votes.length === 0) {
    return { reached: false, position: null, avgConfidence: 0, majorityPosition: null }
  }

  const avgConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length

  // Count votes per position
  const counts = new Map<string, number>()
  for (const vote of votes) {
    counts.set(vote.position, (counts.get(vote.position) ?? 0) + 1)
  }

  // Find position with most votes
  let topPosition: string | null = null
  let topCount = 0
  for (const [pos, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count
      topPosition = pos
    }
  }

  const majorityReached = topCount > votes.length / 2
  const confidenceReached = avgConfidence >= 0.70

  return {
    reached: majorityReached && confidenceReached,
    position: majorityReached && confidenceReached ? topPosition : null,
    avgConfidence,
    majorityPosition: topPosition,
  }
}

export async function maybeEscalate(
  meeting: HatMeeting,
  votes: MeetingVote[]
): Promise<HatCheckpoint | null> {
  const consensus = detectConsensus(votes)

  if (consensus.reached && consensus.position != null) {
    await closeMeeting(meeting.id, consensus.position)
    await publishEvent({
      taskId: meeting.taskId,
      eventType: EVENT_TYPES.MEETING_RESOLVED,
      agentId: null,
      payload: { meeting: { id: meeting.id, consensus: consensus.position } },
    })
    return null
  }

  // Only escalate when no consensus after round 2+
  if (meeting.round < 2) {
    return null
  }

  // Escalate: create checkpoint + update meeting + publish event
  const checkpoint = await createCheckpoint({
    taskId: meeting.taskId,
    afterPhase: meeting.round,
    reason: `No consensus after ${meeting.round} rounds: ${meeting.topic}`,
    requiredApproval: "jose",
  })

  await escalateMeeting(meeting.id)

  await publishEvent({
    taskId: meeting.taskId,
    eventType: EVENT_TYPES.CHECKPOINT_TRIGGERED,
    agentId: null,
    payload: { checkpoint, meetingId: meeting.id },
  })

  return checkpoint
}
