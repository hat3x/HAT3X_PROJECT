import OpenAI from "openai"
import { z } from "zod"
import type { Subtask, ClientMemory } from "../types.js"
import { askClaude, stripFences, brainProvider } from "./brain.js"

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

async function askOpenAI(input: string): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"]
  if (apiKey == null || apiKey.trim().length === 0) {
    throw new Error("Missing OPENAI_API_KEY")
  }
  const client = new OpenAI({ apiKey })
  const response = await client.responses.create({
    model: COMMAND_MODEL,
    instructions: SYSTEM_PROMPT,
    input,
    max_output_tokens: 2048,
  })
  return response.output_text
}

export async function analyzeTask(
  order: string,
  clientMemory: ClientMemory | null
): Promise<Subtask[]> {
  const contextNote =
    clientMemory != null
      ? `\n\nClient context: ${clientMemory.name}, sector: ${clientMemory.sector ?? "unknown"}, previous projects: ${clientMemory.previousProjects.join(", ")}`
      : ""
  const input = `Order: ${order}${contextNote}`

  // Cerebro default: Claude Code headless (suscripción). Fallback: OpenAI API.
  let text: string
  if (brainProvider() === "openai") {
    text = await askOpenAI(input)
  } else {
    try {
      text = await askClaude(SYSTEM_PROMPT, input)
    } catch (err) {
      if (process.env["OPENAI_API_KEY"]) {
        console.warn("[task-analyzer] claude headless falló, fallback a OpenAI:", err instanceof Error ? err.message : String(err))
        text = await askOpenAI(input)
      } else {
        throw err
      }
    }
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Invalid LLM response: no text content")
  }

  const raw = stripFences(text)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // El modelo a veces envuelve el array en prosa ("Aquí tienes: [...]. Espero...").
    // Extraer el array desde el primer '[' hasta el último ']'.
    const start = raw.indexOf("[")
    const end = raw.lastIndexOf("]")
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(raw.slice(start, end + 1))
      } catch {
        throw new Error("Invalid LLM response: not valid JSON")
      }
    } else {
      throw new Error("Invalid LLM response: not valid JSON")
    }
  }

  const result = SubtasksSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid LLM response: expected array of subtasks — ${result.error.message}`
    )
  }

  return result.data
}
