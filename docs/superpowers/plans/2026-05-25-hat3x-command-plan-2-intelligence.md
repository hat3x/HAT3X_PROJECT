# HAT3X Command — Plan 2: Intelligence Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Intelligence Layer that analyzes incoming orders using Claude Haiku, matches them to HAT3X capabilities via YAML Capability Map, plans multi-step execution, and assesses risk by injecting human checkpoints.

**Architecture:** Five sequential components — TaskAnalyzer (LLM decomposition) → CapabilityMatcher (YAML scoring) → ExecutionPlanner (topological sort) → RiskAssessor (checkpoint injection) — orchestrated by an IntelligenceLayer façade that CommandCenter calls after task creation. All LLM calls are mocked in tests; real calls only happen in integration test (Task 9).

**Tech Stack:** TypeScript strict, `@anthropic-ai/sdk`, `js-yaml`, Zod, Vitest, Supabase (existing), Commander.js (existing)

---

## File Structure

```
command/
  src/
    intelligence/
      capability-map/
        loader.ts          # YAML loader → in-memory map
        types.ts           # CapabilityEntry, CapabilityMap types
      task-analyzer.ts     # Claude Haiku → Subtask[]
      capability-matcher.ts # Subtask[] → AgentSelection[]
      execution-planner.ts # AgentSelection[] → ExecutionPlan
      risk-assessor.ts     # ExecutionPlan → ExecutionPlan (with checkpoints)
      index.ts             # IntelligenceLayer orchestrator
    command-center/
      index.ts             # MODIFIED: call IntelligenceLayer after createTask
    cli/
      commands/
        plan.ts            # NEW: `oficina plan <id>` command
    types.ts               # MODIFIED: concrete Subtask, ExecutionPlan, etc.
  capability-map/          # YAML files (12 files)
    chatbots.yaml
    voz.yaml
    webs-apps.yaml
    automatizaciones.yaml
    crm.yaml
    calendar.yaml
    database.yaml
    github.yaml
    testing.yaml
    security.yaml
    documentation.yaml
    deployment.yaml
  tests/
    intelligence/
      task-analyzer.test.ts
      capability-matcher.test.ts
      execution-planner.test.ts
      risk-assessor.test.ts
      capability-map/
        loader.test.ts
      integration/
        intelligence-layer.test.ts
    cli/
      plan.test.ts
```

---

### Task 1: Dependencies + Extended Types

**Files:**
- Modify: `command/package.json`
- Modify: `command/src/types.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd command
npm install @anthropic-ai/sdk js-yaml
npm install --save-dev @types/js-yaml
```

Expected: no errors, `node_modules/@anthropic-ai` and `node_modules/js-yaml` present.

- [ ] **Step 2: Write the failing type-level test**

Create `command/tests/intelligence/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from "vitest"
import type {
  Subtask,
  AgentSelection,
  Checkpoint,
  Phase,
  PhaseSubtask,
  ExecutionPlan,
  HatTask,
} from "../../src/types"

describe("Intelligence Layer types", () => {
  it("Subtask has required fields", () => {
    expectTypeOf<Subtask>().toHaveProperty("id")
    expectTypeOf<Subtask>().toHaveProperty("description")
    expectTypeOf<Subtask>().toHaveProperty("vertical")
    expectTypeOf<Subtask>().toHaveProperty("skills")
    expectTypeOf<Subtask>().toHaveProperty("estimatedHours")
    expectTypeOf<Subtask>().toHaveProperty("dependencies")
  })

  it("AgentSelection has required fields", () => {
    expectTypeOf<AgentSelection>().toHaveProperty("subtaskId")
    expectTypeOf<AgentSelection>().toHaveProperty("agentId")
    expectTypeOf<AgentSelection>().toHaveProperty("score")
    expectTypeOf<AgentSelection>().toHaveProperty("rationale")
  })

  it("ExecutionPlan has phases and checkpoints", () => {
    expectTypeOf<ExecutionPlan>().toHaveProperty("phases")
    expectTypeOf<ExecutionPlan>().toHaveProperty("checkpoints")
    expectTypeOf<ExecutionPlan>().toHaveProperty("totalEstimatedHours")
    expectTypeOf<ExecutionPlan>().toHaveProperty("riskLevel")
  })

  it("HatTask.subtasks is Subtask[]", () => {
    expectTypeOf<HatTask["subtasks"]>().toEqualTypeOf<Subtask[]>()
  })

  it("HatTask.executionPlan is ExecutionPlan | null", () => {
    expectTypeOf<HatTask["executionPlan"]>().toEqualTypeOf<ExecutionPlan | null>()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd command
npx vitest run tests/intelligence/types.test.ts
```

Expected: FAIL — types not exported from `src/types.ts`

- [ ] **Step 4: Extend `src/types.ts` with Intelligence Layer types**

Open `command/src/types.ts` and add after the existing types:

```typescript
export type Vertical =
  | "chatbots"
  | "voz"
  | "webs-apps"
  | "automatizaciones"
  | "crm"
  | "calendar"
  | "database"
  | "github"
  | "testing"
  | "security"
  | "documentation"
  | "deployment"

export interface Subtask {
  id: string
  description: string
  vertical: Vertical
  skills: string[]
  estimatedHours: number
  dependencies: string[]
}

export interface AgentSelection {
  subtaskId: string
  agentId: string
  score: number
  rationale: string
}

export interface Checkpoint {
  afterPhase: number
  reason: string
  requiredApproval: "jose" | "client" | "both"
}

export interface PhaseSubtask {
  subtaskId: string
  agentId: string
}

export interface Phase {
  phaseNumber: number
  subtasks: PhaseSubtask[]
}

export type RiskLevel = "low" | "medium" | "high"

export interface ExecutionPlan {
  phases: Phase[]
  checkpoints: Checkpoint[]
  totalEstimatedHours: number
  riskLevel: RiskLevel
}
```

Then update the `HatTask` interface so `subtasks` and `executionPlan` are concrete:

