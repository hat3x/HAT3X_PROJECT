# HAT3X Command — Plan 5: Evolution (Learning Officer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Learning Officer — the system that makes HAT3X Command get smarter after every project. The officer collects signals from completed tasks and checkpoint feedback, analyzes what worked and what failed, applies small automatic improvements to the Capability Map YAMLs (score ±0.1), logs every change to Supabase, proposes major changes to the human, and sends a Telegram report on-demand (`oficina aprender`) and weekly.

**Architecture:**
- `Collector` — queries `hat3x_tasks` (completed) + `hat3x_checkpoints` (with feedback) → produces raw `LearningSignals`
- `Analyzer` — pure function: turns `LearningSignals` → `LearningReport` (auto score deltas, anti-patterns, proposals)
- `EvolutionEngine` — applies YAML score updates, runs `git commit`, writes to `evolution_log`; saves proposals to `evolution_proposals`
- `Reporter` — formats `LearningReport` into Telegram message, calls `NotificationSender.sendEvolutionReport`
- CLI command `oficina aprender [--task <id>] [--dry-run]` — orchestrates the 5 phases end-to-end

**Rules for auto-changes:**
- Score adjustment: ±0.1 per signal (checkpoint approved with praise → +0.1; checkpoint rejected or task failed → −0.1)
- Score stays in [0.0, 1.0]
- Minimum 1 completed project before any change
- Major changes (rewrite config, new mandatory skill, delete skill) → proposal only, never auto

**Tech stack:** TypeScript/ESM, Supabase, `js-yaml`, `simple-git`, grammY, Vitest, existing `getSupabaseClient` / `NotificationSender` / capability-map loader.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/database/migrations/004_evolution.sql` | Create | evolution_log + evolution_proposals tables |
| `src/learning-officer/types.ts` | Create | LearningSignal, LearningReport, ScoreDelta, EvolutionProposal types |
| `src/learning-officer/collector.ts` | Create | collectSignals — query completed tasks + checkpoint feedback |
| `src/learning-officer/analyzer.ts` | Create | analyzeSignals — pure function: signals → LearningReport |
| `src/learning-officer/evolution-engine.ts` | Create | applyReport — update YAMLs, git commit, log to evolution_log |
| `src/learning-officer/reporter.ts` | Create | formatReport — produce Telegram-ready text from LearningReport |
| `src/learning-officer/index.ts` | Create | runLearningCycle — orchestrates all 5 phases |
| `src/telegram/notifications/sender.ts` | Modify | Add sendEvolutionReport method |
| `src/index.ts` | Modify | Add `oficina aprender [--task <id>] [--dry-run]` command |
| `anti-patterns/registry.yaml` | Create | Anti-patterns registry file (initially empty) |
| `tests/learning-officer/collector.test.ts` | Create | Unit tests for collector |
| `tests/learning-officer/analyzer.test.ts` | Create | Unit tests for analyzer (pure) |
| `tests/learning-officer/evolution-engine.test.ts` | Create | Unit tests for evolution engine |
| `tests/learning-officer/reporter.test.ts` | Create | Unit tests for reporter |

---

### Task 1: SQL Migration — evolution_log + evolution_proposals

**Files:**
- Create: `command/src/database/migrations/004_evolution.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 004_evolution.sql
-- evolution_log: one row per automatic change applied by the Learning Officer
CREATE TABLE IF NOT EXISTS evolution_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT,
  agent_id      TEXT,
  vertical      TEXT,
  change_type   TEXT NOT NULL,           -- 'score_adjustment' | 'anti_pattern' | 'note'
  description   TEXT NOT NULL,
  before_value  JSONB,
  after_value   JSONB,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by    TEXT NOT NULL DEFAULT 'learning-officer'
);

