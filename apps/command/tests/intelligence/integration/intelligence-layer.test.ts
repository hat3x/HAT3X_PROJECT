import { describe, it, expect } from "vitest"
import { runIntelligenceLayer } from "../../../src/intelligence/index"

const OPENAI_API_KEY = process.env["OPENAI_API_KEY"]
const SKIP =
  OPENAI_API_KEY == null ||
  OPENAI_API_KEY === "sk-..." ||
  OPENAI_API_KEY === "test-key"

describe.skipIf(SKIP)("Intelligence Layer — real LLM integration", () => {
  it(
    "analyzes a simple order and returns a valid plan",
    async () => {
      const result = await runIntelligenceLayer(
        "Necesito un chatbot de WhatsApp para atender clientes de mi clínica dental",
        null
      )

      expect(result.subtasks.length).toBeGreaterThan(0)
      expect(result.executionPlan.phases.length).toBeGreaterThan(0)
      expect(result.executionPlan.totalEstimatedHours).toBeGreaterThan(0)
      expect(["low", "medium", "high"]).toContain(result.executionPlan.riskLevel)

      for (const subtask of result.subtasks) {
        expect(typeof subtask.id).toBe("string")
        expect(typeof subtask.description).toBe("string")
        expect(typeof subtask.vertical).toBe("string")
        expect(Array.isArray(subtask.skills)).toBe(true)
        expect(typeof subtask.estimatedHours).toBe("number")
        expect(Array.isArray(subtask.dependencies)).toBe(true)
      }
    },
    30_000
  )
})
