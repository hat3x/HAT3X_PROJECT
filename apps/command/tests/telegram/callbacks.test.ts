import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

function makeMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    message: { text: "" },
    callbackQuery: { data: "" },
    ...overrides,
  } as any
}

const MOCK_UPDATE = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  MOCK_UPDATE.mockResolvedValue({ error: null })
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: MOCK_UPDATE,
        }),
      }),
    }),
  } as any)
})

afterEach(() => {
  vi.resetModules()
})

describe("handleApproveCallback", () => {
  it("resolves checkpoint as approved and answers query", async () => {
    const { handleApproveCallback } = await import("../../src/telegram/handlers/callbacks")
    const ctx = makeMockCtx({ callbackQuery: { data: "aprobar:CHK-001" } })

    await handleApproveCallback(ctx, "CHK-001")

    expect(MOCK_UPDATE).toHaveBeenCalledOnce()
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: "✅ Checkpoint CHK-001 aprobado" })
  })
})

describe("handleRejectCallback", () => {
  it("resolves checkpoint as rejected and answers query", async () => {
    const { handleRejectCallback } = await import("../../src/telegram/handlers/callbacks")
    const ctx = makeMockCtx({ callbackQuery: { data: "rechazar:CHK-001" } })

    await handleRejectCallback(ctx, "CHK-001")

    expect(MOCK_UPDATE).toHaveBeenCalledOnce()
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: "❌ Checkpoint CHK-001 rechazado" })
  })
})

describe("handleAprobarCommand", () => {
  it("replies with usage when no id provided", async () => {
    const { handleAprobarCommand } = await import("../../src/telegram/handlers/callbacks")
    const ctx = makeMockCtx({ message: { text: "/aprobar" } })
    await handleAprobarCommand(ctx)
    expect(ctx.reply.mock.calls[0]![0]).toContain("Uso:")
  })

  it("approves checkpoint and replies with confirmation", async () => {
    const { handleAprobarCommand } = await import("../../src/telegram/handlers/callbacks")
    const ctx = makeMockCtx({ message: { text: "/aprobar CHK-001 Todo correcto" } })
    await handleAprobarCommand(ctx)

    expect(MOCK_UPDATE).toHaveBeenCalledOnce()
    expect(ctx.reply.mock.calls[0]![0]).toContain("aprobado")
  })
})

describe("handleRechazarCommand", () => {
  it("replies with usage when no motivo provided", async () => {
    const { handleRechazarCommand } = await import("../../src/telegram/handlers/callbacks")
    const ctx = makeMockCtx({ message: { text: "/rechazar CHK-001" } })
    await handleRechazarCommand(ctx)
    expect(ctx.reply.mock.calls[0]![0]).toContain("Uso:")
  })

  it("rejects checkpoint and replies with confirmation", async () => {
    const { handleRechazarCommand } = await import("../../src/telegram/handlers/callbacks")
    const ctx = makeMockCtx({ message: { text: "/rechazar CHK-001 Necesita revisión" } })
    await handleRechazarCommand(ctx)

    expect(MOCK_UPDATE).toHaveBeenCalledOnce()
    expect(ctx.reply.mock.calls[0]![0]).toContain("rechazado")
  })
})
