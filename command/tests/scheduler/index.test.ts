import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}))
vi.mock("../../src/learning-officer/index.js", () => ({
  runLearningCycle: vi.fn().mockResolvedValue("ok"),
}))

import cron from "node-cron"
import { runLearningCycle } from "../../src/learning-officer/index.js"
import { startLearningScheduler } from "../../src/scheduler/index.js"
import type { NotificationSender } from "../../src/telegram/notifications/sender.js"

function makeSender(): NotificationSender {
  return { sendEvolutionReport: vi.fn() } as unknown as NotificationSender
}

describe("startLearningScheduler", () => {
  beforeEach(() => { vi.clearAllMocks() })

  afterEach(() => {
    delete process.env["LEARNING_SCHEDULE"]
  })

  it("schedules with default Monday 9am expression", () => {
    startLearningScheduler(makeSender())
    expect(cron.schedule).toHaveBeenCalledWith("0 9 * * 1", expect.any(Function))
  })

  it("uses LEARNING_SCHEDULE env var when set", () => {
    process.env["LEARNING_SCHEDULE"] = "0 8 * * 5"
    startLearningScheduler(makeSender())
    expect(cron.schedule).toHaveBeenCalledWith("0 8 * * 5", expect.any(Function))
  })

  it("calls runLearningCycle with the sender when cron fires", async () => {
    const sender = makeSender()
    startLearningScheduler(sender)
    const [, callback] = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls[0] as [string, () => Promise<void>]
    await callback()
    expect(runLearningCycle).toHaveBeenCalledWith(sender)
  })

  it("does not throw if runLearningCycle rejects", async () => {
    vi.mocked(runLearningCycle).mockRejectedValueOnce(new Error("DB down"))
    startLearningScheduler(makeSender())
    const [, callback] = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls[0] as [string, () => Promise<void>]
    await expect(callback()).resolves.toBeUndefined()
  })
})
