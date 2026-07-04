import { describe, it, expect } from "vitest"
import { buildAgentSettings, REDLINE_INSTRUCTIONS } from "../../src/executor/redline-guard.js"

describe("redline guard", () => {
  it("denies deploy, push and outbound tools", () => {
    const s = buildAgentSettings("C:/repos/novamed")
    expect(s.permissions.deny).toEqual(
      expect.arrayContaining(["Bash(vercel*)", "Bash(npx vercel*)", "Bash(netlify*)", "Bash(git push*)", "Bash(gh release*)", "WebFetch"])
    )
  })

  it("instructions mention the checkpoint marker", () => {
    expect(REDLINE_INSTRUCTIONS).toContain("HAT3X_CHECKPOINT:")
  })
})
