import { describe, it, expectTypeOf } from "vitest"
import type {
  LearningSignal,
  LearningReport,
  ScoreDelta,
  EvolutionProposal,
} from "../../src/learning-officer/types"

describe("learning officer types", () => {
  it("LearningSignal has required fields", () => {
    expectTypeOf<LearningSignal>().toHaveProperty("taskId")
    expectTypeOf<LearningSignal>().toHaveProperty("vertical")
    expectTypeOf<LearningSignal>().toHaveProperty("agentId")
    expectTypeOf<LearningSignal>().toHaveProperty("outcome")
    expectTypeOf<LearningSignal>().toHaveProperty("checkpointFeedback")
  })

  it("ScoreDelta has vertical, skill, delta", () => {
    expectTypeOf<ScoreDelta>().toHaveProperty("vertical")
    expectTypeOf<ScoreDelta>().toHaveProperty("skill")
    expectTypeOf<ScoreDelta>().toHaveProperty("delta")
  })

  it("LearningReport has deltas, proposals, antiPatterns", () => {
    expectTypeOf<LearningReport>().toHaveProperty("deltas")
    expectTypeOf<LearningReport>().toHaveProperty("proposals")
    expectTypeOf<LearningReport>().toHaveProperty("antiPatterns")
    expectTypeOf<LearningReport>().toHaveProperty("signalCount")
  })

  it("EvolutionProposal has id, description, impact, evidence", () => {
    expectTypeOf<EvolutionProposal>().toHaveProperty("id")
    expectTypeOf<EvolutionProposal>().toHaveProperty("description")
    expectTypeOf<EvolutionProposal>().toHaveProperty("impact")
    expectTypeOf<EvolutionProposal>().toHaveProperty("evidence")
  })
})
