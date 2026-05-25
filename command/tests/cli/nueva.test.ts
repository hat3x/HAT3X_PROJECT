import { describe, it, expect, afterEach } from "vitest"
import { runNueva } from "../../src/cli/commands/nueva.js"
import { cleanTestData } from "../helpers/supabase-test-client.js"

describe("runNueva", () => {
  const ids: string[] = []
  afterEach(async () => { for (const id of ids) await cleanTestData(id); ids.length = 0 })

  it("creates a task and returns formatted output", async () => {
    const output = await runNueva({ order: "Web para test CLI", mode: undefined, clientId: undefined })
    const m = output.match(/HAT3X-\d{3}/)
    expect(m).not.toBeNull()
    if (m?.[0] != null) ids.push(m[0])
    expect(output).toContain("HAT3X Command")
  })

  it("respects explicit mode flag", async () => {
    const output = await runNueva({ order: "Test autopilot", mode: "autopilot", clientId: undefined })
    const m = output.match(/HAT3X-\d{3}/)
    if (m?.[0] != null) ids.push(m[0])
    expect(output).toContain("autopilot")
  })
})
