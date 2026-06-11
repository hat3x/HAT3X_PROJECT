import { describe, it, expect } from "vitest"
import type { LearningReport } from "../../src/learning-officer/types"

function makeReport(overrides: Partial<LearningReport> = {}): LearningReport {
  return {
    generatedAt: new Date().toISOString(),
    signalCount: 3,
    deltas: [
      { vertical: "chatbots", skill: "rag-chatbots", delta: 0.1, reason: "Task HAT3X-001 approved" },
      { vertical: "voz", skill: "retell-ai", delta: -0.1, reason: "Task HAT3X-002 failed" },
    ],
    proposals: [
      { id: "PROP-001", description: "Review voz config", impact: "medium", evidence: {} },
    ],
    antiPatterns: [],
    summary: "3 señales procesadas. 2 ajustes. 1 propuesta.",
    ...overrides,
  }
}

describe("formatReport", () => {
  it("includes signal count in output", async () => {
    const { formatReport } = await import("../../src/learning-officer/reporter")
    const text = formatReport(makeReport())
    expect(text).toContain("3")
  })

  it("lists score adjustments with sign", async () => {
    const { formatReport } = await import("../../src/learning-officer/reporter")
    const text = formatReport(makeReport())
    expect(text).toContain("chatbots")
    expect(text).toContain("+0.1")
    expect(text).toContain("-0.1")
  })

  it("lists proposals with id", async () => {
    const { formatReport } = await import("../../src/learning-officer/reporter")
    const text = formatReport(makeReport())
    expect(text).toContain("PROP-001")
    expect(text).toContain("Review voz config")
  })

  it("handles report with no signals gracefully", async () => {
    const { formatReport } = await import("../../src/learning-officer/reporter")
    const text = formatReport(makeReport({ signalCount: 0, deltas: [], proposals: [] }))
    expect(text).toContain("0")
  })
})
