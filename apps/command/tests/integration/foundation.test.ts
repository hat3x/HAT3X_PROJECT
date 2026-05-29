import { describe, it, expect, afterEach } from "vitest"
import { CommandCenter } from "../../src/command-center/index.js"
import { publishEvent, createSubscriber, EVENT_TYPES } from "../../src/state-bus/index.js"
import { cleanTestData } from "../helpers/supabase-test-client.js"

describe("Foundation integration", () => {
  const ids: string[] = []
  afterEach(async () => { for (const id of ids) await cleanTestData(id); ids.length = 0 })

  it("create task → publish event → receive via subscriber", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Integration test" })
    ids.push(task.id)
    expect(task.status).toBe("pending")

    const received: unknown[] = []
    const sub = createSubscriber({ taskId: task.id, eventTypes: [EVENT_TYPES.TASK_STARTED], handler: (e) => { received.push(e) } })
    await sub.subscribe()

    await publishEvent({ taskId: task.id, eventType: EVENT_TYPES.TASK_STARTED, agentId: "master-orchestrator", payload: { msg: "started" } })
    await new Promise((r) => setTimeout(r, 500))
    await sub.unsubscribe()

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ eventType: EVENT_TYPES.TASK_STARTED, agentId: "master-orchestrator" })
  }, 10000)
})
