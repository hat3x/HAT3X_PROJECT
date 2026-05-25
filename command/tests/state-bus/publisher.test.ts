import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { publishEvent } from "../../src/state-bus/publisher.js"
import { EVENT_TYPES } from "../../src/state-bus/event-types.js"
import { getTestClient, cleanTestData } from "../helpers/supabase-test-client.js"

const TASK_ID = "HAT3X-TEST-PUB"

describe("publishEvent", () => {
  beforeEach(async () => {
    await getTestClient().from("hat3x_tasks").upsert({
      id: TASK_ID, order_raw: "test", control_mode: "phased", status: "running",
    })
  })
  afterEach(async () => { await cleanTestData(TASK_ID) })

  it("inserts an event into bus_events", async () => {
    await publishEvent({ taskId: TASK_ID, eventType: EVENT_TYPES.TASK_STARTED, agentId: "lead-programmer", payload: { subtaskId: "ST-001" } })
    const { data } = await getTestClient().from("bus_events").select("*").eq("task_id", TASK_ID).single()
    expect(data?.agent_id).toBe("lead-programmer")
    expect(data?.payload).toMatchObject({ subtaskId: "ST-001" })
  })

  it("allows null agentId for system events", async () => {
    await publishEvent({ taskId: TASK_ID, eventType: EVENT_TYPES.CHECKPOINT_TRIGGERED, agentId: null, payload: { reason: "Phase complete" } })
    const { data } = await getTestClient().from("bus_events").select("agent_id").eq("event_type", EVENT_TYPES.CHECKPOINT_TRIGGERED).eq("task_id", TASK_ID).single()
    expect(data?.agent_id).toBeNull()
  })
})
