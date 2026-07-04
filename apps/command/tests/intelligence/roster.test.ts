import { describe, it, expect } from "vitest"
import { selectAgentForSubtask, type Roster } from "../../src/intelligence/capability-map/roster.js"
import type { Subtask } from "../../src/types.js"

const roster: Roster = {
  agents: [
    { id: "design-ui-designer", configPath: "agents/webs-apps/subagentes/design-ui-designer/CLAUDE.md", verticals: ["webs-apps"], keywords: ["design", "ui", "designer", "wireframe", "layout"] },
    { id: "engineering-backend-architect", configPath: "agents/webs-apps/subagentes/engineering-backend-architect.md", verticals: ["webs-apps", "database"], keywords: ["engineering", "backend", "architect", "api", "schema"] },
    { id: "qa-test-writer", configPath: "agents/webs-apps/subagentes/qa-test-writer.md", verticals: ["testing"], keywords: ["qa", "test", "writer"] },
  ],
}

function mkSubtask(description: string, vertical: Subtask["vertical"]): Subtask {
  return { id: "ST-1", description, vertical, skills: [], estimatedHours: 1, dependencies: [] }
}

describe("selectAgentForSubtask", () => {
  it("picks the agent whose keywords match the subtask description", () => {
    const r = selectAgentForSubtask(mkSubtask("Design the wireframe layout for the landing page", "webs-apps"), roster)
    expect(r?.agentId).toBe("design-ui-designer")
    expect(r!.score).toBeGreaterThan(0)
  })

  it("filters by vertical", () => {
    const r = selectAgentForSubtask(mkSubtask("Write tests for the checkout flow", "testing"), roster)
    expect(r?.agentId).toBe("qa-test-writer")
  })

  it("returns null when no agent of that vertical matches any keyword", () => {
    const r = selectAgentForSubtask(mkSubtask("Configurar flujo de n8n para leads", "automatizaciones"), roster)
    expect(r).toBeNull()
  })
})
