import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "node:events"
import { startSupervisor } from "../../src/supervisor/index.js"

class FakeProc extends EventEmitter {
  kill = vi.fn()
}

describe("startSupervisor", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("spawns each service and restarts on exit after 5s", async () => {
    const procs: FakeProc[] = []
    const spawnFn = vi.fn(() => { const p = new FakeProc(); procs.push(p); return p })
    const handle = startSupervisor([{ name: "server", cmd: "tsx", args: ["src/server.ts"] }], spawnFn)
    expect(spawnFn).toHaveBeenCalledTimes(1)

    procs[0]!.emit("exit", 1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(spawnFn).toHaveBeenCalledTimes(2)
    expect(handle.restartCount("server")).toBe(1)

    handle.stop()
    procs[1]!.emit("exit", 0)
    await vi.advanceTimersByTimeAsync(10000)
    expect(spawnFn).toHaveBeenCalledTimes(2)
  })

  it("gives up after repeated instant crashes (crash-loop guard)", async () => {
    const procs: FakeProc[] = []
    const spawnFn = vi.fn(() => { const p = new FakeProc(); procs.push(p); return p })
    const handle = startSupervisor([{ name: "server", cmd: "tsx", args: ["src/server.ts"] }], spawnFn)

    // 6 crashes instantáneos seguidos (como un puerto ocupado): tras el umbral, deja de reintentar
    for (let i = 0; i < 6; i++) {
      procs[procs.length - 1]!.emit("exit", 1)
      await vi.advanceTimersByTimeAsync(5000)
    }
    const spawnsAtGiveUp = spawnFn.mock.calls.length
    expect(spawnsAtGiveUp).toBeLessThanOrEqual(6)

    // No sigue respawneando indefinidamente
    await vi.advanceTimersByTimeAsync(60000)
    expect(spawnFn).toHaveBeenCalledTimes(spawnsAtGiveUp)
    expect(handle.gaveUp("server")).toBe(true)
  })
})
