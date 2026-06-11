import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"
import { CommandCenter } from "../../src/command-center/index"

vi.mock("../../src/database/client")
vi.mock("../../src/command-center/index")
vi.mock("../../src/learning-officer/index.js", () => ({
  runLearningCycle: vi.fn().mockResolvedValue("🧠 informe"),
}))

function makeMockCtx(text: string = "") {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    message: { text },
    chat: { id: 123456789 },
    from: { first_name: "Jose" },
  } as any
}

const MOCK_TASKS = [
  {
    id: "HAT3X-001",
    order_raw: "Chatbot para WhatsApp",
    status: "running",
    control_mode: "phased",
    created_at: "2026-05-26T10:00:00Z",
  },
]

const MOCK_CHECKPOINTS = [
  {
    id: "CHK-001",
    task_id: "HAT3X-001",
    after_phase: 1,
    reason: "Aprobación requerida",
    required_approval: "jose",
    status: "pending",
    feedback: null,
    triggered_at: "2026-05-26T12:00:00Z",
    resolved_at: null,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe("handleStatus", () => {
  it("fetches 5 most recent tasks and replies", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: MOCK_TASKS, error: null }),
          }),
        }),
      }),
    } as any)

    const { handleStatus } = await import("../../src/telegram/handlers/commands")
    const ctx = makeMockCtx()
    await handleStatus(ctx)

    expect(ctx.reply).toHaveBeenCalledOnce()
    const replyText = ctx.reply.mock.calls[0]![0]
    expect(replyText).toContain("HAT3X-001")
  })
})

describe("handleNuevo", () => {
  it("replies with usage error when no order provided", async () => {
    const { handleNuevo } = await import("../../src/telegram/handlers/commands")
    const ctx = makeMockCtx("/nuevo")
    await handleNuevo(ctx)

    const replyText = ctx.reply.mock.calls[0]![0]
    expect(replyText).toContain("Uso:")
  })

  it("creates task and replies with ID when order is given", async () => {
    vi.mocked(CommandCenter).mockImplementation(() => ({
      processOrder: vi.fn().mockResolvedValue({
        id: "HAT3X-002",
        orderRaw: "Chatbot WhatsApp",
        status: "pending",
        controlMode: "phased",
        subtasks: [],
        executionPlan: null,
        clientId: null,
        createdAt: new Date().toISOString(),
      }),
    }) as any)

    const { handleNuevo } = await import("../../src/telegram/handlers/commands")
    const ctx = makeMockCtx("/nuevo Chatbot WhatsApp para clínica")
    await handleNuevo(ctx)

    const allReplies = ctx.reply.mock.calls.map((c: any[]) => c[0]).join(" ")
    expect(allReplies).toContain("HAT3X-002")
  })
})

describe("handleCheckpoints", () => {
  it("replies with 'sin checkpoints' when table is empty", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any)

    const { handleCheckpoints } = await import("../../src/telegram/handlers/commands")
    const ctx = makeMockCtx()
    await handleCheckpoints(ctx)

    const replyText = ctx.reply.mock.calls[0]![0]
    expect(replyText).toContain("Sin checkpoints")
  })

  it("sends one message per pending checkpoint", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: MOCK_CHECKPOINTS, error: null }),
          }),
        }),
      }),
    } as any)

    const { handleCheckpoints } = await import("../../src/telegram/handlers/commands")
    const ctx = makeMockCtx()
    await handleCheckpoints(ctx)

    expect(ctx.reply.mock.calls.length).toBeGreaterThanOrEqual(1)
    const allText = ctx.reply.mock.calls.map((c: any[]) => c[0]).join(" ")
    expect(allText).toContain("CHK-001")
  })
})

describe("handlePlan", () => {
  it("replies with usage when no task id provided", async () => {
    const { handlePlan } = await import("../../src/telegram/handlers/commands")
    const ctx = makeMockCtx("/plan")
    await handlePlan(ctx)

    const replyText = ctx.reply.mock.calls[0]![0]
    expect(replyText).toContain("Uso:")
  })

  it("replies with no-plan message when execution_plan is null", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "HAT3X-001",
                order_raw: "Test",
                status: "pending",
                control_mode: "phased",
                subtasks: null,
                execution_plan: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    } as any)

    const { handlePlan } = await import("../../src/telegram/handlers/commands")
    const ctx = makeMockCtx("/plan HAT3X-001")
    await handlePlan(ctx)

    const replyText = ctx.reply.mock.calls[0]![0]
    expect(replyText).toContain("Sin plan")
  })
})

describe("handleAyuda", () => {
  it("replies with list of commands", async () => {
    const { handleAyuda } = await import("../../src/telegram/handlers/commands")
    const ctx = makeMockCtx("/ayuda")
    await handleAyuda(ctx)

    const replyText = ctx.reply.mock.calls[0]![0]
    expect(replyText).toContain("/status")
    expect(replyText).toContain("/nuevo")
    expect(replyText).toContain("/checkpoints")
  })
})

describe("createHandleAprender", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("responde con mensaje de inicio y llama runLearningCycle", async () => {
    const { runLearningCycle } = await import("../../src/learning-officer/index.js")
    const { createHandleAprender } = await import("../../src/telegram/handlers/commands")
    const sender = { sendEvolutionReport: vi.fn() }
    const handler = createHandleAprender(sender as any)
    const ctx = makeMockCtx("/aprender")
    await handler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith("🧠 Ejecutando ciclo de aprendizaje...")
    expect(runLearningCycle).toHaveBeenCalledWith(sender)
    // Only the initial message — no error reply (report is sent by sendEvolutionReport inside runLearningCycle)
    expect(ctx.reply).toHaveBeenCalledTimes(1)
  })

  it("responde con error cuando runLearningCycle lanza excepción", async () => {
    const { runLearningCycle } = await import("../../src/learning-officer/index.js")
    vi.mocked(runLearningCycle).mockRejectedValueOnce(new Error("DB down"))
    const { createHandleAprender } = await import("../../src/telegram/handlers/commands")
    const handler = createHandleAprender({ sendEvolutionReport: vi.fn() } as any)
    const ctx = makeMockCtx("/aprender")
    await handler(ctx)
    const allReplies = ctx.reply.mock.calls.map((c: any[]) => c[0]).join(" ")
    expect(allReplies).toContain("Error: DB down")
  })
})
