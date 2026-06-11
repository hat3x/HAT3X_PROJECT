import { describe, it, expect } from "vitest"
import { resolveControlMode } from "../../src/command-center/control-mode.js"
import type { ClientMemory } from "../../src/types.js"

const existing: ClientMemory = {
  id: "c1",
  name: "NovaMed",
  sector: "clinicas",
  previousProjects: ["HAT3X-083"],
  notes: null,
}
const newClient: ClientMemory = {
  id: "c2",
  name: "Nuevo",
  sector: null,
  previousProjects: [],
  notes: null,
}

describe("resolveControlMode", () => {
  it("returns explicit mode when set", () => {
    expect(resolveControlMode({ explicitMode: "autopilot", clientMemory: existing, orderRaw: "x" })).toBe("autopilot")
  })

  it("returns supervised for new clients", () => {
    expect(resolveControlMode({ explicitMode: null, clientMemory: newClient, orderRaw: "x" })).toBe("supervised")
  })

  it("returns phased for existing clients", () => {
    expect(resolveControlMode({ explicitMode: null, clientMemory: existing, orderRaw: "x" })).toBe("phased")
  })

  it("returns supervised when no client memory", () => {
    expect(resolveControlMode({ explicitMode: null, clientMemory: null, orderRaw: "x" })).toBe("supervised")
  })
})
