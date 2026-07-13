import type { Vertical } from "../types.js"

/**
 * Skills REALES e invocables (verificadas disponibles en el runtime headless de
 * Claude Code) por vertical. Sustituyen a los nombres que inventa el task-analyzer
 * (LLM), que no corresponden a skills registradas y el agente no puede cargar.
 *
 * Al ejecutar una subtarea, el executor inyecta estas en vez de subtask.skills,
 * para que los agentes aprovechen de verdad la biblioteca de skills.
 */
export const SKILLS_BY_VERTICAL: Record<Vertical, string[]> = {
  "webs-apps": [
    "ui-ux-pro-max:ui-ux-pro-max",
    "frontend-design",
    "everything-claude-code:frontend-patterns",
    "everything-claude-code:nextjs-turbopack",
    "everything-claude-code:typescript-reviewer",
    "everything-claude-code:accessibility",
  ],
  database: [
    "everything-claude-code:postgres-patterns",
    "everything-claude-code:database-migrations",
    "everything-claude-code:backend-patterns",
  ],
  testing: [
    "everything-claude-code:tdd",
    "everything-claude-code:e2e-testing",
  ],
  security: [
    "everything-claude-code:security-review",
    "security-audit",
  ],
  deployment: [
    "everything-claude-code:deployment-patterns",
    "everything-claude-code:github-ops",
  ],
  github: [
    "everything-claude-code:git-workflow",
    "everything-claude-code:github-ops",
  ],
  documentation: [
    "everything-claude-code:documentation-lookup",
    "code-review",
  ],
  automatizaciones: [
    "everything-claude-code:api-design",
    "everything-claude-code:backend-patterns",
  ],
  crm: [
    "everything-claude-code:api-design",
    "everything-claude-code:backend-patterns",
  ],
  calendar: [
    "everything-claude-code:api-design",
    "everything-claude-code:backend-patterns",
  ],
  chatbots: [
    "everything-claude-code:api-design",
    "everything-claude-code:backend-patterns",
  ],
  voz: [
    "everything-claude-code:api-design",
  ],
}

/** Skills reales para una vertical; array vacío si la vertical no tiene mapeo. */
export function skillsForVertical(vertical: Vertical): string[] {
  return SKILLS_BY_VERTICAL[vertical] ?? []
}
