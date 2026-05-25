import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

const MOCK_INSERT = vi.fn()
const MOCK_UPDATE = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  MOCK_INSERT.mockResolvedValue({ error: null })
  MOCK_UPDATE.mockResolvedValue({ error: null })
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      insert: MOCK_INSERT,
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

describe("createCheckpoint", () => {
  it("inserts a checkpoint row with correct fields", async () => {
    const { createCheckpoint } = await import("../../src/checkpoint/factory")
    await createCheckpoint({
      taskId: "HAT3X-001",
      afterPhase: 1,
      reason: "Client deliverable requires approval",
      requiredApproval: "jose",
    })

    expect(MOCK_INSERT).toHaveBeenCalledOnce()
    const inserted = MOCK_INSERT.mock.calls[0]![0]
    expect(inserted.task_id).toBe("HAT3X-001")
    expect(inserted.after_phase).toBe(1)
    expect(inserted.required_approval).toBe("jose")
    expect(inserted.status).toBe("pending")
    expect(typeof inserted.id).toBe("string")
    expect(inserted.id).toMatch(/^CHK-\d{3}$/)
  })

  it("returns a HatCheckpoint with all required fields", async () => {
    const { createCheckpoint } = await import("../../src/checkpoint/factory")
    const result = await createCheckpoint({
      taskId: "HAT3X-001",
      afterPhase: 2,
      reason: "Risk threshold exceeded",
      requiredApproval: "both",
    })

    expect(result.id).toMatch(/^CHK-/)
    expect(result.taskId).toBe("HAT3X-001")
    expect(result.afterPhase).toBe(2)
    expect(result.status).toBe("pending")
    expect(result.feedback).toBeNull()
  })
})

describe("resolveCheckpoint", () => {
  it("updates status to approved with feedback", async () => {
    const { resolveCheckpoint } = await import("../../src/checkpoint/factory")
    await resolveCheckpoint("CHK-001", "approved", "Looks good")
    expect(MOCK_UPDATE).toHaveBeenCalledOnce()
  })

  it("updates status to rejected with motivo", async () => {
    const { resolveCheckpoint } = await import("../../src/checkpoint/factory")
    await resolveCheckpoint("CHK-001", "rejected", "Needs rework")
    expect(MOCK_UPDATE).toHaveBeenCalledOnce()
  })
})

describe("createCheckpoint — error handling", () => {
  it("throws when insert fails", async () => {
    MOCK_INSERT.mockResolvedValue({ error: { message: "DB error" } })
    const { createCheckpoint } = await import("../../src/checkpoint/factory")
    await expect(
      createCheckpoint({ taskId: "HAT3X-001", afterPhase: 1, reason: "test", requiredApproval: "jose" })
    ).rejects.toThrow("Failed to create checkpoint: DB error")
  })
})

describe("resolveCheckpoint — error handling", () => {
  it("throws when update fails", async () => {
    MOCK_UPDATE.mockResolvedValue({ error: { message: "DB error" } })
    const { resolveCheckpoint } = await import("../../src/checkpoint/factory")
    await expect(
      resolveCheckpoint("CHK-001", "approved", "ok")
    ).rejects.toThrow("Failed to resolve checkpoint: DB error")
  })
})
