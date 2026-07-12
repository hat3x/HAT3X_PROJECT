import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Subtask, AgentSelection } from "../../src/types.js"
import type { Roster } from "../../src/intelligence/capability-map/roster.js"

const createMock = vi.fn()
vi.mock("openai", () => ({
  default: class {
    responses = { create: createMock }
  },
}))

const { refineSelectionsWithLLM } = await import("../../src/intelligence/agent-selector.js")

const roster: Roster = {
  agents: [
    { id: "design-ui-designer", configPath: "x", verticals: ["webs-apps"], keywords: ["design", "ui", "wireframe", "layout"] },
    { id: "corporate-training-designer", configPath: "y", verticals: ["webs-apps"], keywords: ["design", "training", "corporate"] },
  ],
}

const subtasks: Subtask[] = [
  { id: "sub-1", description: "Design the wireframe layout for the landing", vertical: "webs-apps", skills: [], estimatedHours: 2, dependencies: [] },
]

const heuristic: AgentSelection[] = [
  { subtaskId: "sub-1", agentId: "corporate-training-designer", score: 0.8, rationale: "heuristic" },
]

describe("refineSelectionsWithLLM", () => {
  beforeEach(() => {
    createMock.mockReset()
    process.env["OPENAI_API_KEY"] = "sk-test"
    // Este suite SÍ ejercita la ruta LLM (mockeada): desactiva el off-switch global
    delete process.env["COMMAND_DISABLE_STAFFING_LLM"]
  })

  it("replaces heuristic pick with LLM choice when valid", async () => {
    createMock.mockResolvedValue({ output_text: JSON.stringify([{ subtaskId: "sub-1", agentId: "design-ui-designer" }]) })
    const r = await refineSelectionsWithLLM(subtasks, heuristic, roster)
    expect(r[0]!.agentId).toBe("design-ui-designer")
  })

  it("keeps heuristic when LLM answers PM", async () => {
    createMock.mockResolvedValue({ output_text: JSON.stringify([{ subtaskId: "sub-1", agentId: "PM" }]) })
    const r = await refineSelectionsWithLLM(subtasks, heuristic, roster)
    expect(r[0]!.agentId).toBe("corporate-training-designer")
  })

  it("keeps heuristic when LLM picks an agent outside the shortlist", async () => {
    createMock.mockResolvedValue({ output_text: JSON.stringify([{ subtaskId: "sub-1", agentId: "invented-agent" }]) })
    const r = await refineSelectionsWithLLM(subtasks, heuristic, roster)
    expect(r[0]!.agentId).toBe("corporate-training-designer")
  })

  it("keeps heuristic when the LLM call throws", async () => {
    createMock.mockRejectedValue(new Error("boom"))
    const r = await refineSelectionsWithLLM(subtasks, heuristic, roster)
    expect(r).toEqual(heuristic)
  })

  it("skips the LLM entirely without API key", async () => {
    delete process.env["OPENAI_API_KEY"]
    const r = await refineSelectionsWithLLM(subtasks, heuristic, roster)
    expect(r).toEqual(heuristic)
    expect(createMock).not.toHaveBeenCalled()
  })
})
