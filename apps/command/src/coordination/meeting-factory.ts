import { getSupabaseClient } from "../database/client.js"
import { publishEvent } from "../state-bus/publisher.js"
import { EVENT_TYPES } from "../state-bus/event-types.js"
import type { HatMeeting, MeetingVote } from "./types.js"

interface CreateMeetingInput {
  taskId: string
  topic: string
  calledBy: string
}

interface CastVoteInput {
  meetingId: string
  agentId: string
  position: string
  confidence: number
  round: number
}

let _meetingCounter = 0
let _voteCounter = 0

function nextMeetingId(): string {
  _meetingCounter++
  return `MTG-${String(_meetingCounter).padStart(3, "0")}`
}

function nextVoteId(): string {
  _voteCounter++
  return `VOT-${String(_voteCounter).padStart(3, "0")}`
}

export async function createMeeting(input: CreateMeetingInput): Promise<HatMeeting> {
  const id = nextMeetingId()
  const now = new Date().toISOString()

  const row = {
    id,
    task_id: input.taskId,
    topic: input.topic,
    called_by: input.calledBy,
    status: "open" as const,
    round: 1,
    consensus: null,
    created_at: now,
    resolved_at: null,
  }

  const { error } = await getSupabaseClient().from("hat3x_meetings").insert(row)
  if (error != null) throw new Error(`Failed to create meeting: ${error.message}`)

  await publishEvent({
    taskId: input.taskId,
    eventType: EVENT_TYPES.MEETING_CALLED,
    agentId: input.calledBy,
    payload: { meeting: row },
  })

  return {
    id,
    taskId: input.taskId,
    topic: input.topic,
    calledBy: input.calledBy,
    status: "open",
    round: 1,
    consensus: null,
    createdAt: now,
    resolvedAt: null,
  }
}

export async function castVote(input: CastVoteInput): Promise<MeetingVote> {
  const id = nextVoteId()
  const now = new Date().toISOString()

  const row = {
    id,
    meeting_id: input.meetingId,
    agent_id: input.agentId,
    position: input.position,
    confidence: input.confidence,
    round: input.round,
    voted_at: now,
  }

  const { error } = await getSupabaseClient().from("hat3x_meeting_votes").insert(row)
  if (error != null) throw new Error(`Failed to cast vote: ${error.message}`)

  return {
    id,
    meetingId: input.meetingId,
    agentId: input.agentId,
    position: input.position,
    confidence: input.confidence,
    round: input.round,
    votedAt: now,
  }
}

export async function getVotes(meetingId: string, round: number): Promise<MeetingVote[]> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_meeting_votes")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("round", round)

  if (error != null) throw new Error(`Failed to get votes: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row["id"] as string,
    meetingId: row["meeting_id"] as string,
    agentId: row["agent_id"] as string,
    position: row["position"] as string,
    confidence: row["confidence"] as number,
    round: row["round"] as number,
    votedAt: row["voted_at"] as string,
  }))
}

export async function closeMeeting(meetingId: string, consensus: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("hat3x_meetings")
    .update({ status: "resolved", consensus, resolved_at: new Date().toISOString() })
    .eq("id", meetingId)

  if (error != null) throw new Error(`Failed to close meeting: ${error.message}`)
}

export async function escalateMeeting(meetingId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("hat3x_meetings")
    .update({ status: "escalated", resolved_at: new Date().toISOString() })
    .eq("id", meetingId)

  if (error != null) throw new Error(`Failed to escalate meeting: ${error.message}`)
}
