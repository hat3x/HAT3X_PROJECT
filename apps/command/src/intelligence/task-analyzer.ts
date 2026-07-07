import OpenAI from "openai"
import { z } from "zod"
import type { Subtask, ClientMemory } from "../types.js"

const SubtaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  vertical: z.enum([
    "chatbots",
    "voz",
    "webs-apps",
    "automatizaciones",
    "crm",
    "calendar",
    "database",
    "github",
    "testing",
    "security",
    "documentation",
    "deployment",
  ]),
  skills: z.array(z.string()),
  estimatedHours: z.number().positive(),
  dependencies: z.array(z.string()),
})

const SubtasksSchema = z.array(SubtaskSchema)
const COMMAND_MODEL = process.env["COMMAND_MODEL"] ?? "gpt-5.2-codex"

const SYSTEM_PROMPT = `You are an expert project analyzer for HAT3X, an AI consulting agency.
Given an incoming order, decompose it into concrete subtasks.

Each subtask must belong to ONE vertical from this list:
chatbots, voz, webs-apps, automatizaciones, crm, calendar, database, github, testing, security, documentation, deployment

Return ONLY a valid JSON array of subtasks — no markdown, no explanation. Format:
[
  {
    "id": "sub-1",
    "description": "specific actionable task description",
    "vertical": "one of the verticals above",
    "skills": ["skill-name-1", "skill-name-2"],
    "estimatedHours": 8,
    "dependencies": []
  }
]

Rules:
- id must be unique: sub-1, sub-2, sub-3...
- dependencies is an array of other subtask ids that must complete first
- estimatedHours is a realistic estimate (1-40)
- skills come from HAT3X skill catalog`

export async function analyzeTask(
  order: string,
  clientMemory: ClientMemory | null
): Promise<Subtask[]> {
  const apiKey = process.env["OPENAI_API_KEY"]
  if (apiKey == null || apiKey.trim().length === 0) {
    throw new Error("Missing OPENAI_API_KEY")
  }

  const client = new OpenAI({ apiKey })

  const contextNote =
    clientMemory != null
      ? `\n\nClient context: ${clientMemory.name}, sector: ${clientMemory.sector ?? "unknown"}, previous projects: ${clientMemory.previousProjects.join(", ")}`
      : ""

  const response = await client.responses.create({
    model: COMMAND_MODEL,
    instructions: SYSTEM_PROMPT,
    input: `Order: ${order}${contextNote}`,
    max_output_tokens: 2048,
  })

  const text = response.output_text
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Invalid LLM response: no text content")
  }

  // El modelo a veces envuelve el JSON en fences markdown (```json ... ```)
  const raw = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Invalid LLM response: not valid JSON")
  }

  const result = SubtasksSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid LLM response: expected array of subtasks — ${result.error.message}`
    )
  }

  return result.data
}
