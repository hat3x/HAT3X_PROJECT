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
  const suggested = input.subtask.skills.length > 0
    ? `Skills recomendadas para este tipo de trabajo (punto de partida, no una lista cerrada): ${input.subtask.skills.join(", ")}.`
    : ""
  const skills = [
    "Tienes acceso a una AMPLIA biblioteca de skills a través del Skill tool.",
    "ANTES de empezar, piensa qué skills encajan mejor con ESTA subtarea concreta e invócalas —",
    "elevan mucho la calidad del entregable. Eres libre de usar las que consideres, no solo las sugeridas.",
    suggested,
  ].filter((l) => l.length > 0).join(" ")
  const artifacts = input.artifacts.length > 0
    ? `Artefactos de tus compañeros (úsalos como entrada):\n${input.artifacts.map((a) => `- ${a}`).join("\n")}`
    : "Sin artefactos previos."
  return [
    `# Tu identidad\n${input.agentConfig}`,
    `# Contexto del cliente\n${input.clientContext || "Tarea interna de HAT3X."}`,
    `# Tu subtarea (${input.subtask.id})\n${input.subtask.description}`,
    `# Biblioteca de skills\n${skills}`,
    `# Artefactos\n${artifacts}`,
    `# Reglas\n${REDLINE_INSTRUCTIONS}`,
    `Trabaja SOLO en el directorio actual. Al terminar, haz git add + commit de tu trabajo y resume en 2-3 frases qué has entregado.`,
  ].join("\n\n")
}
