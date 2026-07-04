import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createSubscriber } from "../../src/state-bus/subscriber.js"
import { publishEvent } from "../../src/state-bus/publisher.js"
import { EVENT_TYPES } from "../../src/state-bus/event-types.js"
import { getTestClient, cleanTestData, LIVE } from "../helpers/supabase-test-client.js"

const TASK_ID = "HAT3X-TEST-SUB"

describe.skipIf(!LIVE)("createSubscriber", () => {
  beforeEach(async () => {
    await getTestClient().from("hat3x_tasks").upsert({
      id: TASK_ID, order_raw: "test sub", control_mode: "phased", status: "running",
    })
  })
  afterEach(async () => { await cleanTestData(TASK_ID) })

  it("calls handler when a matching event is published", async () => {
    const handler = vi.fn()
    const sub = createSubscriber({ taskId: TASK_ID, eventTypes: [EVENT_TYPES.TASK_COMPLETED], handler })
    await sub.subscribe()

    await publishEvent({ taskId: TASK_ID, eventType: EVENT_TYPES.TASK_COMPLETED, agentId: "lead-programmer", payload: { subtaskId: "ST-001" } })
    await new Promise((r) => setTimeout(r, 1500))
    await sub.unsubscribe()

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ eventType: EVENT_TYPES.TASK_COMPLETED })
  }, 10000)
})
