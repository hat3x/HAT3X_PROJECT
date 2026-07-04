import type { Subtask } from "../types.js"
import { REDLINE_INSTRUCTIONS } from "./redline-guard.js"

export interface AgentPromptInput {
  subtask: Subtask
  agentId: string
  agentConfig: string
  clientContext: string
  artifacts: string[]
}

export function buildAgentPrompt(input: AgentPromptInput): string {
  const skills = input.subtask.skills.length > 0
    ? `Skills que DEBES usar (invócalos con el Skill tool): ${input.subtask.skills.join(", ")}`
    : "Sin skills obligatorios."
  const artifacts = input.artifacts.length > 0
    ? `Artefactos de tus compañeros (úsalos como entrada):\n${input.artifacts.map((a) => `- ${a}`).join("\n")}`
    : "Sin artefactos previos."
  return [
    `# Tu identidad\n${input.agentConfig}`,
    `# Contexto del cliente\n${input.clientContext || "Tarea interna de HAT3X."}`,
    `# Tu subtarea (${input.subtask.id})\n${input.subtask.description}`,
    `# ${skills}`,
    `# ${artifacts}`,
    `# Reglas\n${REDLINE_INSTRUCTIONS}`,
    `Trabaja SOLO en el directorio actual. Al terminar, haz git add + commit de tu trabajo y resume en 2-3 frases qué has entregado.`,
  ].join("\n\n")
}
