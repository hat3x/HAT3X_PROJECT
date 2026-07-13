import type { Vertical } from "../types.js"

/**
 * Skills SUGERIDAS por vertical: reales e invocables (verificadas disponibles en
 * el runtime headless de Claude Code). Son un PUNTO DE PARTIDA, no una lista
 * cerrada: el prompt le dice al agente que consulte la biblioteca completa y use
 * las que mejor encajen con su subtarea concreta.
 *
 * Existen porque el task-analyzer (LLM) inventa nombres de skill que no están
 * registrados y el agente no puede cargar; estas sí cargan y orientan al agente
 * hacia las de mayor valor sin limitarlo.
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
