import Anthropic from "@anthropic-ai/sdk"
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
  const client = new Anthropic()

  const contextNote =
    clientMemory != null
      ? `\n\nClient context: ${clientMemory.name}, sector: ${clientMemory.sector ?? "unknown"}, previous projects: ${clientMemory.previousProjects.join(", ")}`
      : ""

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Order: ${order}${contextNote}`,
      },
    ],
  })

  const textBlock = message.content.find((b) => b.type === "text")
  if (textBlock == null || textBlock.type !== "text") {
    throw new Error("Invalid LLM response: no text content")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(textBlock.text)
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
