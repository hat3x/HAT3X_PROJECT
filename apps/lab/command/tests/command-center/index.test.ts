import { describe, it, expect, afterEach } from "vitest"
import { CommandCenter } from "../../src/command-center/index.js"
import { cleanTestData } from "../helpers/supabase-test-client.js"

describe("CommandCenter", () => {
  const ids: string[] = []
  afterEach(async () => { for (const id of ids) await cleanTestData(id); ids.length = 0 })

  it("processes an order and returns a task", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Web para test", skipAnalysis: true })
    ids.push(task.id)
    expect(task.id).toMatch(/^HAT3X-\d{3}$/)
    expect(task.status).toBe("pending")
  })

  it("uses supervised for unknown clients", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Test", clientId: "nonexistent-xyz", skipAnalysis: true })
    ids.push(task.id)
    expect(task.controlMode).toBe("supervised")
  })

  it("respects explicit control mode", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Test", controlMode: "autopilot", skipAnalysis: true })
    ids.push(task.id)
    expect(task.controlMode).toBe("autopilot")
  })
})
