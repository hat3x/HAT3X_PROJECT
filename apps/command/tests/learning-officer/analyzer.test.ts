import { describe, it, expect } from "vitest"
import type { LearningSignal } from "../../src/learning-officer/types"

function makeSignal(overrides: Partial<LearningSignal> = {}): LearningSignal {
  return {
    taskId: "HAT3X-001",
    vertical: "chatbots",
    agentId: "pm-chatbots",
    outcome: "success",
    checkpointFeedback: null,
    durationHours: 4,
    failureReason: null,
    ...overrides,
  }
}

describe("analyzeSignals", () => {
  it("produces positive delta for successful task with feedback", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const signals = [makeSignal({ outcome: "success", checkpointFeedback: "excellent delivery" })]
    const report = analyzeSignals(signals)

    expect(report.signalCount).toBe(1)
    expect(report.deltas.some((d) => d.delta > 0 && d.vertical === "chatbots")).toBe(true)
  })

  it("produces negative delta for failure", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const signals = [makeSignal({ outcome: "failure", failureReason: "missing tests" })]
    const report = analyzeSignals(signals)

    expect(report.deltas.some((d) => d.delta < 0 && d.vertical === "chatbots")).toBe(true)
  })

  it("produces a proposal when same vertical fails 2+ times", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const signals = [
      makeSignal({ outcome: "failure", taskId: "HAT3X-001" }),
      makeSignal({ outcome: "failure", taskId: "HAT3X-002" }),
    ]
    const report = analyzeSignals(signals)

    expect(report.proposals.length).toBeGreaterThanOrEqual(1)
    expect(report.proposals[0].impact).toBe("medium")
    expect(report.proposals[0].description).toContain("chatbots")
  })

  it("returns empty deltas for empty signals", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const report = analyzeSignals([])
    expect(report.signalCount).toBe(0)
    expect(report.deltas).toHaveLength(0)
    expect(report.proposals).toHaveLength(0)
  })

  it("does NOT produce delta for success without feedback", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const signals = [makeSignal({ outcome: "success", checkpointFeedback: null })]
    const report = analyzeSignals(signals)
    expect(report.deltas).toHaveLength(0)
  })
})
