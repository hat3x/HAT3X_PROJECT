import type { LearningReport } from "./types.js"

export function formatReport(report: LearningReport): string {
  const lines: string[] = [
    `🧠 *Learning Officer — Informe de Evolución*`,
    `Fecha: ${report.generatedAt.slice(0, 10)}`,
    `Señales procesadas: *${report.signalCount}*`,
    "",
  ]

  if (report.deltas.length > 0) {
    lines.push(`── Ajustes de Score (${report.deltas.length}) ──`)
    for (const d of report.deltas) {
      const sign = d.delta > 0 ? "+" : ""
      lines.push(`  [${d.vertical}] ${d.skill}: *${sign}${d.delta.toFixed(1)}*`)
      lines.push(`    ${d.reason}`)
    }
    lines.push("")
  }

  if (report.proposals.length > 0) {
    lines.push(`── Propuestas pendientes (${report.proposals.length}) ──`)
    for (const p of report.proposals) {
      lines.push(`  [${p.id}] (${p.impact}) ${p.description}`)
    }
    lines.push("")
  }

  if (report.antiPatterns.length > 0) {
    lines.push(`── Anti-Patterns detectados (${report.antiPatterns.length}) ──`)
    for (const ap of report.antiPatterns) {
      lines.push(`  [${ap.id}] ${ap.description}`)
    }
    lines.push("")
  }

  lines.push(report.summary)
  return lines.join("\n")
}
