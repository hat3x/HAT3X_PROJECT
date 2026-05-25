import { describe, it, expect, beforeAll } from "vitest"
import { loadCapabilityMap, resetCapabilityMapCache } from "../../../src/intelligence/capability-map/loader"
import type { CapabilityMap } from "../../../src/intelligence/capability-map/types"

let map: CapabilityMap

beforeAll(async () => {
  resetCapabilityMapCache()
  map = await loadCapabilityMap()
})

describe("loadCapabilityMap", () => {
  it("loads all 12 verticals", () => {
    const verticals = Object.keys(map)
    expect(verticals).toHaveLength(12)
  })

  it("each vertical has at least 3 skills", () => {
    for (const [vertical, entry] of Object.entries(map)) {
      expect(entry.skills.length, `${vertical} has too few skills`).toBeGreaterThanOrEqual(3)
    }
  })

  it("chatbots vertical has expected skills", () => {
    expect(map["chatbots"]).toBeDefined()
    expect(map["chatbots"]!.skills).toContain("rag-chatbots")
    expect(map["chatbots"]!.skills).toContain("whatsapp-business")
  })

  it("each entry has agentId and maxParallelSubtasks", () => {
    for (const [vertical, entry] of Object.entries(map)) {
      expect(typeof entry.agentId, `${vertical}.agentId missing`).toBe("string")
      expect(typeof entry.maxParallelSubtasks, `${vertical}.maxParallelSubtasks missing`).toBe("number")
    }
  })

  it("returns same instance on second call (cached)", async () => {
    const map2 = await loadCapabilityMap()
    expect(map2).toBe(map)
  })
})
