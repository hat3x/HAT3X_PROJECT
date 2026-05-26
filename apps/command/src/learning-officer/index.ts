import { collectSignals } from "./collector.js"
import { analyzeSignals } from "./analyzer.js"
import { applyReport } from "./evolution-engine.js"
import { formatReport } from "./reporter.js"
import type { LearningSignal } from "./types.js"

export interface LearningCycleOptions {
  taskId?: string
  dryRun?: boolean
}

export async function runLearningCycle(
  sender: { sendEvolutionReport: (text: string) => Promise<void> },
  opts: LearningCycleOptions = {}
): Promise<string> {
  let signals: LearningSignal[] = await collectSignals()

  if (opts.taskId != null) {
    signals = signals.filter((s) => s.taskId === opts.taskId)
  }

  if (signals.length === 0) {
    const msg = "🧠 Learning Officer: no hay proyectos completados para analizar."
    await sender.sendEvolutionReport(msg)
    return msg
  }

  const report = analyzeSignals(signals)

  if (opts.dryRun !== true) {
    await applyReport(report)
  }

  const text = formatReport(report)
  await sender.sendEvolutionReport(text)

  return text
}