```typescript
export interface HatTask {
  id: string
  clientId: string | null
  order: string
  status: TaskStatus
  controlMode: ControlMode
  subtasks: Subtask[]
  executionPlan: ExecutionPlan | null
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd command
npx vitest run tests/intelligence/types.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: Run full test suite to verify no regressions**

```bash
cd command
npx vitest run
```

Expected: all existing tests pass (subtasks/executionPlan were `unknown` before, runtime tests used type assertions, so they still pass).

- [ ] **Step 7: Commit**

```bash
git add command/package.json command/package-lock.json command/src/types.ts command/tests/intelligence/types.test.ts
git commit -m "feat(intelligence): add dependencies and extend types for Intelligence Layer"
```

---

### Task 2: Capability Map YAMLs + Loader

**Files:**
- Create: `command/capability-map/chatbots.yaml` (and 11 others)
- Create: `command/src/intelligence/capability-map/types.ts`
- Create: `command/src/intelligence/capability-map/loader.ts`
- Test: `command/tests/intelligence/capability-map/loader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/intelligence/capability-map/loader.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest"
import { loadCapabilityMap } from "../../../src/intelligence/capability-map/loader"
import type { CapabilityMap } from "../../../src/intelligence/capability-map/types"

let map: CapabilityMap

beforeAll(async () => {
  map = await loadCapabilityMap()
})