-- evolution_proposals: major changes that require human approval
CREATE TABLE IF NOT EXISTS evolution_proposals (
  id            TEXT PRIMARY KEY,        -- PROP-001, PROP-002...
  description   TEXT NOT NULL,
  impact        TEXT NOT NULL,           -- 'low' | 'medium' | 'high'
  evidence      JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS evolution_log_agent_id_idx ON evolution_log(agent_id);
CREATE INDEX IF NOT EXISTS evolution_log_applied_at_idx ON evolution_log(applied_at);
CREATE INDEX IF NOT EXISTS evolution_proposals_status_idx ON evolution_proposals(status);
```

- [ ] **Step 2: Apply migration in Supabase Dashboard**

Navigate to Supabase Dashboard → SQL Editor, paste and run `004_evolution.sql`.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify tables**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('evolution_log', 'evolution_proposals');
```

Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
git add command/src/database/migrations/004_evolution.sql
git commit -m "feat(evolution): add evolution_log and evolution_proposals tables"
```

---

### Task 2: Learning Officer Types

**Files:**
- Create: `command/src/learning-officer/types.ts`
- Test: `command/tests/learning-officer/types.test.ts`

- [ ] **Step 1: Write the failing type test**

```typescript
// tests/learning-officer/types.test.ts
import { describe, it, expectTypeOf } from "vitest"
import type {
  LearningSignal,
  LearningReport,
  ScoreDelta,
  EvolutionProposal,
} from "../../src/learning-officer/types"

describe("learning officer types", () => {
  it("LearningSignal has required fields", () => {
    expectTypeOf<LearningSignal>().toHaveProperty("taskId")
    expectTypeOf<LearningSignal>().toHaveProperty("vertical")
    expectTypeOf<LearningSignal>().toHaveProperty("agentId")
    expectTypeOf<LearningSignal>().toHaveProperty("outcome")
    expectTypeOf<LearningSignal>().toHaveProperty("checkpointFeedback")
  })

  it("ScoreDelta has vertical, skill, delta", () => {
    expectTypeOf<ScoreDelta>().toHaveProperty("vertical")
    expectTypeOf<ScoreDelta>().toHaveProperty("skill")
    expectTypeOf<ScoreDelta>().toHaveProperty("delta")
  })

  it("LearningReport has deltas, proposals, antiPatterns", () => {
    expectTypeOf<LearningReport>().toHaveProperty("deltas")
    expectTypeOf<LearningReport>().toHaveProperty("proposals")
    expectTypeOf<LearningReport>().toHaveProperty("antiPatterns")
    expectTypeOf<LearningReport>().toHaveProperty("signalCount")
  })

  it("EvolutionProposal has id, description, impact, evidence", () => {
    expectTypeOf<EvolutionProposal>().toHaveProperty("id")
    expectTypeOf<EvolutionProposal>().toHaveProperty("description")
    expectTypeOf<EvolutionProposal>().toHaveProperty("impact")
    expectTypeOf<EvolutionProposal>().toHaveProperty("evidence")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command && npx vitest run tests/learning-officer/types.test.ts
```

Expected: FAIL — "Cannot find module '../../src/learning-officer/types'"

- [ ] **Step 3: Create types file**

```typescript
// src/learning-officer/types.ts

export type SignalOutcome = "success" | "partial" | "failure"
export type ProposalImpact = "low" | "medium" | "high"

export interface LearningSignal {
  taskId: string
  vertical: string
  agentId: string
  outcome: SignalOutcome
  checkpointFeedback: string | null  // text from human checkpoint, if any
  durationHours: number | null
  failureReason: string | null
}

export interface ScoreDelta {
  vertical: string
  skill: string
  delta: number           // typically ±0.1
  reason: string
}

export interface AntiPattern {
  id: string
  description: string
  affectedVerticals: string[]
  detectedFrom: string   // taskId that triggered detection
}

export interface EvolutionProposal {
  id: string
  description: string
  impact: ProposalImpact
  evidence: Record<string, unknown>
}

export interface LearningReport {
  generatedAt: string
  signalCount: number
  deltas: ScoreDelta[]
  proposals: EvolutionProposal[]
  antiPatterns: AntiPattern[]
  summary: string
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command && npx vitest run tests/learning-officer/types.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add command/src/learning-officer/types.ts command/tests/learning-officer/types.test.ts
git commit -m "feat(evolution): add LearningOfficer types — LearningSignal, LearningReport, ScoreDelta, EvolutionProposal"
```

---

### Task 3: Collector

**Files:**
- Create: `command/src/learning-officer/collector.ts`
- Test: `command/tests/learning-officer/collector.test.ts`

Queries `hat3x_tasks` (status='completed') and `hat3x_checkpoints` (with feedback, status IN approved/rejected). Maps to `LearningSignal[]`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/learning-officer/collector.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_TASK = {
  id: "HAT3X-001",
  title: "Chatbot web",
  status: "completed",
  priority: "high",
  current_phase: 3,
  vertical: "chatbots",
  agent_id: "pm-chatbots",
  created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  completed_at: new Date().toISOString(),
}

const MOCK_CHECKPOINT_APPROVED = {
  id: "CHK-001",
  task_id: "HAT3X-001",
  reason: "Deployment ready",
  status: "approved",
  feedback: "Excellent work, very fast delivery",
  triggered_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  resolved_at: new Date().toISOString(),
}

describe("collectSignals", () => {
  it("returns one signal per completed task with outcome=success for approved checkpoint", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "hat3x_tasks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [MOCK_TASK], error: null }),
            }),
          }
        }
        if (table === "hat3x_checkpoints") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: [MOCK_CHECKPOINT_APPROVED], error: null }),
              }),
            }),
          }
        }
        return {}
      }),
    } as any)

    const { collectSignals } = await import("../../src/learning-officer/collector")
    const signals = await collectSignals()

    expect(signals).toHaveLength(1)
    expect(signals[0].taskId).toBe("HAT3X-001")
    expect(signals[0].vertical).toBe("chatbots")
    expect(signals[0].outcome).toBe("success")
    expect(signals[0].checkpointFeedback).toContain("fast delivery")
  })

  it("maps rejected checkpoint to outcome=failure", async () => {
    const rejectedCheckpoint = { ...MOCK_CHECKPOINT_APPROVED, status: "rejected", feedback: "Missing tests" }

    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "hat3x_tasks") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [MOCK_TASK], error: null }),
            }),
          }
        }
        if (table === "hat3x_checkpoints") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: [rejectedCheckpoint], error: null }),
              }),
            }),
          }
        }
        return {}
      }),
    } as any)

    const { collectSignals } = await import("../../src/learning-officer/collector")
    const signals = await collectSignals()

    expect(signals[0].outcome).toBe("failure")
  })

  it("returns empty array when no completed tasks", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as any)

    const { collectSignals } = await import("../../src/learning-officer/collector")
    const signals = await collectSignals()
    expect(signals).toHaveLength(0)
  })

  it("throws when tasks query fails", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      }),
    } as any)

    const { collectSignals } = await import("../../src/learning-officer/collector")
    await expect(collectSignals()).rejects.toThrow("Failed to collect tasks")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command && npx vitest run tests/learning-officer/collector.test.ts
```

Expected: FAIL — "Cannot find module '../../src/learning-officer/collector'"

- [ ] **Step 3: Implement collector**

```typescript
// src/learning-officer/collector.ts
import { getSupabaseClient } from "../database/client.js"
import type { LearningSignal, SignalOutcome } from "./types.js"

function outcomeFromCheckpoints(checkpoints: Record<string, unknown>[]): SignalOutcome {
  if (checkpoints.length === 0) return "success"
  const hasRejected = checkpoints.some((c) => c["status"] === "rejected")
  if (hasRejected) return "failure"
  return "success"
}

function mergedFeedback(checkpoints: Record<string, unknown>[]): string | null {
  const texts = checkpoints
    .map((c) => c["feedback"] as string | null)
    .filter((f): f is string => f != null && f.length > 0)
  return texts.length > 0 ? texts.join(" | ") : null
}

export async function collectSignals(): Promise<LearningSignal[]> {
  const client = getSupabaseClient()

  const { data: tasks, error: taskError } = await client
    .from("hat3x_tasks")
    .select("*")
    .eq("status", "completed")

  if (taskError != null) throw new Error(`Failed to collect tasks: ${taskError.message}`)
  if (!tasks || tasks.length === 0) return []

  const taskIds = tasks.map((t: Record<string, unknown>) => t["id"] as string)

  const { data: checkpoints, error: cpError } = await client
    .from("hat3x_checkpoints")
    .select("*")
    .in("task_id", taskIds)
    .not("feedback", "is", null)

  if (cpError != null) throw new Error(`Failed to collect checkpoints: ${cpError.message}`)

  const checkpointsByTask = new Map<string, Record<string, unknown>[]>()
  for (const cp of (checkpoints ?? []) as Record<string, unknown>[]) {
    const tid = cp["task_id"] as string
    if (!checkpointsByTask.has(tid)) checkpointsByTask.set(tid, [])
    checkpointsByTask.get(tid)!.push(cp)
  }

  return tasks.map((task: Record<string, unknown>): LearningSignal => {
    const cps = checkpointsByTask.get(task["id"] as string) ?? []
    const createdAt = task["created_at"] as string | null
    const completedAt = task["completed_at"] as string | null
    let durationHours: number | null = null
    if (createdAt != null && completedAt != null) {
      durationHours = (new Date(completedAt).getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
    }

    return {
      taskId: task["id"] as string,
      vertical: (task["vertical"] as string | null) ?? "unknown",
      agentId: (task["agent_id"] as string | null) ?? "unknown",
      outcome: outcomeFromCheckpoints(cps),
      checkpointFeedback: mergedFeedback(cps),
      durationHours,
      failureReason: null,
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd command && npx vitest run tests/learning-officer/collector.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add command/src/learning-officer/collector.ts command/tests/learning-officer/collector.test.ts
git commit -m "feat(evolution): add LearningOfficer Collector — collectSignals from completed tasks + checkpoint feedback"
```

---

### Task 4: Analyzer (pure function)

**Files:**
- Create: `command/src/learning-officer/analyzer.ts`
- Test: `command/tests/learning-officer/analyzer.test.ts`

Pure function: `LearningSignal[] → LearningReport`. No I/O, no DB.

**Rules:**
- `outcome=success` + positive feedback → +0.1 for the vertical's primary skill
- `outcome=failure` → −0.1 for the vertical's primary skill
- Same vertical fails 2+ times → add `EvolutionProposal` (impact=medium)

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/learning-officer/analyzer.test.ts
import { describe, it, expect } from "vitest"
import type { LearningSignal } from "../../src/learning-officer/types"

function makeSignal(overrides: Partial<LearningSignal> = {}): LearningSignal {
  return {
    taskId: "HAT3X-001",
    vertical: "chatbots",
    agentId: "pm-chatbots",
    outcome: "success",
    checkpointFeedback: null,
    durationHours: 4,
    failureReason: null,
    ...overrides,
  }
}

describe("analyzeSignals", () => {
  it("produces positive delta for successful task with feedback", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const signals = [makeSignal({ outcome: "success", checkpointFeedback: "excellent delivery" })]
    const report = analyzeSignals(signals)

    expect(report.signalCount).toBe(1)
    expect(report.deltas.some((d) => d.delta > 0 && d.vertical === "chatbots")).toBe(true)
  })

  it("produces negative delta for failure", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const signals = [makeSignal({ outcome: "failure", failureReason: "missing tests" })]
    const report = analyzeSignals(signals)

    expect(report.deltas.some((d) => d.delta < 0 && d.vertical === "chatbots")).toBe(true)
  })

  it("produces a proposal when same vertical fails 2+ times", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const signals = [
      makeSignal({ outcome: "failure", taskId: "HAT3X-001" }),
      makeSignal({ outcome: "failure", taskId: "HAT3X-002" }),
    ]
    const report = analyzeSignals(signals)

    expect(report.proposals.length).toBeGreaterThanOrEqual(1)
    expect(report.proposals[0].impact).toBe("medium")
    expect(report.proposals[0].description).toContain("chatbots")
  })

  it("returns empty deltas for empty signals", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const report = analyzeSignals([])
    expect(report.signalCount).toBe(0)
    expect(report.deltas).toHaveLength(0)
    expect(report.proposals).toHaveLength(0)
  })

  it("does NOT produce delta for success without feedback", async () => {
    const { analyzeSignals } = await import("../../src/learning-officer/analyzer")
    const signals = [makeSignal({ outcome: "success", checkpointFeedback: null })]
    const report = analyzeSignals(signals)
    expect(report.deltas).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command && npx vitest run tests/learning-officer/analyzer.test.ts
```

Expected: FAIL — "Cannot find module '../../src/learning-officer/analyzer'"

- [ ] **Step 3: Implement analyzer**

```typescript
// src/learning-officer/analyzer.ts
import type { LearningSignal, LearningReport, ScoreDelta, EvolutionProposal } from "./types.js"

const PRIMARY_SKILL: Record<string, string> = {
  chatbots: "rag-chatbots",
  voz: "retell-ai",
  "webs-apps": "nextjs-shadcn",
  automatizaciones: "n8n-advanced",
  crm: "integrations/crm",
  calendar: "integrations/calendar",
  database: "integrations/database",
  github: "github",
  testing: "testing-qa",
  security: "security-audit",
  documentation: "documentation",
  deployment: "deploy-vercel",
}

let _proposalCounter = 0
function nextProposalId(): string {
  _proposalCounter++
  return `PROP-${String(_proposalCounter).padStart(3, "0")}`
}

export function analyzeSignals(signals: LearningSignal[]): LearningReport {
  const deltas: ScoreDelta[] = []
  const proposals: EvolutionProposal[] = []
  const failuresByVertical = new Map<string, string[]>()

  for (const signal of signals) {
    if (signal.outcome === "success" && signal.checkpointFeedback != null) {
      const skill = PRIMARY_SKILL[signal.vertical] ?? signal.vertical
      deltas.push({
        vertical: signal.vertical,
        skill,
        delta: 0.1,
        reason: `Task ${signal.taskId} approved with positive feedback`,
      })
    }

    if (signal.outcome === "failure") {
      const skill = PRIMARY_SKILL[signal.vertical] ?? signal.vertical
      deltas.push({
        vertical: signal.vertical,
        skill,
        delta: -0.1,
        reason: `Task ${signal.taskId} failed${signal.failureReason ? `: ${signal.failureReason}` : ""}`,
      })

      if (!failuresByVertical.has(signal.vertical)) {
        failuresByVertical.set(signal.vertical, [])
      }
      failuresByVertical.get(signal.vertical)!.push(signal.taskId)
    }
  }

  for (const [vertical, taskIds] of failuresByVertical.entries()) {
    if (taskIds.length >= 2) {
      proposals.push({
        id: nextProposalId(),
        description: `Vertical '${vertical}' has failed in ${taskIds.length} tasks (${taskIds.join(", ")}). Consider reviewing agent config or adding mandatory skills.`,
        impact: "medium",
        evidence: { vertical, failedTasks: taskIds },
      })
    }
  }

  const summary = signals.length === 0
    ? "No hay señales para analizar."
    : `${signals.length} señal(es) procesada(s). ${deltas.length} ajuste(s) de score. ${proposals.length} propuesta(s) generada(s).`

  return {
    generatedAt: new Date().toISOString(),
    signalCount: signals.length,
    deltas,
    proposals,
    antiPatterns: [],
    summary,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd command && npx vitest run tests/learning-officer/analyzer.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add command/src/learning-officer/analyzer.ts command/tests/learning-officer/analyzer.test.ts
git commit -m "feat(evolution): add LearningOfficer Analyzer — pure analyzeSignals: signals → LearningReport"
```

---

### Task 5: Evolution Engine

**Files:**
- Create: `command/src/learning-officer/evolution-engine.ts`
- Test: `command/tests/learning-officer/evolution-engine.test.ts`

Applies the `LearningReport` to the real system:
1. For each `ScoreDelta`: read vertical YAML, clamp score to [0.0, 1.0], write updated YAML, log to `evolution_log`
2. For each `EvolutionProposal`: insert to `evolution_proposals`
3. After all YAML changes: `git commit` with summary

- [ ] **Step 1: Install simple-git if needed**

```bash
cd command && npm list simple-git 2>/dev/null || npm install simple-git
```

- [ ] **Step 2: Write the failing tests**

```typescript
// tests/learning-officer/evolution-engine.test.ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd command && npx vitest run tests/learning-officer/evolution-engine.test.ts
```

Expected: FAIL — "Cannot find module '../../src/learning-officer/evolution-engine'"

- [ ] **Step 4: Implement evolution engine**

```typescript
// src/learning-officer/evolution-engine.ts
import { readFile, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as yaml from "js-yaml"
import simpleGit from "simple-git"
import { getSupabaseClient } from "../database/client.js"
import type { LearningReport } from "./types.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAP_DIR = join(__dirname, "../../../capability-map")
const REPO_DIR = join(__dirname, "../../../../")

function clamp(value: number): number {
  return Math.min(1.0, Math.max(0.0, value))
}

async function applyDelta(
  vertical: string,
  skill: string,
  delta: number
): Promise<{ before: number; after: number }> {
  const filePath = join(MAP_DIR, `${vertical}.yaml`)
  const content = await readFile(filePath, "utf-8")
  const data = yaml.load(content) as Record<string, unknown>

  const scores = (data["scores"] ?? {}) as Record<string, number>
  const before = scores[skill] ?? 0.5
  const after = clamp(before + delta)
  scores[skill] = after
  data["scores"] = scores

  await writeFile(filePath, yaml.dump(data), "utf-8")
  return { before, after }
}

export async function applyReport(report: LearningReport): Promise<void> {
  const client = getSupabaseClient()
  const git = simpleGit(REPO_DIR)
  const changedFiles: string[] = []

  for (const delta of report.deltas) {
    try {
      const { before, after } = await applyDelta(delta.vertical, delta.skill, delta.delta)
      changedFiles.push(`command/capability-map/${delta.vertical}.yaml`)

      const { error } = await client.from("evolution_log").insert({
        agent_id: null,
        vertical: delta.vertical,
        change_type: "score_adjustment",
        description: delta.reason,
        before_value: { skill: delta.skill, score: before },
        after_value: { skill: delta.skill, score: after },
        applied_by: "learning-officer",
      })

      if (error != null) {
        console.error(`Failed to log evolution for ${delta.skill}:`, error.message)
      }
    } catch (err) {
      console.error(`Failed to apply delta for ${delta.vertical}/${delta.skill}:`, err)
    }
  }

  for (const proposal of report.proposals) {
    const { error } = await client.from("evolution_proposals").insert({
      id: proposal.id,
      description: proposal.description,
      impact: proposal.impact,
      evidence: proposal.evidence,
      status: "pending",
    })

    if (error != null) {
      console.error(`Failed to save proposal ${proposal.id}:`, error.message)
    }
  }

  if (changedFiles.length > 0) {
    await git.add(changedFiles)
    const date = new Date().toISOString().slice(0, 10)
    await git.commit(
      `chore(evolution): learning officer update — ${report.signalCount} señal(es), ${report.deltas.length} ajuste(s) [${date}]`
    )
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd command && npx vitest run tests/learning-officer/evolution-engine.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add command/src/learning-officer/evolution-engine.ts command/tests/learning-officer/evolution-engine.test.ts
git commit -m "feat(evolution): add EvolutionEngine — applyReport: YAML score updates, evolution_log, git commit"
```

---

### Task 6: Reporter + NotificationSender

**Files:**
- Create: `command/src/learning-officer/reporter.ts`
- Modify: `command/src/telegram/notifications/sender.ts`
- Test: `command/tests/learning-officer/reporter.test.ts`

- [ ] **Step 1: Write the failing reporter tests**

```typescript
// tests/learning-officer/reporter.test.ts
import { describe, it, expect } from "vitest"
import type { LearningReport } from "../../src/learning-officer/types"

function makeReport(overrides: Partial<LearningReport> = {}): LearningReport {
  return {
    generatedAt: new Date().toISOString(),
    signalCount: 3,
    deltas: [
      { vertical: "chatbots", skill: "rag-chatbots", delta: 0.1, reason: "Task HAT3X-001 approved" },
      { vertical: "voz", skill: "retell-ai", delta: -0.1, reason: "Task HAT3X-002 failed" },
    ],
    proposals: [
      { id: "PROP-001", description: "Review voz config", impact: "medium", evidence: {} },
    ],
    antiPatterns: [],
    summary: "3 señales procesadas. 2 ajustes. 1 propuesta.",
    ...overrides,
  }
}

describe("formatReport", () => {
  it("includes signal count in output", async () => {
    const { formatReport } = await import("../../src/learning-officer/reporter")
    const text = formatReport(makeReport())
    expect(text).toContain("3")
  })

  it("lists score adjustments with sign", async () => {
    const { formatReport } = await import("../../src/learning-officer/reporter")
    const text = formatReport(makeReport())
    expect(text).toContain("chatbots")
    expect(text).toContain("+0.1")
    expect(text).toContain("-0.1")
  })

  it("lists proposals with id", async () => {
    const { formatReport } = await import("../../src/learning-officer/reporter")
    const text = formatReport(makeReport())
    expect(text).toContain("PROP-001")
    expect(text).toContain("Review voz config")
  })

  it("handles report with no signals gracefully", async () => {
    const { formatReport } = await import("../../src/learning-officer/reporter")
    const text = formatReport(makeReport({ signalCount: 0, deltas: [], proposals: [] }))
    expect(text).toContain("0")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command && npx vitest run tests/learning-officer/reporter.test.ts
```

Expected: FAIL — "Cannot find module '../../src/learning-officer/reporter'"

- [ ] **Step 3: Create reporter**

```typescript
// src/learning-officer/reporter.ts
import type { LearningReport } from "./types.js"

export function formatReport(report: LearningReport): string {
  const lines: string[] = [
    `🧠 *Learning Officer — Informe de Evolución*`,
    `Fecha: ${report.generatedAt.slice(0, 10)}`,
    `Señales procesadas: *${report.signalCount}*`,
    "",
  ]

  if (report.deltas.length > 0) {
    lines.push(`── Ajustes de Score (${report.deltas.length}) ──`)
    for (const d of report.deltas) {
      const sign = d.delta > 0 ? "+" : ""
      lines.push(`  [${d.vertical}] ${d.skill}: *${sign}${d.delta.toFixed(1)}*`)
      lines.push(`    ${d.reason}`)
    }
    lines.push("")
  }

  if (report.proposals.length > 0) {
    lines.push(`── Propuestas pendientes (${report.proposals.length}) ──`)
    for (const p of report.proposals) {
      lines.push(`  [${p.id}] (${p.impact}) ${p.description}`)
    }
    lines.push("")
  }

  if (report.antiPatterns.length > 0) {
    lines.push(`── Anti-Patterns detectados (${report.antiPatterns.length}) ──`)
    for (const ap of report.antiPatterns) {
      lines.push(`  [${ap.id}] ${ap.description}`)
    }
    lines.push("")
  }

  lines.push(report.summary)
  return lines.join("\n")
}
```

- [ ] **Step 4: Run reporter tests**

```bash
cd command && npx vitest run tests/learning-officer/reporter.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Add sendEvolutionReport to NotificationSender**

Open `src/telegram/notifications/sender.ts` and add this method before the closing brace of the class:

```typescript
  async sendEvolutionReport(report: string): Promise<void> {
    const chatId = this.getChatId()
    await this.bot.api.sendMessage(chatId, report, { parse_mode: "Markdown" })
  }
```

- [ ] **Step 6: Run full test suite**

```bash
cd command && npx vitest run
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add command/src/learning-officer/reporter.ts \
        command/src/telegram/notifications/sender.ts \
        command/tests/learning-officer/reporter.test.ts
git commit -m "feat(evolution): add LearningOfficer Reporter + NotificationSender.sendEvolutionReport"
```

---

### Task 7: Orchestrator + Anti-Patterns Registry + CLI Command

**Files:**
- Create: `command/src/learning-officer/index.ts`
- Create: `command/anti-patterns/registry.yaml`
- Modify: `command/src/index.ts`

- [ ] **Step 1: Create the anti-patterns registry file**

```yaml
# command/anti-patterns/registry.yaml
# Anti-patterns detected by the Learning Officer.
# Each entry is added automatically when 2+ failures share the same root cause.
# Format:
# - id: AP-001
#   description: "Description of the anti-pattern"
#   affectedVerticals: [chatbots, voz]
#   detectedFrom: HAT3X-NNN
#   detectedAt: YYYY-MM-DD
patterns: []
```

- [ ] **Step 2: Create the orchestrator**

```typescript
// src/learning-officer/index.ts
import { collectSignals } from "./collector.js"
import { analyzeSignals } from "./analyzer.js"
import { applyReport } from "./evolution-engine.js"
import { formatReport } from "./reporter.js"
import type { LearningSignal } from "./types.js"

export interface LearningCycleOptions {
  taskId?: string      // if set, only analyze signals for this task
  dryRun?: boolean     // if true, skip applyReport (no YAML writes, no git commit)
}

export async function runLearningCycle(
  sender: { sendEvolutionReport: (text: string) => Promise<void> },
  opts: LearningCycleOptions = {}
): Promise<string> {
  // Phase 1: Collect
  let signals: LearningSignal[] = await collectSignals()

  if (opts.taskId != null) {
    signals = signals.filter((s) => s.taskId === opts.taskId)
  }

  if (signals.length === 0) {
    const msg = "🧠 Learning Officer: no hay proyectos completados para analizar."
    await sender.sendEvolutionReport(msg)
    return msg
  }

  // Phase 2: Analyze (pure)
  const report = analyzeSignals(signals)

  // Phase 3+4: Evolve + Validate (clamping is inside applyReport)
  if (opts.dryRun !== true) {
    await applyReport(report)
  }

  // Phase 5: Report
  const text = formatReport(report)
  await sender.sendEvolutionReport(text)

  return text
}
```

- [ ] **Step 3: Read src/index.ts to find insertion point**

```bash
cd command && grep -n "program.command" src/index.ts | tail -5
```

Note the last command block, add `aprender` after it.

- [ ] **Step 4: Add CLI command to src/index.ts**

Add this import at the top of src/index.ts (with the other imports):

```typescript
import { runLearningCycle } from "./learning-officer/index.js"
```

Add this command block after the last `program.command(...)` block:

```typescript
program
  .command("aprender")
  .description("Ejecuta el ciclo de aprendizaje del Learning Officer")
  .option("--task <id>", "Analizar solo esta tarea")
  .option("--dry-run", "Simular sin escribir cambios")
  .action(async (opts: { task?: string; dryRun?: boolean }) => {
    try {
      const consoleSender = {
        sendEvolutionReport: async (text: string) => { console.log("\n" + text) },
      }
      await runLearningCycle(consoleSender, { taskId: opts.task, dryRun: opts.dryRun })
      if (opts.dryRun === true) {
        console.log("\n[DRY RUN — no changes applied]")
      }
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })
```

- [ ] **Step 5: Run full test suite**

```bash
cd command && npx vitest run
```

Expected: all tests pass (0 failed)

- [ ] **Step 6: Smoke test the command**

```bash
cd command && npx tsx src/index.ts aprender --help
cd command && npx tsx src/index.ts aprender --dry-run
```

Expected:
- `--help` prints description and `--task`, `--dry-run` options
- `--dry-run` prints "no hay proyectos completados" or a learning report, plus "[DRY RUN — no changes applied]"

- [ ] **Step 7: Commit**

```bash
git add command/src/learning-officer/index.ts \
        command/anti-patterns/registry.yaml \
        command/src/index.ts
git commit -m "feat(evolution): add LearningOfficer orchestrator + 'oficina aprender' CLI command"
```

---

## Self-Review Checklist

- [ ] **Spec coverage:** Collector (Phase 1), Analyzer (Phase 2), EvolutionEngine (Phase 3+4), Reporter (Phase 5), CLI trigger, Anti-Patterns Registry, evolution_log, evolution_proposals
- [ ] **No placeholders:** All steps include actual code blocks, exact commands, expected output
- [ ] **TDD order:** Every task has "write failing test" → "run to see it fail" → "implement" → "run to see it pass" → "commit"
- [ ] **Safety:** Score clamped to [0.0, 1.0]; all changes logged to evolution_log; proposals never auto-applied; git commit on every batch of YAML changes
- [ ] **Import paths:** All use `.js` extension for ESM compatibility
- [ ] **Scope boundary:** Sector specialization (spec §7.3) and weekly cron are NOT in this plan — those are Plan 6
