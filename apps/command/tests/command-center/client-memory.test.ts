import { describe, it, expect, afterEach } from "vitest"
import { loadClientMemory, upsertClient } from "../../src/command-center/client-memory.js"
import { getTestClient, LIVE } from "../helpers/supabase-test-client.js"

const TEST_ID = "test-client-mem-001"

describe.skipIf(!LIVE)("loadClientMemory", () => {
  afterEach(async () => {
    await getTestClient().from("hat3x_clients").delete().eq("id", TEST_ID)
  })

  it("returns null when client does not exist", async () => {
    expect(await loadClientMemory("nonexistent-xyz")).toBeNull()
  })

  it("returns client data when client exists", async () => {
    await upsertClient({ id: TEST_ID, name: "NovaMed", sector: "clinicas", previousProjects: ["HAT3X-083"], notes: null })
    const memory = await loadClientMemory(TEST_ID)
    expect(memory?.name).toBe("NovaMed")
    expect(memory?.sector).toBe("clinicas")
    expect(memory?.previousProjects).toContain("HAT3X-083")
  })
})

describe.skipIf(!LIVE)("upsertClient", () => {
  afterEach(async () => {
    await getTestClient().from("hat3x_clients").delete().eq("id", TEST_ID)
  })

  it("creates a new client record", async () => {
    await upsertClient({ id: TEST_ID, name: "Test", sector: null, previousProjects: [], notes: null })
    expect(await loadClientMemory(TEST_ID)).not.toBeNull()
  })

  it("updates an existing client record", async () => {
    await upsertClient({ id: TEST_ID, name: "Old", sector: null, previousProjects: [], notes: null })
    await upsertClient({ id: TEST_ID, name: "Updated", sector: "restaurantes", previousProjects: ["HAT3X-071"], notes: "nota" })
    const m = await loadClientMemory(TEST_ID)
    expect(m?.name).toBe("Updated")
    expect(m?.sector).toBe("restaurantes")
  })
})
