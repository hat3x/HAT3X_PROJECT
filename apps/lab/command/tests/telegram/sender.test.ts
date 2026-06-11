import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { HatCheckpoint } from "../../src/checkpoint/types"

const MOCK_SEND_MESSAGE = vi.fn().mockResolvedValue(undefined)
const MOCK_BOT = {
  api: { sendMessage: MOCK_SEND_MESSAGE },
}

vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(() => MOCK_BOT),
  InlineKeyboard: class {
    text(_label: string, _data: string) { return this }
  },
}))

const MOCK_CHECKPOINT: HatCheckpoint = {
  id: "CHK-001",
  taskId: "HAT3X-001",
  afterPhase: 1,
  reason: "Aprobación del cliente requerida",
  requiredApproval: "both",
  status: "pending",
  feedback: null,
  triggeredAt: "2026-05-26T12:00:00Z",
  resolvedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env["TELEGRAM_JOSE_CHAT_ID"] = "123456789"
})

afterEach(() => {
  vi.resetModules()
})

describe("NotificationSender", () => {
  it("sendCheckpointAlert sends message to Jose chat id", async () => {
    const { NotificationSender } = await import("../../src/telegram/notifications/sender")
    const sender = new NotificationSender(MOCK_BOT as any)
    await sender.sendCheckpointAlert(MOCK_CHECKPOINT)

    expect(MOCK_SEND_MESSAGE).toHaveBeenCalledOnce()
    const [chatId, text] = MOCK_SEND_MESSAGE.mock.calls[0]!
    expect(chatId).toBe(123456789)
    expect(text).toContain("CHK-001")
  })

  it("sendTaskCompleted sends completion message to Jose", async () => {
    const { NotificationSender } = await import("../../src/telegram/notifications/sender")
    const sender = new NotificationSender(MOCK_BOT as any)
    await sender.sendTaskCompleted("HAT3X-001", "Chatbot WhatsApp completado")

    expect(MOCK_SEND_MESSAGE).toHaveBeenCalledOnce()
    const [chatId, text] = MOCK_SEND_MESSAGE.mock.calls[0]!
    expect(chatId).toBe(123456789)
    expect(text).toContain("HAT3X-001")
    expect(text).toContain("completado")
  })

  it("sendAgentBlocked sends blocked agent message to Jose", async () => {
    const { NotificationSender } = await import("../../src/telegram/notifications/sender")
    const sender = new NotificationSender(MOCK_BOT as any)
    await sender.sendAgentBlocked("HAT3X-001", "pm-chatbots", "API key inválida")

    expect(MOCK_SEND_MESSAGE).toHaveBeenCalledOnce()
    const [chatId, text] = MOCK_SEND_MESSAGE.mock.calls[0]!
    expect(chatId).toBe(123456789)
    expect(text).toContain("pm-chatbots")
    expect(text).toContain("API key")
  })

  it("throws if TELEGRAM_JOSE_CHAT_ID is not set", async () => {
    delete process.env["TELEGRAM_JOSE_CHAT_ID"]
    const { NotificationSender } = await import("../../src/telegram/notifications/sender")
    const sender = new NotificationSender(MOCK_BOT as any)

    await expect(sender.sendTaskCompleted("HAT3X-001", "done")).rejects.toThrow(
      "TELEGRAM_JOSE_CHAT_ID"
    )
  })
})
