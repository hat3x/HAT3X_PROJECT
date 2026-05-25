import { describe, it, expect, afterEach } from "vitest"
import { runStatus } from "../../src/cli/commands/status.js"
import { CommandCenter } from "../../src/command-center/index.js"
import { cleanTestData } from "../helpers/supabase-test-client.js"

describe("runStatus", () => {
  const ids: string[] = []
  afterEach(async () => { for (const id of ids) await cleanTestData(id); ids.length = 0 })

  it("returns not found for nonexistent ID", async () => {
    expect(await runStatus({ id: "HAT3X-NONEXISTENT" })).toContain("no encontrado")
  })

  it("returns task details for valid ID", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Status test", skipAnalysis: true })
    ids.push(task.id)
    const output = await runStatus({ id: task.id })
    expect(output).toContain(task.id)
    expect(output).toContain("pending")
  })
})
