import { describe, it, expect } from "vitest"
import { buildAgentPrompt } from "../../src/executor/agent-prompt.js"
import type { Subtask } from "../../src/types.js"

const subtask: Subtask = {
  id: "ST-001",
  description: "Diseñar el schema de la base de datos",
  vertical: "database",
  skills: ["supabase-rls", "typescript-strict"],
  estimatedHours: 2,
  dependencies: [],
}

describe("buildAgentPrompt", () => {
  it("includes identity, subtask, skills, context, artifacts and redlines", () => {
    const p = buildAgentPrompt({
      subtask,
      agentId: "architect",
      agentConfig: "Eres el arquitecto de HAT3X.",
      clientContext: "Cliente: NovaMed, sector salud.",
      artifacts: ["wireframes.md: rutas /home /reservas"],
    })
    expect(p).toContain("Eres el arquitecto de HAT3X.")
    expect(p).toContain("Diseñar el schema de la base de datos")
    expect(p).toContain("supabase-rls")
    expect(p).toContain("Cliente: NovaMed")
    expect(p).toContain("wireframes.md")
    expect(p).toContain("HAT3X_CHECKPOINT:")
  })
})
