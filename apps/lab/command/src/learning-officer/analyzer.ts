import type { LearningSignal, LearningReport, ScoreDelta, EvolutionProposal } from "./types.js"

const PRIMARY_SKILL: Record<string, string> = {
  chatbots: "rag-chatbots",
  voz: "retell-ai",
  "webs-apps": "nextjs-shadcn",
  automatizaciones: "n8n-advanced",
  crm: "integrations/crm",
  calendar: "integrations/calendar",
  database: "integrations/database",
  github: "github",
  testing: "testing-qa",
  security: "security-audit",
  documentation: "documentation",
  deployment: "deploy-vercel",
}

let _proposalCounter = 0
function nextProposalId(): string {
  _proposalCounter++
  return `PROP-${String(_proposalCounter).padStart(3, "0")}`
}

export function analyzeSignals(signals: LearningSignal[]): LearningReport {
  const deltas: ScoreDelta[] = []
  const proposals: EvolutionProposal[] = []
  const failuresByVertical = new Map<string, string[]>()

  for (const signal of signals) {
    if (signal.outcome === "success" && signal.checkpointFeedback != null) {
      const skill = PRIMARY_SKILL[signal.vertical] ?? signal.vertical
      deltas.push({
        vertical: signal.vertical,
        skill,
        delta: 0.1,
        reason: `Task ${signal.taskId} approved with positive feedback`,
      })
    }

    if (signal.outcome === "failure") {
      const skill = PRIMARY_SKILL[signal.vertical] ?? signal.vertical
      deltas.push({
        vertical: signal.vertical,
        skill,
        delta: -0.1,
        reason: `Task ${signal.taskId} failed${signal.failureReason ? `: ${signal.failureReason}` : ""}`,
      })

      if (!failuresByVertical.has(signal.vertical)) {
        failuresByVertical.set(signal.vertical, [])
      }
      failuresByVertical.get(signal.vertical)!.push(signal.taskId)
    }
  }

  for (const [vertical, taskIds] of failuresByVertical.entries()) {
    if (taskIds.length >= 2) {
      proposals.push({
        id: nextProposalId(),
        description: `Vertical '${vertical}' has failed in ${taskIds.length} tasks (${taskIds.join(", ")}). Consider reviewing agent config or adding mandatory skills.`,
        impact: "medium",
        evidence: { vertical, failedTasks: taskIds },
      })
    }
  }

  const summary = signals.length === 0
    ? "No hay señales para analizar."
    : `${signals.length} señal(es) procesada(s). ${deltas.length} ajuste(s) de score. ${proposals.length} propuesta(s) generada(s).`

  return {
    generatedAt: new Date().toISOString(),
    signalCount: signals.length,
    deltas,
    proposals,
    antiPatterns: [],
    summary,
  }
}
