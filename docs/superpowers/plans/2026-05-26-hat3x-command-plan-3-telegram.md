# HAT3X Command — Plan 3: Telegram Bot

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Telegram bot that lets Jose control HAT3X Command from mobile — create tasks, view status, manage checkpoints with inline buttons — and receive proactive notifications when checkpoints are triggered or tasks complete.

**Architecture:** grammY bot with long-polling. Commands delegate to existing CommandCenter + Supabase. A global State Bus subscriber listens to all `bus_events` and pushes relevant events to Telegram. Checkpoints are tracked in a new `hat3x_checkpoints` table. All handler logic is extracted into pure-ish functions for easy unit testing.

**Tech Stack:** TypeScript strict, grammY, Supabase (existing), Vitest (existing), Commander.js (existing)

---

## File Structure

```
command/
  src/
    checkpoint/
      types.ts                    # HatCheckpoint interface
      factory.ts                  # createCheckpoint(), resolveCheckpoint()
    telegram/
      notifications/
        formatters.ts             # Pure: format task/checkpoint as Telegram text
        sender.ts                 # NotificationSender — proactive push via bot.api
      handlers/
        commands.ts               # handleStatus, handleNuevo, handleCheckpoints, handlePlan, handleAyuda
        callbacks.ts              # handleApproveCallback, handleRejectCallback, handleAprobarCommand, handleRechazarCommand
      bot.ts                      # createBot() — private guard + all handlers registered
      index.ts                    # startBot() — long-polling entry point
    state-bus/
      global-subscriber.ts        # NEW: subscribes to ALL bus_events, triggers Telegram
  src/database/migrations/
    002_checkpoints.sql           # hat3x_checkpoints table + realtime
  tests/
    checkpoint/
      factory.test.ts
    telegram/
      formatters.test.ts
      commands.test.ts
      callbacks.test.ts
      sender.test.ts
    state-bus/
      global-subscriber.test.ts
```

---

### Task 1: grammy dependency + env + SQL migration

**Files:**
- Modify: `command/package.json`
- Create: `command/src/database/migrations/002_checkpoints.sql`

- [ ] **Step 1: Install grammy**

```bash
cd command
npm install grammy
```

Expected: no errors, `node_modules/grammy` present.

- [ ] **Step 2: Create migration SQL**

Create `command/src/database/migrations/002_checkpoints.sql`:

```sql
CREATE TABLE IF NOT EXISTS hat3x_checkpoints (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES hat3x_tasks(id) ON DELETE CASCADE,
  after_phase INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  required_approval TEXT NOT NULL CHECK (required_approval IN ('jose', 'client', 'both')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback   TEXT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_task
  ON hat3x_checkpoints(task_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkpoints_status
  ON hat3x_checkpoints(status, triggered_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE hat3x_checkpoints;
```

- [ ] **Step 3: Apply migration to Supabase**

Paste the SQL in Supabase Dashboard → SQL Editor and run it.

Expected: table `hat3x_checkpoints` exists in Supabase with the indexes.

- [ ] **Step 4: Add env vars to .env**

Open `command/.env` and add:
```
TELEGRAM_BOT_TOKEN=<your-bot-token-from-BotFather>
TELEGRAM_JOSE_CHAT_ID=<your-personal-chat-id>
```

To get the chat ID: start a conversation with your bot and visit `https://api.telegram.org/bot<TOKEN>/getUpdates` — look for `message.chat.id`.

- [ ] **Step 5: Commit**

```bash
git add command/package.json command/package-lock.json command/src/database/migrations/002_checkpoints.sql
git commit -m "feat(telegram): install grammy and add hat3x_checkpoints migration"
```

---

### Task 2: HatCheckpoint types + factory

**Files:**
- Create: `command/src/checkpoint/types.ts`
- Create: `command/src/checkpoint/factory.ts`
- Test: `command/tests/checkpoint/factory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/checkpoint/factory.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/checkpoint/factory.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create types.ts**

Create `command/src/checkpoint/types.ts`:

```typescript
export type CheckpointStatus = "pending" | "approved" | "rejected"
export type CheckpointApproval = "jose" | "client" | "both"

export interface HatCheckpoint {
  id: string
  taskId: string
  afterPhase: number
  reason: string
  requiredApproval: CheckpointApproval
  status: CheckpointStatus
  feedback: string | null
  triggeredAt: string
  resolvedAt: string | null
}
```

- [ ] **Step 4: Create factory.ts**

Create `command/src/checkpoint/factory.ts`:

```typescript
import { getSupabaseClient } from "../database/client.js"
import type { HatCheckpoint, CheckpointApproval } from "./types.js"

