export type MeetingStatus = "open" | "resolved" | "escalated"

export interface HatMeeting {
  id: string
  taskId: string
  topic: string
  calledBy: string
  status: MeetingStatus
  round: number
  consensus: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface MeetingVote {
  id: string
  meetingId: string
  agentId: string
  position: string
  confidence: number  // 0.00 – 1.00
  round: number
  votedAt: string
}

export interface ConsensusResult {
  reached: boolean
  position: string | null
  avgConfidence: number
  majorityPosition: string | null
}
