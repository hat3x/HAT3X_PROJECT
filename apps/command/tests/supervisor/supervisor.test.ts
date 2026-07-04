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
})
