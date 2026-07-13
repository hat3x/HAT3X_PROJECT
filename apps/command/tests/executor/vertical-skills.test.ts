import { describe, it, expect } from "vitest"
import { skillsForVertical, SKILLS_BY_VERTICAL } from "../../src/executor/vertical-skills.js"

describe("skillsForVertical", () => {
  it("devuelve skills reales para webs-apps incluyendo ui-ux-pro-max", () => {
    const s = skillsForVertical("webs-apps")
    expect(s).toContain("ui-ux-pro-max:ui-ux-pro-max")
    expect(s.length).toBeGreaterThan(0)
  })

  it("todas las verticales conocidas tienen al menos una skill mapeada", () => {
    for (const vertical of Object.keys(SKILLS_BY_VERTICAL) as Array<keyof typeof SKILLS_BY_VERTICAL>) {
      expect(skillsForVertical(vertical).length).toBeGreaterThan(0)
    }
  })

  it("las skills mapeadas no son nombres inventados por el LLM", () => {
    const invented = ["database-design", "requirements-gathering", "ui-ux-patterns", "nextjs-shadcn"]
    const all = Object.values(SKILLS_BY_VERTICAL).flat()
    for (const bad of invented) {
      expect(all).not.toContain(bad)
    }
  })
})
