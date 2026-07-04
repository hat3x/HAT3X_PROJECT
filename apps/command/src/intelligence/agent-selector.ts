import OpenAI from "openai"
import { z } from "zod"
import type { Subtask, AgentSelection } from "../types.js"
import { topCandidatesForSubtask, type Roster } from "./capability-map/roster.js"

const COMMAND_MODEL = process.env["COMMAND_MODEL"] ?? "gpt-5.2-codex"

const SelectionSchema = z.array(z.object({
  subtaskId: z.string(),
  agentId: z.string(),
}))

const SYSTEM_PROMPT = `You are the staffing director of HAT3X, an AI consulting agency with a pool of specialist agents.
For each subtask you receive a shortlist of candidate agents (id + keywords).
Pick the single BEST agent for each subtask. If no candidate truly fits, answer "PM" for that subtask.

Return ONLY a valid JSON array — no markdown, no explanation:
[{ "subtaskId": "sub-1", "agentId": "chosen-agent-id-or-PM" }]`

/**
 * Refina las selecciones heurísticas con una única llamada LLM sobre las
 * shortlists del roster. Ante cualquier fallo (sin API key, respuesta inválida)
 * devuelve las selecciones heurísticas tal cual — nunca bloquea el pipeline.
 */
export async function refineSelectionsWithLLM(
  subtasks: Subtask[],
  heuristic: AgentSelection[],
  roster: Roster
): Promise<AgentSelection[]> {
  const apiKey = process.env["OPENAI_API_KEY"]
  if (apiKey == null || apiKey.trim().length === 0) return heuristic

  const shortlists = subtasks.map((st) => ({
    subtask: st,
    candidates: topCandidatesForSubtask(st, roster, 8),
  }))
  if (shortlists.every((s) => s.candidates.length === 0)) return heuristic

  const input = shortlists
    .map(({ subtask, candidates }) => {
      const list = candidates.length > 0
        ? candidates.map((c) => `  - ${c.agent.id} [${c.agent.keywords.slice(0, 10).join(", ")}]`).join("\n")
        : "  (no candidates — answer PM)"
      return `Subtask ${subtask.id} (${subtask.vertical}): ${subtask.description}\nCandidates:\n${list}`
    })
    .join("\n\n")

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.responses.create({
      model: COMMAND_MODEL,
      instructions: SYSTEM_PROMPT,
      input,
      max_output_tokens: 1024,
    })
    const raw = response.output_text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")
    const parsed = SelectionSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return heuristic

    const byId = new Map(parsed.data.map((s) => [s.subtaskId, s.agentId]))
    return heuristic.map((sel) => {
      const chosen = byId.get(sel.subtaskId)
      if (chosen == null || chosen === "PM") return sel
      const shortlist = shortlists.find((s) => s.subtask.id === sel.subtaskId)
      const valid = shortlist?.candidates.some((c) => c.agent.id === chosen) ?? false
      if (!valid) return sel
      return {
        subtaskId: sel.subtaskId,
        agentId: chosen,
        score: 0.9,
        rationale: `${chosen} elegido por el staffing director (LLM) entre ${shortlist!.candidates.length} candidatos del pool`,
      }
    })
  } catch {
    return heuristic
  }
}
