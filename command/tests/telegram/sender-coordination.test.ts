import { describe, it, expect, vi, beforeEach } from "vitest"
import { NotificationSender } from "../../src/telegram/notifications/sender"

const MOCK_BOT = { api: { sendMessage: vi.fn().mockResolvedValue(undefined) } }

beforeEach(() => {
  vi.clearAllMocks()
  process.env["TELEGRAM_JOSE_CHAT_ID"] = "12345"
})

describe("sendMeetingCalled", () => {
  it("sends a message with meeting topic and calledBy", async () => {
    const sender = new NotificationSender(MOCK_BOT as any)
    await sender.sendMeetingCalled("MTG-001", "HAT3X-001", "Launch scope?", "pm-chatbots")
    expect(MOCK_BOT.api.sendMessage).toHaveBeenCalledOnce()
    const [, text] = MOCK_BOT.api.sendMessage.mock.calls[0]
    expect(text).toContain("MTG-001")
    expect(text).toContain("Launch scope?")
  })
})

describe("sendMeetingResolved", () => {
  it("sends a message with consensus", async () => {
    const sender = new NotificationSender(MOCK_BOT as any)
    await sender.sendMeetingResolved("MTG-001", "HAT3X-001", "launch")
    expect(MOCK_BOT.api.sendMessage).toHaveBeenCalledOnce()
    const [, text] = MOCK_BOT.api.sendMessage.mock.calls[0]
    expect(text).toContain("MTG-001")
    expect(text).toContain("launch")
  })
})

describe("sendCheckpointReminder", () => {
  it("sends a reminder message for stale checkpoint", async () => {
    const sender = new NotificationSender(MOCK_BOT as any)
    const checkpoint = {
      id: "CHK-001", taskId: "HAT3X-001", afterPhase: 1,
      reason: "Old checkpoint", requiredApproval: "jose" as const,
      status: "pending" as const, feedback: null,
      triggeredAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
    }
    await sender.sendCheckpointReminder(checkpoint)
    expect(MOCK_BOT.api.sendMessage).toHaveBeenCalledOnce()
    const [, text] = MOCK_BOT.api.sendMessage.mock.calls[0]
    expect(text).toContain("CHK-001")
    expect(text).toContain("recordatorio")
  })
})