interface CreateCheckpointInput {
  taskId: string
  afterPhase: number
  reason: string
  requiredApproval: CheckpointApproval
}

let _counter = 0

function nextCheckpointId(): string {
  _counter++
  return `CHK-${String(_counter).padStart(3, "0")}`
}

export async function createCheckpoint(
  input: CreateCheckpointInput
): Promise<HatCheckpoint> {
  const id = nextCheckpointId()
  const now = new Date().toISOString()

  const row = {
    id,
    task_id: input.taskId,
    after_phase: input.afterPhase,
    reason: input.reason,
    required_approval: input.requiredApproval,
    status: "pending" as const,
    feedback: null,
    triggered_at: now,
    resolved_at: null,
  }

  const { error } = await getSupabaseClient()
    .from("hat3x_checkpoints")
    .insert(row)

  if (error != null) {
    throw new Error(`Failed to create checkpoint: ${error.message}`)
  }

  return {
    id,
    taskId: input.taskId,
    afterPhase: input.afterPhase,
    reason: input.reason,
    requiredApproval: input.requiredApproval,
    status: "pending",
    feedback: null,
    triggeredAt: now,
    resolvedAt: null,
  }
}

export async function resolveCheckpoint(
  checkpointId: string,
  status: "approved" | "rejected",
  feedback: string
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("hat3x_checkpoints")
    .update({
      status,
      feedback,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", checkpointId)
    .eq("status", "pending")

  if (error != null) {
    throw new Error(`Failed to resolve checkpoint: ${error.message}`)
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd command
npx vitest run tests/checkpoint/factory.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 6: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add command/src/checkpoint/ command/tests/checkpoint/
git commit -m "feat(telegram): HatCheckpoint types and factory"
```

---

### Task 3: Message formatters (pure functions)

**Files:**
- Create: `command/src/telegram/notifications/formatters.ts`
- Test: `command/tests/telegram/formatters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/telegram/formatters.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import {
  formatTaskSummary,
  formatTaskList,
  formatPlanMessage,
  formatCheckpointAlert,
  formatCheckpointList,
} from "../../src/telegram/notifications/formatters"
import type { HatCheckpoint } from "../../src/checkpoint/types"

const MOCK_TASK_ROW = {
  id: "HAT3X-001",
  order_raw: "Chatbot para WhatsApp de clínica dental",
  status: "running",
  control_mode: "phased",
  created_at: "2026-05-26T10:00:00Z",
}

const MOCK_PLAN = {
  phases: [
    {
      phaseNumber: 1,
      subtasks: [
        { subtaskId: "sub-1", agentId: "pm-chatbots" },
        { subtaskId: "sub-2", agentId: "pm-automatizaciones" },
      ],
    },
    {
      phaseNumber: 2,
      subtasks: [{ subtaskId: "sub-3", agentId: "pm-webs-apps" }],
    },
  ],
  checkpoints: [{ afterPhase: 1, reason: "Client deliverable", requiredApproval: "both" }],
  totalEstimatedHours: 18,
  riskLevel: "medium" as const,
}

const MOCK_SUBTASKS = [
  { id: "sub-1", description: "Configurar WhatsApp Business API", vertical: "chatbots" as const, skills: [], estimatedHours: 8, dependencies: [] },
  { id: "sub-2", description: "Integrar con HubSpot CRM", vertical: "crm" as const, skills: [], estimatedHours: 4, dependencies: [] },
  { id: "sub-3", description: "Panel de administración", vertical: "webs-apps" as const, skills: [], estimatedHours: 6, dependencies: [] },
]

const MOCK_CHECKPOINT: HatCheckpoint = {
  id: "CHK-001",
  taskId: "HAT3X-001",
  afterPhase: 1,
  reason: "Entregable requiere aprobación del cliente",
  requiredApproval: "both",
  status: "pending",
  feedback: null,
  triggeredAt: "2026-05-26T12:00:00Z",
  resolvedAt: null,
}

describe("formatTaskSummary", () => {
  it("includes task id and status", () => {
    const result = formatTaskSummary(MOCK_TASK_ROW)
    expect(result).toContain("HAT3X-001")
    expect(result).toContain("running")
  })

  it("includes order description", () => {
    const result = formatTaskSummary(MOCK_TASK_ROW)
    expect(result).toContain("Chatbot para WhatsApp")
  })
})

describe("formatTaskList", () => {
  it("returns header + each task id", () => {
    const result = formatTaskList([MOCK_TASK_ROW])
    expect(result).toContain("HAT3X-001")
  })

  it("returns empty message for no tasks", () => {
    const result = formatTaskList([])
    expect(result).toContain("Sin proyectos")
  })
})

describe("formatPlanMessage", () => {
  it("shows risk level and total hours", () => {
    const result = formatPlanMessage("HAT3X-001", MOCK_PLAN, MOCK_SUBTASKS)
    expect(result).toContain("medium")
    expect(result).toContain("18h")
  })

  it("shows phase numbers", () => {
    const result = formatPlanMessage("HAT3X-001", MOCK_PLAN, MOCK_SUBTASKS)
    expect(result).toContain("Fase 1")
    expect(result).toContain("Fase 2")
  })

  it("shows checkpoint marker after phase", () => {
    const result = formatPlanMessage("HAT3X-001", MOCK_PLAN, MOCK_SUBTASKS)
    expect(result).toContain("Checkpoint")
  })

  it("returns no-plan message when plan is null", () => {
    const result = formatPlanMessage("HAT3X-001", null, [])
    expect(result).toContain("Sin plan de ejecución")
  })
})

describe("formatCheckpointAlert", () => {
  it("includes checkpoint id and reason", () => {
    const result = formatCheckpointAlert(MOCK_CHECKPOINT)
    expect(result).toContain("CHK-001")
    expect(result).toContain("Entregable requiere aprobación")
  })

  it("includes task id and phase", () => {
    const result = formatCheckpointAlert(MOCK_CHECKPOINT)
    expect(result).toContain("HAT3X-001")
    expect(result).toContain("Fase 1")
  })
})

describe("formatCheckpointList", () => {
  it("lists all pending checkpoints", () => {
    const result = formatCheckpointList([MOCK_CHECKPOINT])
    expect(result).toContain("CHK-001")
  })

  it("returns empty message when no checkpoints", () => {
    const result = formatCheckpointList([])
    expect(result).toContain("Sin checkpoints")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/telegram/formatters.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create formatters.ts**

Create `command/src/telegram/notifications/formatters.ts`:

```typescript
import type { ExecutionPlan, Subtask } from "../../types.js"
import type { HatCheckpoint } from "../../checkpoint/types.js"

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  running: "🟢",
  paused: "⏸",
  completed: "✅",
  failed: "❌",
}

const RISK_EMOJI: Record<string, string> = {
  low: "🟢",
  medium: "🟡",
  high: "🔴",
}

interface TaskRow {
  id: string
  order_raw: string
  status: string
  control_mode: string
  created_at: string
}

export function formatTaskSummary(task: TaskRow): string {
  const icon = STATUS_EMOJI[task.status] ?? "?"
  const date = new Date(task.created_at).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  return [
    `${icon} *${task.id}*`,
    `📋 ${task.order_raw}`,
    `Estado: \`${task.status}\` | Modo: \`${task.control_mode}\``,
    `Creado: ${date}`,
  ].join("\n")
}

export function formatTaskList(tasks: TaskRow[]): string {
  if (tasks.length === 0) {
    return "📭 Sin proyectos activos en HAT3X Command."
  }
  const lines = ["*HAT3X Command — Proyectos recientes:*", ""]
  for (const t of tasks) {
    const icon = STATUS_EMOJI[t.status] ?? "?"
    lines.push(`${icon} \`${t.id}\` — ${t.order_raw.slice(0, 45)}`)
  }
  return lines.join("\n")
}

export function formatPlanMessage(
  taskId: string,
  plan: ExecutionPlan | null,
  subtasks: Subtask[]
): string {
  if (plan == null) {
    return `*${taskId}* — Sin plan de ejecución (análisis pendiente).`
  }

  const subtaskMap = new Map(subtasks.map((s) => [s.id, s]))
  const riskIcon = RISK_EMOJI[plan.riskLevel] ?? "?"
  const lines = [
    `*Plan — ${taskId}*`,
    `${riskIcon} Riesgo: ${plan.riskLevel} | ⏱ ${plan.totalEstimatedHours}h estimadas`,
    `Fases: ${plan.phases.length} | Checkpoints: ${plan.checkpoints.length}`,
    "",
  ]

  for (const phase of plan.phases) {
    lines.push(`*Fase ${phase.phaseNumber}:*`)
    for (const ps of phase.subtasks) {
      const subtask = subtaskMap.get(ps.subtaskId)
      const desc = subtask?.description ?? ps.subtaskId
      lines.push(`  • [${ps.agentId}] ${desc}`)
    }
    const checkpoint = plan.checkpoints.find((c) => c.afterPhase === phase.phaseNumber)
    if (checkpoint != null) {
      lines.push(`  🚩 *Checkpoint:* ${checkpoint.reason} (${checkpoint.requiredApproval})`)
    }
    lines.push("")
  }

  return lines.join("\n").trim()
}

export function formatCheckpointAlert(checkpoint: HatCheckpoint): string {
  return [
    `🚨 *Checkpoint pendiente: ${checkpoint.id}*`,
    `Tarea: \`${checkpoint.taskId}\` — Después de Fase ${checkpoint.afterPhase}`,
    `Motivo: ${checkpoint.reason}`,
    `Aprobación requerida: \`${checkpoint.requiredApproval}\``,
    "",
    `Usa /aprobar ${checkpoint.id} o /rechazar ${checkpoint.id} <motivo>`,
  ].join("\n")
}

export function formatCheckpointList(checkpoints: HatCheckpoint[]): string {
  if (checkpoints.length === 0) {
    return "✅ Sin checkpoints pendientes."
  }
  const lines = [`*Checkpoints pendientes (${checkpoints.length}):*`, ""]
  for (const cp of checkpoints) {
    lines.push(`🚩 \`${cp.id}\` — Tarea ${cp.taskId} | Fase ${cp.afterPhase}`)
    lines.push(`   ${cp.reason}`)
    lines.push("")
  }
  return lines.join("\n").trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/telegram/formatters.test.ts
```

Expected: PASS (9 tests)

- [ ] **Step 5: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add command/src/telegram/notifications/formatters.ts command/tests/telegram/formatters.test.ts
git commit -m "feat(telegram): message formatters for tasks, plans and checkpoints"
```

---

### Task 4: Command handlers (/status, /nuevo, /checkpoints, /plan, /ayuda)

**Files:**
- Create: `command/src/telegram/handlers/commands.ts`
- Test: `command/tests/telegram/commands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/telegram/commands.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"
import { CommandCenter } from "../../src/command-center/index"

vi.mock("../../src/database/client")
vi.mock("../../src/command-center/index")

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/telegram/commands.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create commands.ts**

Create `command/src/telegram/handlers/commands.ts`:

```typescript
import { InlineKeyboard } from "grammy"
import type { Context } from "grammy"
import { getSupabaseClient } from "../../database/client.js"
import { CommandCenter } from "../../command-center/index.js"
import {
  formatTaskList,
  formatPlanMessage,
  formatCheckpointAlert,
  formatCheckpointList,
} from "../notifications/formatters.js"
import type { ExecutionPlan, Subtask } from "../../types.js"
import type { HatCheckpoint } from "../../checkpoint/types.js"

function rowToCheckpoint(row: Record<string, unknown>): HatCheckpoint {
  return {
    id: row["id"] as string,
    taskId: row["task_id"] as string,
    afterPhase: row["after_phase"] as number,
    reason: row["reason"] as string,
    requiredApproval: row["required_approval"] as HatCheckpoint["requiredApproval"],
    status: row["status"] as HatCheckpoint["status"],
    feedback: (row["feedback"] as string | null) ?? null,
    triggeredAt: row["triggered_at"] as string,
    resolvedAt: (row["resolved_at"] as string | null) ?? null,
  }
}

export async function handleStatus(ctx: Context): Promise<void> {
  const { data } = await getSupabaseClient()
    .from("hat3x_tasks")
    .select("id, order_raw, status, control_mode, created_at")
    .order("created_at", { ascending: false })
    .limit(5)

  await ctx.reply(formatTaskList(data ?? []), { parse_mode: "Markdown" })
}

export async function handleNuevo(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ""
  const orden = text.replace(/^\/nuevo\s*/i, "").trim()

  if (!orden) {
    await ctx.reply("Uso: /nuevo <descripción de la tarea>")
    return
  }

  await ctx.reply("⏳ Creando tarea...")

  const task = await new CommandCenter().processOrder({
    orderRaw: orden,
    skipAnalysis: true,
  })

  await ctx.reply(
    `✅ Tarea creada: *${task.id}*\n📋 ${task.orderRaw}\n\nUsa /plan ${task.id} para ver el plan cuando esté listo.`,
    { parse_mode: "Markdown" }
  )
}

export async function handleCheckpoints(ctx: Context): Promise<void> {
  const { data } = await getSupabaseClient()
    .from("hat3x_checkpoints")
    .select("*")
    .eq("status", "pending")
    .order("triggered_at", { ascending: true })

  const checkpoints = (data ?? []).map((row) => rowToCheckpoint(row as Record<string, unknown>))

  if (checkpoints.length === 0) {
    await ctx.reply(formatCheckpointList([]), { parse_mode: "Markdown" })
    return
  }

  for (const cp of checkpoints) {
    const keyboard = new InlineKeyboard()
      .text("✅ Aprobar", `aprobar:${cp.id}`)
      .text("❌ Rechazar", `rechazar:${cp.id}`)

    await ctx.reply(formatCheckpointAlert(cp), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  }
}

export async function handlePlan(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ""
  const taskId = text.replace(/^\/plan\s*/i, "").trim()

  if (!taskId) {
    await ctx.reply("Uso: /plan <HAT3X-NNN>")
    return
  }

  const { data, error } = await getSupabaseClient()
    .from("hat3x_tasks")
    .select("id, order_raw, status, control_mode, subtasks, execution_plan")
    .eq("id", taskId)
    .single()

  if (error != null || data == null) {
    await ctx.reply(`❌ Tarea ${taskId} no encontrada.`)
    return
  }

  const row = data as {
    id: string
    order_raw: string
    status: string
    control_mode: string
    subtasks: Subtask[] | null
    execution_plan: ExecutionPlan | null
  }

  const message = formatPlanMessage(row.id, row.execution_plan, row.subtasks ?? [])
  await ctx.reply(message, { parse_mode: "Markdown" })
}

export async function handleAyuda(ctx: Context): Promise<void> {
  const help = [
    "*HAT3X Command — Comandos disponibles:*",
    "",
    "/status — Ver últimas 5 tareas",
    "/nuevo <orden> — Crear nueva tarea",
    "/plan <id> — Ver plan de ejecución",
    "/checkpoints — Ver checkpoints pendientes",
    "/aprobar <id> [feedback] — Aprobar checkpoint",
    "/rechazar <id> <motivo> — Rechazar checkpoint",
    "/ayuda — Este mensaje",
  ].join("\n")

  await ctx.reply(help, { parse_mode: "Markdown" })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/telegram/commands.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add command/src/telegram/handlers/commands.ts command/tests/telegram/commands.test.ts
git commit -m "feat(telegram): command handlers /status /nuevo /checkpoints /plan /ayuda"
```

---

### Task 5: Approval commands + inline callbacks

**Files:**
- Create: `command/src/telegram/handlers/callbacks.ts`
- Test: `command/tests/telegram/callbacks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/telegram/callbacks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/telegram/callbacks.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create callbacks.ts**

Create `command/src/telegram/handlers/callbacks.ts`:

```typescript
import type { Context } from "grammy"
import { resolveCheckpoint } from "../../checkpoint/factory.js"

export async function handleApproveCallback(
  ctx: Context,
  checkpointId: string
): Promise<void> {
  await resolveCheckpoint(checkpointId, "approved", "Aprobado via Telegram")
  await ctx.answerCallbackQuery({ text: `✅ Checkpoint ${checkpointId} aprobado` })
  await ctx.editMessageText(`✅ *${checkpointId}* aprobado.`, { parse_mode: "Markdown" })
}

export async function handleRejectCallback(
  ctx: Context,
  checkpointId: string
): Promise<void> {
  await resolveCheckpoint(checkpointId, "rejected", "Rechazado via Telegram")
  await ctx.answerCallbackQuery({ text: `❌ Checkpoint ${checkpointId} rechazado` })
  await ctx.editMessageText(`❌ *${checkpointId}* rechazado.`, { parse_mode: "Markdown" })
}

export async function handleAprobarCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ""
  const parts = text.replace(/^\/aprobar\s*/i, "").trim().split(/\s+/)
  const checkpointId = parts[0] ?? ""
  const feedback = parts.slice(1).join(" ") || "Aprobado"

  if (!checkpointId || !checkpointId.startsWith("CHK-")) {
    await ctx.reply("Uso: /aprobar <CHK-NNN> [feedback opcional]")
    return
  }

  await resolveCheckpoint(checkpointId, "approved", feedback)
  await ctx.reply(`✅ Checkpoint *${checkpointId}* aprobado.`, { parse_mode: "Markdown" })
}

export async function handleRechazarCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ""
  const parts = text.replace(/^\/rechazar\s*/i, "").trim().split(/\s+/)
  const checkpointId = parts[0] ?? ""
  const motivo = parts.slice(1).join(" ")

  if (!checkpointId || !checkpointId.startsWith("CHK-") || !motivo) {
    await ctx.reply("Uso: /rechazar <CHK-NNN> <motivo>")
    return
  }

  await resolveCheckpoint(checkpointId, "rejected", motivo)
  await ctx.reply(`❌ Checkpoint *${checkpointId}* rechazado.`, { parse_mode: "Markdown" })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/telegram/callbacks.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add command/src/telegram/handlers/callbacks.ts command/tests/telegram/callbacks.test.ts
git commit -m "feat(telegram): /aprobar /rechazar commands and inline button callbacks"
```

---

### Task 6: Notification sender (proactive messages)

**Files:**
- Create: `command/src/telegram/notifications/sender.ts`
- Test: `command/tests/telegram/sender.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/telegram/sender.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/telegram/sender.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create sender.ts**

Create `command/src/telegram/notifications/sender.ts`:

```typescript
import { InlineKeyboard, type Bot } from "grammy"
import { formatCheckpointAlert } from "./formatters.js"
import type { HatCheckpoint } from "../../checkpoint/types.js"

export class NotificationSender {
  constructor(private readonly bot: Bot) {}

  private getChatId(): number {
    const raw = process.env["TELEGRAM_JOSE_CHAT_ID"]
    if (raw == null) throw new Error("TELEGRAM_JOSE_CHAT_ID is not set")
    return Number(raw)
  }

  async sendCheckpointAlert(checkpoint: HatCheckpoint): Promise<void> {
    const chatId = this.getChatId()
    const text = formatCheckpointAlert(checkpoint)
    const keyboard = new InlineKeyboard()
      .text("✅ Aprobar", `aprobar:${checkpoint.id}`)
      .text("❌ Rechazar", `rechazar:${checkpoint.id}`)

    await this.bot.api.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  }

  async sendTaskCompleted(taskId: string, summary: string): Promise<void> {
    const chatId = this.getChatId()
    const text = `✅ *Tarea completada: ${taskId}*\n${summary}`
    await this.bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" })
  }

  async sendAgentBlocked(
    taskId: string,
    agentId: string,
    reason: string
  ): Promise<void> {
    const chatId = this.getChatId()
    const text = [
      `⚠️ *Agente bloqueado — ${taskId}*`,
      `Agente: \`${agentId}\``,
      `Motivo: ${reason}`,
      "",
      `Revisa con /plan ${taskId}`,
    ].join("\n")
    await this.bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/telegram/sender.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add command/src/telegram/notifications/sender.ts command/tests/telegram/sender.test.ts
git commit -m "feat(telegram): NotificationSender for proactive push messages"
```

---

### Task 7: State Bus global subscriber → Telegram notifications

**Files:**
- Create: `command/src/state-bus/global-subscriber.ts`
- Test: `command/tests/state-bus/global-subscriber.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/state-bus/global-subscriber.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

const MOCK_SENDER = {
  sendCheckpointAlert: vi.fn().mockResolvedValue(undefined),
  sendTaskCompleted: vi.fn().mockResolvedValue(undefined),
  sendAgentBlocked: vi.fn().mockResolvedValue(undefined),
}

const MOCK_CHANNEL_BASE = {
  subscribe: vi.fn().mockImplementation((cb) => {
    cb("SUBSCRIBED", null)
    return MOCK_CHANNEL_BASE
  }),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createGlobalSubscriber", () => {
  it("subscribes to bus_events and resolves", async () => {
    const MOCK_ON = vi.fn().mockReturnThis()
    vi.mocked(getSupabaseClient).mockReturnValue({
      channel: vi.fn().mockReturnValue({ on: MOCK_ON, ...MOCK_CHANNEL_BASE }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()

    expect(MOCK_ON).toHaveBeenCalledOnce()
  })

  it("calls sendCheckpointAlert when checkpoint.triggered event received", async () => {
    const MOCK_CHECKPOINT_ROW = {
      id: "CHK-001",
      task_id: "HAT3X-001",
      after_phase: 1,
      reason: "Test",
      required_approval: "jose",
      status: "pending",
      feedback: null,
      triggered_at: new Date().toISOString(),
      resolved_at: null,
    }

    vi.mocked(getSupabaseClient).mockReturnValue({
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((_type, _opts, handler) => {
          void Promise.resolve().then(() =>
            handler({
              new: {
                task_id: "HAT3X-001",
                event_type: "checkpoint.triggered",
                agent_id: null,
                payload: { checkpoint: MOCK_CHECKPOINT_ROW },
              },
            })
          )
          return { subscribe: vi.fn().mockImplementation((cb) => { cb("SUBSCRIBED", null) }) }
        }),
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()
    await new Promise((r) => setTimeout(r, 20))

    expect(MOCK_SENDER.sendCheckpointAlert).toHaveBeenCalledOnce()
  })

  it("calls sendTaskCompleted when task.completed event received", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation((_type, _opts, handler) => {
          void Promise.resolve().then(() =>
            handler({
              new: {
                task_id: "HAT3X-001",
                event_type: "task.completed",
                agent_id: "pm-chatbots",
                payload: { summary: "Chatbot entregado" },
              },
            })
          )
          return { subscribe: vi.fn().mockImplementation((cb) => { cb("SUBSCRIBED", null) }) }
        }),
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()
    await new Promise((r) => setTimeout(r, 20))

    expect(MOCK_SENDER.sendTaskCompleted).toHaveBeenCalledWith("HAT3X-001", "Chatbot entregado")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/state-bus/global-subscriber.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create global-subscriber.ts**

Create `command/src/state-bus/global-subscriber.ts`:

```typescript
import { getSupabaseClient } from "../database/client.js"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { NotificationSender } from "../telegram/notifications/sender.js"
import type { HatCheckpoint } from "../checkpoint/types.js"

export interface GlobalSubscriber {
  subscribe(): Promise<void>
  unsubscribe(): Promise<void>
}

export function createGlobalSubscriber(sender: NotificationSender): GlobalSubscriber {
  const client = getSupabaseClient()
  let channel: RealtimeChannel | null = null

  async function handleEvent(row: Record<string, unknown>): Promise<void> {
    const eventType = row["event_type"] as string
    const taskId = row["task_id"] as string
    const payload = row["payload"] as Record<string, unknown>

    if (eventType === "checkpoint.triggered") {
      const cpRow = payload["checkpoint"] as Record<string, unknown> | undefined
      if (cpRow == null) return
      const checkpoint: HatCheckpoint = {
        id: cpRow["id"] as string,
        taskId: cpRow["task_id"] as string,
        afterPhase: cpRow["after_phase"] as number,
        reason: cpRow["reason"] as string,
        requiredApproval: cpRow["required_approval"] as HatCheckpoint["requiredApproval"],
        status: "pending",
        feedback: null,
        triggeredAt: cpRow["triggered_at"] as string,
        resolvedAt: null,
      }
      await sender.sendCheckpointAlert(checkpoint)
      return
    }

    if (eventType === "task.completed") {
      const summary = (payload["summary"] as string | undefined) ?? "Tarea completada."
      await sender.sendTaskCompleted(taskId, summary)
      return
    }

    if (eventType === "task.blocked") {
      const agentId = (row["agent_id"] as string | null) ?? "unknown"
      const reason = (payload["reason"] as string | undefined) ?? "Razón desconocida"
      await sender.sendAgentBlocked(taskId, agentId, reason)
    }
  }

  return {
    async subscribe() {
      await new Promise<void>((resolve, reject) => {
        channel = client
          .channel("global-bus-telegram")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "bus_events" },
            (payload) => {
              void handleEvent(payload.new as Record<string, unknown>)
            }
          )
          .subscribe((status, err) => {
            if (status === "SUBSCRIBED") {
              resolve()
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              reject(
                new Error(
                  `Global subscriber failed: ${status}${err ? ` — ${String(err)}` : ""}`
                )
              )
            }
          })
      })
    },

    async unsubscribe() {
      if (channel != null) {
        await client.removeChannel(channel)
        channel = null
      }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/state-bus/global-subscriber.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add command/src/state-bus/global-subscriber.ts command/tests/state-bus/global-subscriber.test.ts
git commit -m "feat(telegram): global state bus subscriber → Telegram notifications"
```

---

### Task 8: Bot assembly + start script

**Files:**
- Create: `command/src/telegram/bot.ts`
- Create: `command/src/telegram/index.ts`
- Modify: `command/package.json`

No unit tests — bot.ts is pure wiring; it's verified by the manual smoke test in Step 5.

- [ ] **Step 1: Create bot.ts**

Create `command/src/telegram/bot.ts`:

```typescript
import { Bot } from "grammy"
import {
  handleStatus,
  handleNuevo,
  handleCheckpoints,
  handlePlan,
  handleAyuda,
} from "./handlers/commands.js"
import {
  handleApproveCallback,
  handleRejectCallback,
  handleAprobarCommand,
  handleRechazarCommand,
} from "./handlers/callbacks.js"
import { NotificationSender } from "./notifications/sender.js"
import { createGlobalSubscriber } from "../state-bus/global-subscriber.js"

export function createBot(): Bot {
  const token = process.env["TELEGRAM_BOT_TOKEN"]
  if (token == null) throw new Error("TELEGRAM_BOT_TOKEN is not set")

  const JOSE_CHAT_ID = Number(process.env["TELEGRAM_JOSE_CHAT_ID"])
  if (isNaN(JOSE_CHAT_ID)) throw new Error("TELEGRAM_JOSE_CHAT_ID is not set or not a number")

  const bot = new Bot(token)

  // Private guard — only Jose can use this bot
  bot.use(async (ctx, next) => {
    if (ctx.chat?.id !== JOSE_CHAT_ID) {
      await ctx.reply("⛔ Bot privado de HAT3X.")
      return
    }
    await next()
  })

  bot.command("start", handleAyuda)
  bot.command("ayuda", handleAyuda)
  bot.command("status", handleStatus)
  bot.command("nuevo", handleNuevo)
  bot.command("checkpoints", handleCheckpoints)
  bot.command("plan", handlePlan)
  bot.command("aprobar", handleAprobarCommand)
  bot.command("rechazar", handleRechazarCommand)

  bot.callbackQuery(/^aprobar:/, async (ctx) => {
    const checkpointId = ctx.callbackQuery.data.replace("aprobar:", "")
    await handleApproveCallback(ctx, checkpointId)
  })

  bot.callbackQuery(/^rechazar:/, async (ctx) => {
    const checkpointId = ctx.callbackQuery.data.replace("rechazar:", "")
    await handleRejectCallback(ctx, checkpointId)
  })

  return bot
}

export function createNotificationSender(bot: Bot): NotificationSender {
  return new NotificationSender(bot)
}

export function startGlobalSubscriber(bot: Bot): ReturnType<typeof createGlobalSubscriber> {
  const sender = createNotificationSender(bot)
  return createGlobalSubscriber(sender)
}
```

- [ ] **Step 2: Create index.ts**

Create `command/src/telegram/index.ts`:

```typescript
import { config } from "dotenv"
config({ path: ".env" })

import { createBot, startGlobalSubscriber } from "./bot.js"

async function startBot(): Promise<void> {
  const bot = createBot()
  const globalSub = startGlobalSubscriber(bot)

  await globalSub.subscribe()
  console.log("HAT3X Command — Global subscriber activo")

  process.once("SIGINT", async () => {
    console.log("Parando bot...")
    await globalSub.unsubscribe()
    await bot.stop()
  })
  process.once("SIGTERM", async () => {
    await globalSub.unsubscribe()
    await bot.stop()
  })

  console.log("HAT3X Command Bot — Iniciando...")
  await bot.start({
    onStart: () => console.log("✅ Bot activo. Envía /ayuda en Telegram."),
  })
}

void startBot().catch((err) => {
  console.error("Bot error:", err)
  process.exit(1)
})
```

- [ ] **Step 3: Add telegram script to package.json**

Open `command/package.json`. Replace the `scripts` block with:

```json
"scripts": {
  "dev": "tsx src/index.ts",
  "build": "tsc",
  "test": "vitest run",
  "test:watch": "vitest",
  "cli": "tsx src/index.ts",
  "telegram": "tsx src/telegram/index.ts"
}
```

- [ ] **Step 4: Run full test suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Manual smoke test**

```bash
cd command
npm run telegram
```

Expected output:
```
HAT3X Command — Global subscriber activo
HAT3X Command Bot — Iniciando...
✅ Bot activo. Envía /ayuda en Telegram.
```

Open Telegram, send `/ayuda` to the bot. Expected: help message listing all commands.
Send `/status`. Expected: task list or "Sin proyectos".
Press Ctrl+C. Expected: graceful shutdown.

- [ ] **Step 6: Commit**

```bash
git add command/src/telegram/bot.ts command/src/telegram/index.ts command/package.json
git commit -m "feat(telegram): bot assembly — private guard, commands, callbacks, global subscriber"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| Bot privado para Jose únicamente | Task 8 (private guard middleware) |
| /status — lista tareas recientes | Task 4 |
| /nuevo <orden> — crear tarea | Task 4 |
| /plan <id> — ver plan de ejecución | Task 4 |
| /checkpoints — ver pendientes con botones | Task 4 |
| /ayuda | Task 4 |
| /aprobar <id> [feedback] | Task 5 |
| /rechazar <id> <motivo> | Task 5 |
| Botones inline ✅ Aprobar / ❌ Rechazar | Task 5 |
| Notificación proactiva checkpoint.triggered | Tasks 6 + 7 |
| Notificación proactiva task.completed | Tasks 6 + 7 |
| Notificación agente bloqueado (task.blocked) | Tasks 6 + 7 |
| hat3x_checkpoints tabla en Supabase | Task 1 |
| createCheckpoint() / resolveCheckpoint() | Task 2 |
| Formatters puros Telegram-Markdown | Task 3 |
| Long-polling entry point (`npm run telegram`) | Task 8 |

### Type Consistency

- `HatCheckpoint` defined in Task 2 (`checkpoint/types.ts`), used in Tasks 3, 4, 5, 6, 7 ✓
- `CheckpointApproval` / `CheckpointStatus` defined in Task 2, used in Task 2 factory ✓
- `createCheckpoint()` / `resolveCheckpoint()` defined in Task 2, called in Tasks 4, 5 ✓
- `NotificationSender` defined in Task 6 (`sender.ts`), injected in Tasks 7, 8 ✓
- `formatCheckpointAlert()` defined in Task 3, called in Tasks 4, 6 ✓
- `createGlobalSubscriber(sender)` defined in Task 7, wired in Task 8 (`bot.ts`) ✓
- `rowToCheckpoint()` helper defined and used inside Task 4 `commands.ts` ✓

All spec requirements covered. ✓
