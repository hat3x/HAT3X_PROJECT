import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")
vi.mock("js-yaml")
vi.mock("node:fs/promises")
vi.mock("simple-git")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_INSERT = vi.fn().mockResolvedValue({ error: null })

describe("applyReport", () => {
  it("inserts to evolution_log for each delta", async () => {
    const yaml = await import("js-yaml")
    const fs = await import("node:fs/promises")
    const simpleGit = await import("simple-git")

    vi.mocked(yaml.load).mockReturnValue({
      vertical: "chatbots",
      skills: ["rag-chatbots"],
      scores: { "rag-chatbots": 0.75 },
    })
    vi.mocked(yaml.dump).mockReturnValue("yaml content")
    vi.mocked(fs.readFile).mockResolvedValue("yaml content" as any)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(simpleGit.default).mockReturnValue({
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any)
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: MOCK_INSERT }),
    } as any)

    const { applyReport } = await import("../../src/learning-officer/evolution-engine")
    await applyReport({
      generatedAt: new Date().toISOString(),
      signalCount: 1,
      deltas: [{ vertical: "chatbots", skill: "rag-chatbots", delta: 0.1, reason: "Task HAT3X-001 approved" }],
      proposals: [],
      antiPatterns: [],
      summary: "1 señal",
    })

    expect(MOCK_INSERT).toHaveBeenCalled()
  })

  it("inserts to evolution_proposals for each proposal", async () => {
    const yaml = await import("js-yaml")
    const fs = await import("node:fs/promises")
    const simpleGit = await import("simple-git")

    vi.mocked(yaml.load).mockReturnValue({ vertical: "chatbots", skills: [], scores: {} })
    vi.mocked(yaml.dump).mockReturnValue("")
    vi.mocked(fs.readFile).mockResolvedValue("" as any)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(simpleGit.default).mockReturnValue({
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any)
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: MOCK_INSERT }),
    } as any)

    const { applyReport } = await import("../../src/learning-officer/evolution-engine")
    await applyReport({
      generatedAt: new Date().toISOString(),
      signalCount: 2,
      deltas: [],
      proposals: [{
        id: "PROP-001",
        description: "Review chatbots config",
        impact: "medium" as const,
        evidence: { vertical: "chatbots", failedTasks: ["HAT3X-001", "HAT3X-002"] },
      }],
      antiPatterns: [],
      summary: "2 señales",
    })

    expect(MOCK_INSERT).toHaveBeenCalled()
  })

  it("clamps score to max 1.0", async () => {
    const yaml = await import("js-yaml")
    const fs = await import("node:fs/promises")
    const simpleGit = await import("simple-git")

    let writtenData: unknown = null
    vi.mocked(yaml.load).mockReturnValue({
      vertical: "chatbots",
      skills: ["rag-chatbots"],
      scores: { "rag-chatbots": 0.98 },
    })
    vi.mocked(yaml.dump).mockImplementation((data) => { writtenData = data; return "yaml" })
    vi.mocked(fs.readFile).mockResolvedValue("yaml" as any)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(simpleGit.default).mockReturnValue({
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
    } as any)
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: MOCK_INSERT }),
    } as any)

    const { applyReport } = await import("../../src/learning-officer/evolution-engine")
    await applyReport({
      generatedAt: new Date().toISOString(),
      signalCount: 1,
      deltas: [{ vertical: "chatbots", skill: "rag-chatbots", delta: 0.1, reason: "test" }],
      proposals: [],
      antiPatterns: [],
      summary: "",
    })

    const written = writtenData as { scores: Record<string, number> }
    expect(written.scores["rag-chatbots"]).toBe(1.0)
  })
})
