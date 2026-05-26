import { describe, it, expect, afterEach } from "vitest"
import { createTask } from "../../src/command-center/task-factory.js"
import { getTestClient, cleanTestData } from "../helpers/supabase-test-client.js"

describe("createTask", () => {
  const createdIds: string[] = []

  afterEach(async () => {
    for (const id of createdIds) await cleanTestData(id)
    createdIds.length = 0
  })

  it("creates a task with auto-generated sequential ID", async () => {
    const task = await createTask({ orderRaw: "Web para clínica NovaMed", controlMode: "phased" })
    createdIds.push(task.id)
    expect(task.id).toMatch(/^HAT3X-\d{3}$/)
    expect(task.status).toBe("pending")
    expect(task.controlMode).toBe("phased")
  })

  it("persists the task in Supabase", async () => {
    const task = await createTask({ orderRaw: "Agente de voz", controlMode: "autopilot" })
    createdIds.push(task.id)
    const client = getTestClient()
    const { data } = await client.from("hat3x_tasks").select("*").eq("id", task.id).single()
    expect(data?.order_raw).toBe("Agente de voz")
  })

  it("assigns clientId when provided", async () => {
    const task = await createTask({ orderRaw: "Chatbot", controlMode: "phased", clientId: "client-novamed" })
    createdIds.push(task.id)
    expect(task.clientId).toBe("client-novamed")
  })

  it("increments the ID counter sequentially", async () => {
    const t1 = await createTask({ orderRaw: "Tarea 1", controlMode: "phased" })
    const t2 = await createTask({ orderRaw: "Tarea 2", controlMode: "phased" })
    createdIds.push(t1.id, t2.id)
    const n1 = parseInt(t1.id.replace("HAT3X-", ""))
    const n2 = parseInt(t2.id.replace("HAT3X-", ""))
    expect(n2).toBe(n1 + 1)
  })
})
