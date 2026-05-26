export type SignalOutcome = "success" | "partial" | "failure"
export type ProposalImpact = "low" | "medium" | "high"

export interface LearningSignal {
  taskId: string
  vertical: string
  agentId: string
  outcome: SignalOutcome
  checkpointFeedback: string | null
  durationHours: number | null
  failureReason: string | null
}

export interface ScoreDelta {
  vertical: string
  skill: string
  delta: number
  reason: string
}

export interface AntiPattern {
  id: string
  description: string
  affectedVerticals: string[]
  detectedFrom: string
}

export interface EvolutionProposal {
  id: string
  description: string
  impact: ProposalImpact
  evidence: Record<string, unknown>
}

export interface LearningReport {
  generatedAt: string
  signalCount: number
  deltas: ScoreDelta[]
  proposals: EvolutionProposal[]
  antiPatterns: AntiPattern[]
  summary: string
}