describe("loadCapabilityMap", () => {
  it("loads all 12 verticals", () => {
    const verticals = Object.keys(map)
    expect(verticals).toHaveLength(12)
  })

  it("each vertical has at least 3 skills", () => {
    for (const [vertical, entry] of Object.entries(map)) {
      expect(entry.skills.length).toBeGreaterThanOrEqual(3), `${vertical} has too few skills`
    }
  })

  it("chatbots vertical has expected skills", () => {
    expect(map["chatbots"]).toBeDefined()
    expect(map["chatbots"]!.skills).toContain("rag-chatbots")
    expect(map["chatbots"]!.skills).toContain("whatsapp-business")
  })

  it("each entry has agentId and maxParallelSubtasks", () => {
    for (const [vertical, entry] of Object.entries(map)) {
      expect(typeof entry.agentId).toBe("string"), `${vertical}.agentId missing`
      expect(typeof entry.maxParallelSubtasks).toBe("number"), `${vertical}.maxParallelSubtasks missing`
    }
  })

  it("returns same instance on second call (cached)", async () => {
    const map2 = await loadCapabilityMap()
    expect(map2).toBe(map)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/intelligence/capability-map/loader.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create CapabilityMap types**

Create `command/src/intelligence/capability-map/types.ts`:

```typescript
import type { Vertical } from "../../types"

export interface CapabilityEntry {
  vertical: Vertical
  agentId: string
  skills: string[]
  maxParallelSubtasks: number
  typicalHoursPerSubtask: number
  requiresClientApproval: boolean
}

export type CapabilityMap = Record<Vertical, CapabilityEntry>
```

- [ ] **Step 4: Create the 12 YAML files**

Create `command/capability-map/chatbots.yaml`:
```yaml
vertical: chatbots
agentId: pm-chatbots
skills:
  - rag-chatbots
  - whatsapp-business
  - voice-prompt-engineering
  - integrations/crm
  - integrations/database
maxParallelSubtasks: 3
typicalHoursPerSubtask: 8
requiresClientApproval: true
```

Create `command/capability-map/voz.yaml`:
```yaml
vertical: voz
agentId: pm-voz
skills:
  - retell-ai
  - elevenlabs
  - voice-prompt-engineering
  - integrations/calendar
  - integrations/crm
maxParallelSubtasks: 2
typicalHoursPerSubtask: 10
requiresClientApproval: true
```

Create `command/capability-map/webs-apps.yaml`:
```yaml
vertical: webs-apps
agentId: pm-webs-apps
skills:
  - nextjs-shadcn
  - react-query-patterns
  - typescript-strict
  - supabase-rls
  - performance-web
  - accessibility-wcag
  - ui-ux-patterns
  - pwa-capacitor
  - deploy-vercel
  - testing-vitest
maxParallelSubtasks: 4
typicalHoursPerSubtask: 6
requiresClientApproval: true
```

Create `command/capability-map/automatizaciones.yaml`:
```yaml
vertical: automatizaciones
agentId: pm-automatizaciones
skills:
  - n8n-advanced
  - integrations/crm
  - integrations/calendar
  - integrations/database
  - api-design
maxParallelSubtasks: 3
typicalHoursPerSubtask: 5
requiresClientApproval: false
```

Create `command/capability-map/crm.yaml`:
```yaml
vertical: crm
agentId: pm-automatizaciones
skills:
  - integrations/crm
  - integrations/database
  - api-design
maxParallelSubtasks: 2
typicalHoursPerSubtask: 4
requiresClientApproval: false
```

Create `command/capability-map/calendar.yaml`:
```yaml
vertical: calendar
agentId: pm-automatizaciones
skills:
  - integrations/calendar
  - integrations/crm
  - n8n-advanced
maxParallelSubtasks: 2
typicalHoursPerSubtask: 3
requiresClientApproval: false
```

Create `command/capability-map/database.yaml`:
```yaml
vertical: database
agentId: pm-webs-apps
skills:
  - supabase-rls
  - integrations/database
  - api-design
maxParallelSubtasks: 2
typicalHoursPerSubtask: 4
requiresClientApproval: false
```

Create `command/capability-map/github.yaml`:
```yaml
vertical: github
agentId: pm-webs-apps
skills:
  - github
  - testing-qa
  - agile-workflow
maxParallelSubtasks: 2
typicalHoursPerSubtask: 3
requiresClientApproval: false
```

Create `command/capability-map/testing.yaml`:
```yaml
vertical: testing
agentId: pm-webs-apps
skills:
  - testing-qa
  - testing-vitest
  - code-review
maxParallelSubtasks: 3
typicalHoursPerSubtask: 4
requiresClientApproval: false
```

Create `command/capability-map/security.yaml`:
```yaml
vertical: security
agentId: pm-webs-apps
skills:
  - security-audit
  - code-review
  - api-design
maxParallelSubtasks: 2
typicalHoursPerSubtask: 5
requiresClientApproval: true
```

Create `command/capability-map/documentation.yaml`:
```yaml
vertical: documentation
agentId: pm-webs-apps
skills:
  - documentation
  - api-design
  - agile-workflow
maxParallelSubtasks: 3
typicalHoursPerSubtask: 3
requiresClientApproval: false
```

Create `command/capability-map/deployment.yaml`:
```yaml
vertical: deployment
agentId: pm-webs-apps
skills:
  - deploy-vercel
  - github
  - testing-vitest
maxParallelSubtasks: 2
typicalHoursPerSubtask: 3
requiresClientApproval: false
```

- [ ] **Step 5: Create the loader**

Create `command/src/intelligence/capability-map/loader.ts`:

```typescript
import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"
import type { CapabilityMap, CapabilityEntry } from "./types"
import type { Vertical } from "../../types"

const VERTICALS: Vertical[] = [
  "chatbots", "voz", "webs-apps", "automatizaciones",
  "crm", "calendar", "database", "github",
  "testing", "security", "documentation", "deployment",
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAP_DIR = join(__dirname, "../../../../capability-map")

let _cache: CapabilityMap | null = null

export async function loadCapabilityMap(): Promise<CapabilityMap> {
  if (_cache != null) return _cache

  const entries = await Promise.all(
    VERTICALS.map(async (vertical) => {
      const content = await readFile(join(MAP_DIR, `${vertical}.yaml`), "utf-8")
      const entry = yaml.load(content) as CapabilityEntry
      return [vertical, entry] as const
    })
  )

  _cache = Object.fromEntries(entries) as CapabilityMap
  return _cache
}

export function resetCapabilityMapCache(): void {
  _cache = null
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd command
npx vitest run tests/intelligence/capability-map/loader.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 7: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add command/capability-map/ command/src/intelligence/capability-map/ command/tests/intelligence/capability-map/
git commit -m "feat(intelligence): capability map YAMLs and loader"
```

---

### Task 3: Task Analyzer (LLM decomposition)

**Files:**
- Create: `command/src/intelligence/task-analyzer.ts`
- Test: `command/tests/intelligence/task-analyzer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/intelligence/task-analyzer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { analyzeTask } from "../../src/intelligence/task-analyzer"
import type { Subtask } from "../../src/types"

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn(),
    }
  },
}))

const MOCK_SUBTASKS: Subtask[] = [
  {
    id: "sub-1",
    description: "Set up WhatsApp Business API integration",
    vertical: "chatbots",
    skills: ["whatsapp-business", "integrations/crm"],
    estimatedHours: 8,
    dependencies: [],
  },
  {
    id: "sub-2",
    description: "Create HubSpot CRM pipeline for new contacts",
    vertical: "crm",
    skills: ["integrations/crm"],
    estimatedHours: 4,
    dependencies: ["sub-1"],
  },
]

describe("analyzeTask", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns subtasks from LLM response", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const instance = new Anthropic()
    vi.mocked(instance.messages.create).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(MOCK_SUBTASKS) }],
    } as any)

    // Patch the module-level client
    const mod = await import("../../src/intelligence/task-analyzer")
    vi.spyOn(mod, "analyzeTask").mockResolvedValue(MOCK_SUBTASKS)

    const result = await mod.analyzeTask("Integra WhatsApp con HubSpot", null)

    expect(result).toHaveLength(2)
    expect(result[0]!.vertical).toBe("chatbots")
    expect(result[1]!.vertical).toBe("crm")
  })

  it("each subtask has all required fields", async () => {
    const mod = await import("../../src/intelligence/task-analyzer")
    vi.spyOn(mod, "analyzeTask").mockResolvedValue(MOCK_SUBTASKS)

    const result = await mod.analyzeTask("any order", null)

    for (const subtask of result) {
      expect(typeof subtask.id).toBe("string")
      expect(typeof subtask.description).toBe("string")
      expect(typeof subtask.vertical).toBe("string")
      expect(Array.isArray(subtask.skills)).toBe(true)
      expect(typeof subtask.estimatedHours).toBe("number")
      expect(Array.isArray(subtask.dependencies)).toBe(true)
    }
  })

  it("throws if LLM returns malformed JSON", async () => {
    const mod = await import("../../src/intelligence/task-analyzer")
    vi.spyOn(mod, "analyzeTask").mockRejectedValue(
      new Error("Invalid LLM response: expected array of subtasks")
    )

    await expect(mod.analyzeTask("any order", null)).rejects.toThrow(
      "Invalid LLM response"
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/intelligence/task-analyzer.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create task-analyzer.ts**

Create `command/src/intelligence/task-analyzer.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import type { Subtask, ClientMemory } from "../types"

const SubtaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  vertical: z.enum([
    "chatbots", "voz", "webs-apps", "automatizaciones",
    "crm", "calendar", "database", "github",
    "testing", "security", "documentation", "deployment",
  ]),
  skills: z.array(z.string()),
  estimatedHours: z.number().positive(),
  dependencies: z.array(z.string()),
})

const SubtasksSchema = z.array(SubtaskSchema)

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an expert project analyzer for HAT3X, an AI consulting agency.
Given an incoming order, decompose it into concrete subtasks.

Each subtask must belong to ONE vertical from this list:
chatbots, voz, webs-apps, automatizaciones, crm, calendar, database, github, testing, security, documentation, deployment

Return ONLY a valid JSON array of subtasks — no markdown, no explanation. Format:
[
  {
    "id": "sub-1",
    "description": "specific actionable task description",
    "vertical": "one of the verticals above",
    "skills": ["skill-name-1", "skill-name-2"],
    "estimatedHours": 8,
    "dependencies": []
  }
]

Rules:
- id must be unique: sub-1, sub-2, sub-3...
- dependencies is an array of other subtask ids that must complete first
- estimatedHours is a realistic estimate (1-40)
- skills come from HAT3X's skill catalog`

export async function analyzeTask(
  order: string,
  clientMemory: ClientMemory | null
): Promise<Subtask[]> {
  const contextNote = clientMemory != null
    ? `\n\nClient context: ${clientMemory.clientName}, sector: ${clientMemory.sector}, previous projects: ${clientMemory.previousProjects.join(", ")}`
    : ""

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Order: ${order}${contextNote}`,
      },
    ],
  })

  const textBlock = message.content.find((b) => b.type === "text")
  if (textBlock == null || textBlock.type !== "text") {
    throw new Error("Invalid LLM response: no text content")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    throw new Error("Invalid LLM response: not valid JSON")
  }

  const result = SubtasksSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid LLM response: expected array of subtasks — ${result.error.message}`)
  }

  return result.data
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/intelligence/task-analyzer.test.ts
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
git add command/src/intelligence/task-analyzer.ts command/tests/intelligence/task-analyzer.test.ts
git commit -m "feat(intelligence): task analyzer with Claude Haiku and Zod validation"
```

---

### Task 4: Capability Matcher

**Files:**
- Create: `command/src/intelligence/capability-matcher.ts`
- Test: `command/tests/intelligence/capability-matcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/intelligence/capability-matcher.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { matchCapabilities } from "../../src/intelligence/capability-matcher"
import type { Subtask, AgentSelection } from "../../src/types"
import type { CapabilityMap } from "../../src/intelligence/capability-map/types"

const MOCK_MAP: CapabilityMap = {
  chatbots: {
    vertical: "chatbots",
    agentId: "pm-chatbots",
    skills: ["rag-chatbots", "whatsapp-business", "voice-prompt-engineering"],
    maxParallelSubtasks: 3,
    typicalHoursPerSubtask: 8,
    requiresClientApproval: true,
  },
  crm: {
    vertical: "crm",
    agentId: "pm-automatizaciones",
    skills: ["integrations/crm", "integrations/database", "api-design"],
    maxParallelSubtasks: 2,
    typicalHoursPerSubtask: 4,
    requiresClientApproval: false,
  },
  // fill remaining verticals with minimal entries
  voz: { vertical: "voz", agentId: "pm-voz", skills: ["retell-ai"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 10, requiresClientApproval: true },
  "webs-apps": { vertical: "webs-apps", agentId: "pm-webs-apps", skills: ["nextjs-shadcn"], maxParallelSubtasks: 4, typicalHoursPerSubtask: 6, requiresClientApproval: true },
  automatizaciones: { vertical: "automatizaciones", agentId: "pm-automatizaciones", skills: ["n8n-advanced"], maxParallelSubtasks: 3, typicalHoursPerSubtask: 5, requiresClientApproval: false },
  calendar: { vertical: "calendar", agentId: "pm-automatizaciones", skills: ["integrations/calendar"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 3, requiresClientApproval: false },
  database: { vertical: "database", agentId: "pm-webs-apps", skills: ["supabase-rls"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 4, requiresClientApproval: false },
  github: { vertical: "github", agentId: "pm-webs-apps", skills: ["github"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 3, requiresClientApproval: false },
  testing: { vertical: "testing", agentId: "pm-webs-apps", skills: ["testing-qa"], maxParallelSubtasks: 3, typicalHoursPerSubtask: 4, requiresClientApproval: false },
  security: { vertical: "security", agentId: "pm-webs-apps", skills: ["security-audit"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 5, requiresClientApproval: true },
  documentation: { vertical: "documentation", agentId: "pm-webs-apps", skills: ["documentation"], maxParallelSubtasks: 3, typicalHoursPerSubtask: 3, requiresClientApproval: false },
  deployment: { vertical: "deployment", agentId: "pm-webs-apps", skills: ["deploy-vercel"], maxParallelSubtasks: 2, typicalHoursPerSubtask: 3, requiresClientApproval: false },
} as CapabilityMap

const MOCK_SUBTASKS: Subtask[] = [
  {
    id: "sub-1",
    description: "Set up WhatsApp Business API",
    vertical: "chatbots",
    skills: ["whatsapp-business"],
    estimatedHours: 8,
    dependencies: [],
  },
  {
    id: "sub-2",
    description: "Create CRM pipeline",
    vertical: "crm",
    skills: ["integrations/crm"],
    estimatedHours: 4,
    dependencies: ["sub-1"],
  },
]

describe("matchCapabilities", () => {
  it("returns one AgentSelection per subtask", () => {
    const result = matchCapabilities(MOCK_SUBTASKS, MOCK_MAP)
    expect(result).toHaveLength(2)
  })

  it("assigns correct agentId from capability map", () => {
    const result = matchCapabilities(MOCK_SUBTASKS, MOCK_MAP)
    const chatbot = result.find((r) => r.subtaskId === "sub-1")
    expect(chatbot?.agentId).toBe("pm-chatbots")

    const crm = result.find((r) => r.subtaskId === "sub-2")
    expect(crm?.agentId).toBe("pm-automatizaciones")
  })

  it("score is higher when skills match", () => {
    const result = matchCapabilities(MOCK_SUBTASKS, MOCK_MAP)
    for (const selection of result) {
      expect(selection.score).toBeGreaterThan(0)
      expect(selection.score).toBeLessThanOrEqual(1)
    }
  })

  it("provides rationale for each selection", () => {
    const result = matchCapabilities(MOCK_SUBTASKS, MOCK_MAP)
    for (const selection of result) {
      expect(typeof selection.rationale).toBe("string")
      expect(selection.rationale.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/intelligence/capability-matcher.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create capability-matcher.ts**

Create `command/src/intelligence/capability-matcher.ts`:

```typescript
import type { Subtask, AgentSelection } from "../types"
import type { CapabilityMap } from "./capability-map/types"

export function matchCapabilities(
  subtasks: Subtask[],
  map: CapabilityMap
): AgentSelection[] {
  return subtasks.map((subtask) => {
    const entry = map[subtask.vertical]
    if (entry == null) {
      throw new Error(`No capability entry for vertical: ${subtask.vertical}`)
    }

    const matchingSkills = subtask.skills.filter((s) => entry.skills.includes(s))
    const score = subtask.skills.length === 0
      ? 0.5
      : matchingSkills.length / subtask.skills.length

    const rationale =
      matchingSkills.length > 0
        ? `${entry.agentId} covers ${matchingSkills.join(", ")} (${Math.round(score * 100)}% skill match)`
        : `${entry.agentId} is the designated agent for ${subtask.vertical}`

    return {
      subtaskId: subtask.id,
      agentId: entry.agentId,
      score,
      rationale,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/intelligence/capability-matcher.test.ts
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
git add command/src/intelligence/capability-matcher.ts command/tests/intelligence/capability-matcher.test.ts
git commit -m "feat(intelligence): capability matcher with skill-overlap scoring"
```

---

### Task 5: Execution Planner (topological sort)

**Files:**
- Create: `command/src/intelligence/execution-planner.ts`
- Test: `command/tests/intelligence/execution-planner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/intelligence/execution-planner.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { planExecution } from "../../src/intelligence/execution-planner"
import type { Subtask, AgentSelection, ExecutionPlan } from "../../src/types"

const SUBTASKS: Subtask[] = [
  { id: "sub-1", description: "A", vertical: "chatbots", skills: [], estimatedHours: 8, dependencies: [] },
  { id: "sub-2", description: "B", vertical: "crm", skills: [], estimatedHours: 4, dependencies: ["sub-1"] },
  { id: "sub-3", description: "C", vertical: "webs-apps", skills: [], estimatedHours: 6, dependencies: [] },
  { id: "sub-4", description: "D", vertical: "testing", skills: [], estimatedHours: 3, dependencies: ["sub-2", "sub-3"] },
]

const SELECTIONS: AgentSelection[] = [
  { subtaskId: "sub-1", agentId: "pm-chatbots", score: 1, rationale: "" },
  { subtaskId: "sub-2", agentId: "pm-automatizaciones", score: 1, rationale: "" },
  { subtaskId: "sub-3", agentId: "pm-webs-apps", score: 1, rationale: "" },
  { subtaskId: "sub-4", agentId: "pm-webs-apps", score: 1, rationale: "" },
]

describe("planExecution", () => {
  it("groups independent subtasks into phase 1", () => {
    const plan = planExecution(SUBTASKS, SELECTIONS)
    const phase1 = plan.phases.find((p) => p.phaseNumber === 1)
    expect(phase1).toBeDefined()
    const ids = phase1!.subtasks.map((s) => s.subtaskId)
    expect(ids).toContain("sub-1")
    expect(ids).toContain("sub-3")
  })

  it("puts dependent subtasks in later phases", () => {
    const plan = planExecution(SUBTASKS, SELECTIONS)
    const phase1Ids = new Set(plan.phases[0]!.subtasks.map((s) => s.subtaskId))
    expect(phase1Ids.has("sub-2")).toBe(false)
    expect(phase1Ids.has("sub-4")).toBe(false)
  })

  it("sub-4 comes after sub-2 and sub-3", () => {
    const plan = planExecution(SUBTASKS, SELECTIONS)
    const phaseOf = (id: string) =>
      plan.phases.find((p) => p.subtasks.some((s) => s.subtaskId === id))?.phaseNumber ?? -1

    expect(phaseOf("sub-4")).toBeGreaterThan(phaseOf("sub-2"))
    expect(phaseOf("sub-4")).toBeGreaterThan(phaseOf("sub-3"))
  })

  it("totalEstimatedHours is sum of all subtask hours", () => {
    const plan = planExecution(SUBTASKS, SELECTIONS)
    expect(plan.totalEstimatedHours).toBe(21) // 8+4+6+3
  })

  it("throws on circular dependency", () => {
    const circular: Subtask[] = [
      { id: "a", description: "", vertical: "chatbots", skills: [], estimatedHours: 1, dependencies: ["b"] },
      { id: "b", description: "", vertical: "crm", skills: [], estimatedHours: 1, dependencies: ["a"] },
    ]
    const circularSelections: AgentSelection[] = [
      { subtaskId: "a", agentId: "pm-chatbots", score: 1, rationale: "" },
      { subtaskId: "b", agentId: "pm-automatizaciones", score: 1, rationale: "" },
    ]
    expect(() => planExecution(circular, circularSelections)).toThrow("Circular dependency")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/intelligence/execution-planner.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create execution-planner.ts**

Create `command/src/intelligence/execution-planner.ts`:

```typescript
import type { Subtask, AgentSelection, ExecutionPlan, Phase } from "../types"

export function planExecution(
  subtasks: Subtask[],
  selections: AgentSelection[]
): ExecutionPlan {
  const selectionMap = new Map(selections.map((s) => [s.subtaskId, s]))
  const phases = topoSort(subtasks, selectionMap)
  const totalEstimatedHours = subtasks.reduce((sum, s) => sum + s.estimatedHours, 0)

  return {
    phases,
    checkpoints: [],
    totalEstimatedHours,
    riskLevel: "low",
  }
}

function topoSort(
  subtasks: Subtask[],
  selectionMap: Map<string, AgentSelection>
): Phase[] {
  const remaining = new Set(subtasks.map((s) => s.id))
  const completed = new Set<string>()
  const phases: Phase[] = []

  let iterations = 0
  const maxIterations = subtasks.length + 1

  while (remaining.size > 0) {
    if (iterations++ > maxIterations) {
      throw new Error("Circular dependency detected in subtask graph")
    }

    const ready = subtasks.filter(
      (s) => remaining.has(s.id) && s.dependencies.every((d) => completed.has(d))
    )

    if (ready.length === 0) {
      throw new Error("Circular dependency detected in subtask graph")
    }

    const phaseSubtasks = ready.map((s) => ({
      subtaskId: s.id,
      agentId: selectionMap.get(s.id)?.agentId ?? "unknown",
    }))

    phases.push({ phaseNumber: phases.length + 1, subtasks: phaseSubtasks })

    for (const s of ready) {
      remaining.delete(s.id)
      completed.add(s.id)
    }
  }

  return phases
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/intelligence/execution-planner.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add command/src/intelligence/execution-planner.ts command/tests/intelligence/execution-planner.test.ts
git commit -m "feat(intelligence): execution planner with topological sort"
```

---

### Task 6: Risk Assessor (checkpoint injection)

**Files:**
- Create: `command/src/intelligence/risk-assessor.ts`
- Test: `command/tests/intelligence/risk-assessor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/intelligence/risk-assessor.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { assessRisk } from "../../src/intelligence/risk-assessor"
import type { ExecutionPlan, Phase } from "../../src/types"
import type { CapabilityMap } from "../../src/intelligence/capability-map/types"

function makePlan(phases: Phase[], totalHours: number): ExecutionPlan {
  return { phases, checkpoints: [], totalEstimatedHours: totalHours, riskLevel: "low" }
}

const MOCK_MAP = {
  chatbots: { vertical: "chatbots", agentId: "pm-chatbots", skills: [], maxParallelSubtasks: 3, typicalHoursPerSubtask: 8, requiresClientApproval: true },
  crm: { vertical: "crm", agentId: "pm-automatizaciones", skills: [], maxParallelSubtasks: 2, typicalHoursPerSubtask: 4, requiresClientApproval: false },
} as unknown as CapabilityMap

describe("assessRisk", () => {
  it("returns low risk for short single-phase plan", () => {
    const plan = makePlan(
      [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] }],
      8
    )
    const result = assessRisk(plan, [], MOCK_MAP)
    expect(result.riskLevel).toBe("low")
    expect(result.checkpoints).toHaveLength(0)
  })

  it("adds checkpoint after phase 1 for multi-phase plan > 20h", () => {
    const plan = makePlan(
      [
        { phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] },
        { phaseNumber: 2, subtasks: [{ subtaskId: "sub-2", agentId: "pm-crm" }] },
        { phaseNumber: 3, subtasks: [{ subtaskId: "sub-3", agentId: "pm-chatbots" }] },
      ],
      25
    )
    const result = assessRisk(plan, [], MOCK_MAP)
    expect(result.checkpoints.length).toBeGreaterThan(0)
  })

  it("marks high risk when plan has > 40 hours", () => {
    const plan = makePlan(
      [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] }],
      45
    )
    const result = assessRisk(plan, [], MOCK_MAP)
    expect(result.riskLevel).toBe("high")
  })

  it("marks medium risk when plan has 20-40 hours", () => {
    const plan = makePlan(
      [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] }],
      30
    )
    const result = assessRisk(plan, [], MOCK_MAP)
    expect(result.riskLevel).toBe("medium")
  })

  it("injects client checkpoint when requiresClientApproval is true", () => {
    const plan = makePlan(
      [
        { phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] },
        { phaseNumber: 2, subtasks: [{ subtaskId: "sub-2", agentId: "pm-chatbots" }] },
      ],
      25
    )
    // chatbots vertical requires client approval
    const subtasks = [
      { id: "sub-1", description: "", vertical: "chatbots" as const, skills: [], estimatedHours: 12, dependencies: [] },
      { id: "sub-2", description: "", vertical: "chatbots" as const, skills: [], estimatedHours: 13, dependencies: ["sub-1"] },
    ]
    const result = assessRisk(plan, subtasks, MOCK_MAP)
    const clientCheckpoints = result.checkpoints.filter(
      (c) => c.requiredApproval === "client" || c.requiredApproval === "both"
    )
    expect(clientCheckpoints.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/intelligence/risk-assessor.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create risk-assessor.ts**

Create `command/src/intelligence/risk-assessor.ts`:

```typescript
import type { ExecutionPlan, Subtask, Checkpoint, RiskLevel } from "../types"
import type { CapabilityMap } from "./capability-map/types"

const LOW_RISK_HOURS = 20
const HIGH_RISK_HOURS = 40

export function assessRisk(
  plan: ExecutionPlan,
  subtasks: Subtask[],
  map: CapabilityMap
): ExecutionPlan {
  const riskLevel = computeRiskLevel(plan.totalEstimatedHours)
  const checkpoints = computeCheckpoints(plan, subtasks, map, riskLevel)

  return { ...plan, riskLevel, checkpoints }
}

function computeRiskLevel(totalHours: number): RiskLevel {
  if (totalHours > HIGH_RISK_HOURS) return "high"
  if (totalHours > LOW_RISK_HOURS) return "medium"
  return "low"
}

function computeCheckpoints(
  plan: ExecutionPlan,
  subtasks: Subtask[],
  map: CapabilityMap,
  riskLevel: RiskLevel
): Checkpoint[] {
  const checkpoints: Checkpoint[] = []

  if (plan.phases.length <= 1 && riskLevel === "low") return checkpoints

  const subtaskMap = new Map(subtasks.map((s) => [s.id, s]))

  for (const phase of plan.phases) {
    if (phase.phaseNumber === plan.phases.length) continue

    const phaseSubtasks = phase.subtasks
      .map((ps) => subtaskMap.get(ps.subtaskId))
      .filter((s): s is Subtask => s != null)

    const needsClientApproval = phaseSubtasks.some((s) => {
      const entry = map[s.vertical]
      return entry?.requiresClientApproval === true
    })

    if (riskLevel !== "low" || needsClientApproval) {
      checkpoints.push({
        afterPhase: phase.phaseNumber,
        reason: needsClientApproval
          ? "Client-facing deliverable requires approval before next phase"
          : "Risk threshold exceeded — Jose review required",
        requiredApproval: needsClientApproval ? "both" : "jose",
      })
    }
  }

  return checkpoints
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command
npx vitest run tests/intelligence/risk-assessor.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add command/src/intelligence/risk-assessor.ts command/tests/intelligence/risk-assessor.test.ts
git commit -m "feat(intelligence): risk assessor with checkpoint injection"
```

---

### Task 7: Intelligence Layer Orchestrator + CommandCenter integration

**Files:**
- Create: `command/src/intelligence/index.ts`
- Modify: `command/src/command-center/index.ts`
- Test: `command/tests/intelligence/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/intelligence/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../../src/intelligence/task-analyzer", () => ({
  analyzeTask: vi.fn(),
}))
vi.mock("../../../src/intelligence/capability-map/loader", () => ({
  loadCapabilityMap: vi.fn(),
}))
vi.mock("../../../src/intelligence/capability-matcher", () => ({
  matchCapabilities: vi.fn(),
}))
vi.mock("../../../src/intelligence/execution-planner", () => ({
  planExecution: vi.fn(),
}))
vi.mock("../../../src/intelligence/risk-assessor", () => ({
  assessRisk: vi.fn(),
}))

import { runIntelligenceLayer } from "../../../src/intelligence/index"
import { analyzeTask } from "../../../src/intelligence/task-analyzer"
import { loadCapabilityMap } from "../../../src/intelligence/capability-map/loader"
import { matchCapabilities } from "../../../src/intelligence/capability-matcher"
import { planExecution } from "../../../src/intelligence/execution-planner"
import { assessRisk } from "../../../src/intelligence/risk-assessor"
import type { Subtask, AgentSelection, ExecutionPlan } from "../../../src/types"
import type { CapabilityMap } from "../../../src/intelligence/capability-map/types"

const MOCK_SUBTASKS: Subtask[] = [
  { id: "sub-1", description: "task", vertical: "chatbots", skills: [], estimatedHours: 8, dependencies: [] },
]
const MOCK_SELECTIONS: AgentSelection[] = [
  { subtaskId: "sub-1", agentId: "pm-chatbots", score: 1, rationale: "" },
]
const MOCK_PLAN: ExecutionPlan = {
  phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] }],
  checkpoints: [],
  totalEstimatedHours: 8,
  riskLevel: "low",
}
const MOCK_MAP = {} as CapabilityMap

describe("runIntelligenceLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(analyzeTask).mockResolvedValue(MOCK_SUBTASKS)
    vi.mocked(loadCapabilityMap).mockResolvedValue(MOCK_MAP)
    vi.mocked(matchCapabilities).mockReturnValue(MOCK_SELECTIONS)
    vi.mocked(planExecution).mockReturnValue(MOCK_PLAN)
    vi.mocked(assessRisk).mockReturnValue(MOCK_PLAN)
  })

  it("calls all pipeline steps in order", async () => {
    await runIntelligenceLayer("some order", null)

    expect(analyzeTask).toHaveBeenCalledWith("some order", null)
    expect(loadCapabilityMap).toHaveBeenCalled()
    expect(matchCapabilities).toHaveBeenCalledWith(MOCK_SUBTASKS, MOCK_MAP)
    expect(planExecution).toHaveBeenCalledWith(MOCK_SUBTASKS, MOCK_SELECTIONS)
    expect(assessRisk).toHaveBeenCalledWith(MOCK_PLAN, MOCK_SUBTASKS, MOCK_MAP)
  })

  it("returns subtasks and execution plan", async () => {
    const result = await runIntelligenceLayer("some order", null)

    expect(result.subtasks).toBe(MOCK_SUBTASKS)
    expect(result.executionPlan).toBe(MOCK_PLAN)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/intelligence/index.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create intelligence/index.ts**

Create `command/src/intelligence/index.ts`:

```typescript
import { analyzeTask } from "./task-analyzer"
import { loadCapabilityMap } from "./capability-map/loader"
import { matchCapabilities } from "./capability-matcher"
import { planExecution } from "./execution-planner"
import { assessRisk } from "./risk-assessor"
import type { Subtask, ExecutionPlan, ClientMemory } from "../types"

export interface IntelligenceResult {
  subtasks: Subtask[]
  executionPlan: ExecutionPlan
}

export async function runIntelligenceLayer(
  order: string,
  clientMemory: ClientMemory | null
): Promise<IntelligenceResult> {
  const [subtasks, map] = await Promise.all([
    analyzeTask(order, clientMemory),
    loadCapabilityMap(),
  ])

  const selections = matchCapabilities(subtasks, map)
  const rawPlan = planExecution(subtasks, selections)
  const executionPlan = assessRisk(rawPlan, subtasks, map)

  return { subtasks, executionPlan }
}
```

- [ ] **Step 4: Run intelligence/index test to verify it passes**

```bash
cd command
npx vitest run tests/intelligence/index.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Update CommandCenter to call Intelligence Layer**

Read `command/src/command-center/index.ts` and update `processOrder`:

The current signature is:
```typescript
async processOrder(order: string): Promise<HatTask>
```

Add `skipAnalysis` option and call IntelligenceLayer after task creation. Replace the full file with:

```typescript
import { createTask } from "./task-factory"
import { loadClientMemory } from "./client-memory"
import { resolveControlMode } from "./control-mode"
import { runIntelligenceLayer } from "../intelligence/index"
import { getSupabaseClient } from "../database/client"
import type { HatTask } from "../types"

export interface ProcessOrderOptions {
  skipAnalysis?: boolean
}

export class CommandCenter {
  async processOrder(
    order: string,
    options: ProcessOrderOptions = {}
  ): Promise<HatTask> {
    const clientMemory = await loadClientMemory(null)
    const controlMode = resolveControlMode({
      clientMemory,
      explicitMode: undefined,
    })

    const task = await createTask({
      order,
      controlMode,
      clientId: clientMemory?.clientId ?? null,
    })

    if (options.skipAnalysis === true) {
      return task
    }

    const { subtasks, executionPlan } = await runIntelligenceLayer(
      order,
      clientMemory
    )

    const { error } = await getSupabaseClient()
      .from("hat3x_tasks")
      .update({
        subtasks: subtasks as unknown as Record<string, unknown>[],
        execution_plan: executionPlan as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id)

    if (error != null) {
      throw new Error(`Failed to save intelligence results: ${error.message}`)
    }

    return { ...task, subtasks, executionPlan }
  }
}
```

- [ ] **Step 6: Update CommandCenter tests to use skipAnalysis**

Read `command/tests/command-center/index.test.ts`. Find every call to `processOrder` and add `{ skipAnalysis: true }` as second argument so existing tests don't call the LLM:

```typescript
const task = await center.processOrder("some order", { skipAnalysis: true })
```

- [ ] **Step 7: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add command/src/intelligence/index.ts command/src/command-center/index.ts command/tests/intelligence/index.test.ts command/tests/command-center/
git commit -m "feat(intelligence): orchestrator and CommandCenter integration"
```

---

### Task 8: CLI `oficina plan <id>` command

**Files:**
- Create: `command/src/cli/commands/plan.ts`
- Modify: `command/src/cli/index.ts`
- Test: `command/tests/cli/plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `command/tests/cli/plan.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

const MOCK_TASK = {
  id: "HAT3X-001",
  order: "build a chatbot",
  status: "analyzing",
  control_mode: "supervised",
  subtasks: [
    {
      id: "sub-1",
      description: "Set up WhatsApp integration",
      vertical: "chatbots",
      skills: ["whatsapp-business"],
      estimatedHours: 8,
      dependencies: [],
    },
  ],
  execution_plan: {
    phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: "sub-1", agentId: "pm-chatbots" }] }],
    checkpoints: [],
    totalEstimatedHours: 8,
    riskLevel: "low",
  },
}

describe("runPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: MOCK_TASK, error: null }),
          }),
        }),
      }),
    } as any)
  })

  it("fetches task and displays plan", async () => {
    const { runPlan } = await import("../../src/cli/commands/plan")
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await runPlan("HAT3X-001")

    expect(consoleSpy).toHaveBeenCalled()
    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n")
    expect(output).toContain("HAT3X-001")
    expect(output).toContain("Phase 1")

    consoleSpy.mockRestore()
  })

  it("shows message when no execution plan exists", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...MOCK_TASK, execution_plan: null },
              error: null,
            }),
          }),
        }),
      }),
    } as any)

    const { runPlan } = await import("../../src/cli/commands/plan")
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await runPlan("HAT3X-001")

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n")
    expect(output).toContain("No execution plan")

    consoleSpy.mockRestore()
  })

  it("throws when task not found", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: "PGRST116", message: "not found" },
            }),
          }),
        }),
      }),
    } as any)

    const { runPlan } = await import("../../src/cli/commands/plan")

    await expect(runPlan("HAT3X-999")).rejects.toThrow("Task HAT3X-999 not found")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command
npx vitest run tests/cli/plan.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create plan.ts command**

Create `command/src/cli/commands/plan.ts`:

```typescript
import { getSupabaseClient } from "../../database/client"
import type { ExecutionPlan, Subtask } from "../../types"

interface TaskRow {
  id: string
  order: string
  status: string
  control_mode: string
  subtasks: Subtask[] | null
  execution_plan: ExecutionPlan | null
}

export async function runPlan(taskId: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_tasks")
    .select("id, order, status, control_mode, subtasks, execution_plan")
    .eq("id", taskId)
    .single()

  if (error != null || data == null) {
    throw new Error(`Task ${taskId} not found`)
  }

  const task = data as TaskRow

  console.log(`\n=== ${task.id} ===`)
  console.log(`Order: ${task.order}`)
  console.log(`Status: ${task.status} | Mode: ${task.control_mode}`)

  if (task.execution_plan == null) {
    console.log("\nNo execution plan yet (analysis pending or skipped).")
    return
  }

  const plan = task.execution_plan
  console.log(`\nRisk: ${plan.riskLevel} | Estimated: ${plan.totalEstimatedHours}h`)
  console.log(`Phases: ${plan.phases.length} | Checkpoints: ${plan.checkpoints.length}`)

  for (const phase of plan.phases) {
    const checkpoint = plan.checkpoints.find((c) => c.afterPhase === phase.phaseNumber)
    console.log(`\nPhase ${phase.phaseNumber}:`)
    for (const ps of phase.subtasks) {
      const subtask = (task.subtasks ?? []).find((s) => s.id === ps.subtaskId)
      const desc = subtask?.description ?? ps.subtaskId
      console.log(`  [${ps.agentId}] ${desc}`)
    }
    if (checkpoint != null) {
      console.log(`  ⚑ Checkpoint after this phase — ${checkpoint.reason} (${checkpoint.requiredApproval})`)
    }
  }
}
```

- [ ] **Step 4: Register command in CLI index**

Read `command/src/cli/index.ts`. Add the `plan` subcommand after the `status` command:

```typescript
import { runPlan } from "./commands/plan"

program
  .command("plan <id>")
  .description("Show execution plan for a task")
  .action(async (id: string) => {
    try {
      await runPlan(id)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd command
npx vitest run tests/cli/plan.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Run full suite**

```bash
cd command
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add command/src/cli/commands/plan.ts command/src/cli/index.ts command/tests/cli/plan.test.ts
git commit -m "feat(cli): add 'oficina plan <id>' command to display execution plan"
```

---

### Task 9: Integration Test E2E (Intelligence Layer)

**Files:**
- Create: `command/tests/intelligence/integration/intelligence-layer.test.ts`

This test calls the real Intelligence Layer pipeline — it skips if `ANTHROPIC_API_KEY` is not set.

- [ ] **Step 1: Add ANTHROPIC_API_KEY to .env**

Open `command/.env` and add:
```
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Write the integration test**

Create `command/tests/intelligence/integration/intelligence-layer.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { runIntelligenceLayer } from "../../../src/intelligence/index"

const SKIP = process.env["ANTHROPIC_API_KEY"] == null

describe.skipIf(SKIP)("Intelligence Layer — real LLM integration", () => {
  it(
    "analyzes a simple order and returns a valid plan",
    async () => {
      const result = await runIntelligenceLayer(
        "Necesito un chatbot de WhatsApp para atender clientes de mi clínica dental",
        null
      )

      expect(result.subtasks.length).toBeGreaterThan(0)
      expect(result.executionPlan.phases.length).toBeGreaterThan(0)
      expect(result.executionPlan.totalEstimatedHours).toBeGreaterThan(0)
      expect(["low", "medium", "high"]).toContain(result.executionPlan.riskLevel)

      for (const subtask of result.subtasks) {
        expect(typeof subtask.id).toBe("string")
        expect(typeof subtask.description).toBe("string")
        expect(typeof subtask.vertical).toBe("string")
        expect(Array.isArray(subtask.skills)).toBe(true)
        expect(typeof subtask.estimatedHours).toBe("number")
        expect(Array.isArray(subtask.dependencies)).toBe(true)
      }
    },
    30_000
  )
})
```

- [ ] **Step 3: Run integration test**

```bash
cd command
npx vitest run tests/intelligence/integration/intelligence-layer.test.ts
```

Expected: If `ANTHROPIC_API_KEY` is set → PASS. If not set → skipped (not failed).

- [ ] **Step 4: Run full suite to verify no regressions**

```bash
cd command
npx vitest run
```

Expected: all tests pass (integration test skipped if no API key).

- [ ] **Step 5: Commit**

```bash
git add command/tests/intelligence/integration/intelligence-layer.test.ts
git commit -m "test(intelligence): E2E integration test for Intelligence Layer"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| Task Analyzer — Claude Haiku decomposition | Task 3 |
| Capability Map — YAML files for all 12 verticals | Task 2 |
| Capability Matcher — skill-overlap scoring | Task 4 |
| Execution Planner — topological sort into phases | Task 5 |
| Risk Assessor — checkpoint injection | Task 6 |
| Intelligence Layer orchestrator | Task 7 |
| CommandCenter calls Intelligence Layer | Task 7 |
| CLI `oficina plan <id>` command | Task 8 |
| E2E integration test | Task 9 |
| Zod validation on LLM output | Task 3 |
| Mocked LLM in unit tests | Tasks 3, 7 |
| Concrete Subtask/ExecutionPlan types in HatTask | Task 1 |

All spec requirements covered. ✓

### Type Consistency

- `Subtask` defined in Task 1, used in Tasks 3, 4, 5, 6, 7, 8 ✓
- `AgentSelection` defined in Task 1, used in Tasks 4, 5 ✓
- `ExecutionPlan` defined in Task 1, used in Tasks 5, 6, 7, 8 ✓
- `Phase`/`PhaseSubtask`/`Checkpoint`/`RiskLevel` defined in Task 1, used throughout ✓
- `CapabilityEntry`/`CapabilityMap` defined in Task 2, used in Tasks 4, 6 ✓
- `runIntelligenceLayer` returns `{ subtasks, executionPlan }` in Task 7, consumed in Task 7 (CommandCenter) ✓
