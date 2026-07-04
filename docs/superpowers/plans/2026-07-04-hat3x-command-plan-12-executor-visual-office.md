# HAT3X Command Plan 12 — Executor Headless + Oficina Visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a HAT3X Command la capa que ejecuta los planes con agentes Claude Code headless reales, y la oficina visual 2D + dashboard en Jarvis para supervisarlos en tiempo real.

**Architecture:** Un módulo `executor/` en apps/command consume los `ExecutionPlan` existentes y lanza procesos `claude -p` (máx. 4 concurrentes) por subtarea, publicando progreso al State Bus (`bus_events` en Supabase). Un supervisor (`oficina start`) mantiene vivos servidor, Telegram, scheduler y executor. Jarvis se suscribe a `bus_events` vía Supabase Realtime y renderiza la oficina 2D (SVG/CSS) y el dashboard.

**Tech Stack:** TypeScript strict + tsx + Vitest (apps/command) · Next.js 14 + React 18 + Supabase Realtime (apps/jarvis) · Claude Code CLI headless (`claude -p --output-format stream-json`).

## Global Constraints

- `MAX_CONCURRENT_AGENTS` env var, default `4` (spec §2).
- Agentes headless: cwd = `clients/projects/[cliente]/`, permisos bypass SOLO dentro del workspace (spec §3.2).
- Líneas rojas → `checkpoint.triggered`, nunca ejecución directa: deploy producción, comunicación saliente a clientes, acciones irreversibles/gasto, escritura fuera del workspace (spec §3.4).
- Eventos publicados con los tipos existentes de `src/state-bus/event-types.ts` (`EVENT_TYPES`), sin inventar tipos nuevos salvo los indicados aquí.
- Español en strings de cara a Jose; código e identificadores en inglés.
- TypeScript strict; tests con Vitest; los tests del executor NO deben requerir Supabase vivo (inyectar dependencias).
- Rama git por tarea: `hat3x/HAT3X-NNN` (spec §3.3).

**Rutas base:** `CMD=apps/command`, `JAR=apps/jarvis`. Todos los comandos se ejecutan desde la raíz del repo salvo indicación.

---

### Task 1: Reporter — progreso del agente al State Bus

**Files:**
- Create: `apps/command/src/executor/reporter.ts`
- Create: `apps/command/src/executor/types.ts`
- Test: `apps/command/tests/executor/reporter.test.ts`

**Interfaces:**
- Consumes: `publishEvent({ taskId, eventType, agentId, payload })` de `src/state-bus/publisher.ts`; `EVENT_TYPES` de `src/state-bus/event-types.ts`.
- Produces:
  - `type PublishFn = (input: { taskId: string; eventType: EventType; agentId: string | null; payload: Record<string, unknown> }) => Promise<void>` (en `executor/types.ts`)
  - `interface RunnerEvent { kind: "started" | "progress" | "completed" | "failed" | "artifact"; subtaskId: string; agentId: string; detail: string }` (en `executor/types.ts`)
  - `createReporter(taskId: string, publish: PublishFn): (ev: RunnerEvent) => Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/command/tests/executor/reporter.test.ts
import { describe, it, expect, vi } from "vitest"
import { createReporter } from "../../src/executor/reporter.js"
import type { RunnerEvent } from "../../src/executor/types.js"

describe("createReporter", () => {
  it.each([
    ["started", "task.started"],
    ["progress", "task.progress"],
    ["completed", "task.completed"],
    ["failed", "task.failed"],
    ["artifact", "artifact.shared"],
  ] as const)("maps runner kind %s to bus event %s", async (kind, eventType) => {
    const publish = vi.fn().mockResolvedValue(undefined)
    const report = createReporter("HAT3X-001", publish)
    const ev: RunnerEvent = { kind, subtaskId: "ST-001", agentId: "architect", detail: "diseñando schema" }
    await report(ev)
    expect(publish).toHaveBeenCalledWith({
      taskId: "HAT3X-001",
      eventType,
      agentId: "architect",
      payload: { subtaskId: "ST-001", detail: "diseñando schema" },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/command && npx vitest run tests/executor/reporter.test.ts`
Expected: FAIL — "Cannot find module '../../src/executor/reporter.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/command/src/executor/types.ts
import type { EventType } from "../state-bus/event-types.js"

export type PublishFn = (input: {
  taskId: string
  eventType: EventType
  agentId: string | null
  payload: Record<string, unknown>
}) => Promise<void>

export interface RunnerEvent {
  kind: "started" | "progress" | "completed" | "failed" | "artifact"
  subtaskId: string
  agentId: string
  detail: string
}
```

```typescript
// apps/command/src/executor/reporter.ts
import { EVENT_TYPES } from "../state-bus/event-types.js"
import type { EventType } from "../state-bus/event-types.js"
import type { PublishFn, RunnerEvent } from "./types.js"

const KIND_TO_EVENT: Record<RunnerEvent["kind"], EventType> = {
  started: EVENT_TYPES.TASK_STARTED,
  progress: EVENT_TYPES.TASK_PROGRESS,
  completed: EVENT_TYPES.TASK_COMPLETED,
  failed: EVENT_TYPES.TASK_FAILED,
  artifact: EVENT_TYPES.ARTIFACT_SHARED,
}

export function createReporter(taskId: string, publish: PublishFn) {
  return async (ev: RunnerEvent): Promise<void> => {
    await publish({
      taskId,
      eventType: KIND_TO_EVENT[ev.kind],
      agentId: ev.agentId,
      payload: { subtaskId: ev.subtaskId, detail: ev.detail },
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/command && npx vitest run tests/executor/reporter.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/command/src/executor apps/command/tests/executor
git commit -m "feat(executor): reporter publica progreso de agentes al State Bus"
```

---

### Task 2: Workspace — carpeta aislada + rama git por tarea

**Files:**
- Create: `apps/command/src/executor/workspace.ts`
- Test: `apps/command/tests/executor/workspace.test.ts`

**Interfaces:**
- Consumes: `simple-git` (ya en dependencies).
- Produces: `prepareWorkspace(input: { taskId: string; clientId: string | null; reposRoot: string }): Promise<{ dir: string; branch: string }>` — crea `reposRoot/[clientId ?? "interno"]/`, hace `git init` si no es repo, y crea/checkout la rama `hat3x/[taskId]`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/command/tests/executor/workspace.test.ts
import { describe, it, expect } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"
import simpleGit from "simple-git"
import { prepareWorkspace } from "../../src/executor/workspace.js"

describe("prepareWorkspace", () => {
  it("creates dir, inits git and checks out task branch", async () => {
    const reposRoot = mkdtempSync(join(tmpdir(), "hat3x-ws-"))
    const result = await prepareWorkspace({ taskId: "HAT3X-042", clientId: "novamed", reposRoot })
    expect(result.dir).toBe(join(reposRoot, "novamed"))
    expect(result.branch).toBe("hat3x/HAT3X-042")
    expect(existsSync(join(result.dir, ".git"))).toBe(true)
    const branch = await simpleGit(result.dir).revparse(["--abbrev-ref", "HEAD"])
    expect(branch.trim()).toBe("hat3x/HAT3X-042")
  })

  it("uses 'interno' folder when clientId is null", async () => {
    const reposRoot = mkdtempSync(join(tmpdir(), "hat3x-ws-"))
    const result = await prepareWorkspace({ taskId: "HAT3X-043", clientId: null, reposRoot })
    expect(result.dir).toBe(join(reposRoot, "interno"))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/command && npx vitest run tests/executor/workspace.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/command/src/executor/workspace.ts
import { mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import simpleGit from "simple-git"

export interface WorkspaceInput {
  taskId: string
  clientId: string | null
  reposRoot: string
}

export async function prepareWorkspace(input: WorkspaceInput): Promise<{ dir: string; branch: string }> {
  const dir = join(input.reposRoot, input.clientId ?? "interno")
  mkdirSync(dir, { recursive: true })

  const git = simpleGit(dir)
  if (!existsSync(join(dir, ".git"))) {
    await git.init()
    await git.raw(["commit", "--allow-empty", "-m", "chore: init workspace"])
  }

  const branch = `hat3x/${input.taskId}`
  const branches = await git.branchLocal()
  if (branches.all.includes(branch)) {
    await git.checkout(branch)
  } else {
    await git.checkoutLocalBranch(branch)
  }
  return { dir, branch }
}
```

Nota: si `git init` falla por falta de user.name/email global, añadir en el init: `await git.addConfig("user.name", "HAT3X Office")` y `await git.addConfig("user.email", "office@hat3x.com")` ANTES del commit vacío.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/command && npx vitest run tests/executor/workspace.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/command/src/executor/workspace.ts apps/command/tests/executor/workspace.test.ts
git commit -m "feat(executor): workspace aislado con rama git por tarea"
```

---

### Task 3: Redline guard — settings de permisos para el agente headless

**Files:**
- Create: `apps/command/src/executor/redline-guard.ts`
- Test: `apps/command/tests/executor/redline-guard.test.ts`

**Interfaces:**
- Produces:
  - `buildAgentSettings(workspaceDir: string): AgentSettings` — objeto JSON para `--settings` del CLI de Claude Code.
  - `interface AgentSettings { permissions: { deny: string[] } }`
  - `REDLINE_INSTRUCTIONS: string` — texto en español que el runner añade al prompt: qué NO puede hacer el agente y que debe terminar respondiendo con la línea `HAT3X_CHECKPOINT: <motivo>` si necesita cruzar una línea roja.

**Denegaciones concretas (permission rules de Claude Code):** `Bash(vercel*)`, `Bash(npx vercel*)`, `Bash(netlify*)`, `Bash(gh release*)`, `Bash(git push*)`, `WebFetch`. La escritura fuera del workspace la impide el propio sandbox de cwd + no incluir `additionalDirectories`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/command/tests/executor/redline-guard.test.ts
import { describe, it, expect } from "vitest"
import { buildAgentSettings, REDLINE_INSTRUCTIONS } from "../../src/executor/redline-guard.js"

describe("redline guard", () => {
  it("denies deploy, push and outbound tools", () => {
    const s = buildAgentSettings("C:/repos/novamed")
    expect(s.permissions.deny).toEqual(
      expect.arrayContaining(["Bash(vercel*)", "Bash(npx vercel*)", "Bash(netlify*)", "Bash(git push*)", "Bash(gh release*)", "WebFetch"])
    )
  })

  it("instructions mention the checkpoint marker", () => {
    expect(REDLINE_INSTRUCTIONS).toContain("HAT3X_CHECKPOINT:")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/command && npx vitest run tests/executor/redline-guard.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/command/src/executor/redline-guard.ts
export interface AgentSettings {
  permissions: { deny: string[] }
}

export function buildAgentSettings(_workspaceDir: string): AgentSettings {
  return {
    permissions: {
      deny: [
        "Bash(vercel*)",
        "Bash(npx vercel*)",
        "Bash(netlify*)",
        "Bash(git push*)",
        "Bash(gh release*)",
        "WebFetch",
      ],
    },
  }
}

export const REDLINE_INSTRUCTIONS = [
  "LÍNEAS ROJAS (prohibido ejecutarlas tú mismo):",
  "- Deploy a producción (vercel, netlify, git push, releases).",
  "- Enviar comunicaciones a clientes (email, WhatsApp, Telegram).",
  "- Acciones irreversibles o que gasten dinero.",
  "- Escribir fuera de tu carpeta de trabajo.",
  "Si tu tarea REQUIERE cruzar una línea roja, NO lo hagas: termina tu trabajo hasta ese punto",
  "y responde en tu última línea exactamente: HAT3X_CHECKPOINT: <qué necesitas y por qué>",
].join("\n")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/command && npx vitest run tests/executor/redline-guard.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/command/src/executor/redline-guard.ts apps/command/tests/executor/redline-guard.test.ts
git commit -m "feat(executor): redline guard con deny rules y marcador de checkpoint"
```

---

### Task 4: Agent runner — lanza `claude -p` headless por subtarea

**Files:**
- Create: `apps/command/src/executor/agent-runner.ts`
- Create: `apps/command/src/executor/agent-prompt.ts`
- Test: `apps/command/tests/executor/agent-runner.test.ts`
- Test: `apps/command/tests/executor/agent-prompt.test.ts`

**Interfaces:**
- Consumes: `Subtask` de `src/types.ts` (campos: `id`, `description`, `vertical`, `skills`, `estimatedHours`, `dependencies`); `RunnerEvent` de Task 1; `buildAgentSettings`/`REDLINE_INSTRUCTIONS` de Task 3.
- Produces:
  - `buildAgentPrompt(input: { subtask: Subtask; agentId: string; agentConfig: string; clientContext: string; artifacts: string[] }): string`
  - `type SpawnFn = (cmd: string, args: string[], opts: { cwd: string }) => ChildLike` donde `ChildLike = { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream; on(ev: "close", cb: (code: number | null) => void): void }`
  - `runAgent(input: { subtask: Subtask; agentId: string; agentConfig: string; clientContext: string; artifacts: string[]; workspaceDir: string; onEvent: (ev: RunnerEvent) => Promise<void>; spawn?: SpawnFn; timeoutMs?: number }): Promise<{ outcome: "completed" | "failed" | "checkpoint"; checkpointReason?: string; resultText: string }>`

**Detalle CLI headless:** el runner ejecuta `claude` con args:
`["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions", "--settings", JSON.stringify(settings)]`, `cwd = workspaceDir`. Cada línea JSON de stdout con `type === "assistant"` genera un `RunnerEvent` de kind `progress` cuyo `detail` es un resumen de 120 chars del texto. La línea con `type === "result"` da el `resultText` final. Si `resultText` contiene `HAT3X_CHECKPOINT:` → outcome `checkpoint` con el motivo. Exit code ≠ 0 → `failed`. En Windows spawn con `shell: true`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/command/tests/executor/agent-prompt.test.ts
import { describe, it, expect } from "vitest"
import { buildAgentPrompt } from "../../src/executor/agent-prompt.js"
import type { Subtask } from "../../src/types.js"

const subtask: Subtask = {
  id: "ST-001",
  description: "Diseñar el schema de la base de datos",
  vertical: "database",
  skills: ["supabase-rls", "typescript-strict"],
  estimatedHours: 2,
  dependencies: [],
}

describe("buildAgentPrompt", () => {
  it("includes identity, subtask, skills, context, artifacts and redlines", () => {
    const p = buildAgentPrompt({
      subtask,
      agentId: "architect",
      agentConfig: "Eres el arquitecto de HAT3X.",
      clientContext: "Cliente: NovaMed, sector salud.",
      artifacts: ["wireframes.md: rutas /home /reservas"],
    })
    expect(p).toContain("Eres el arquitecto de HAT3X.")
    expect(p).toContain("Diseñar el schema de la base de datos")
    expect(p).toContain("supabase-rls")
    expect(p).toContain("Cliente: NovaMed")
    expect(p).toContain("wireframes.md")
    expect(p).toContain("HAT3X_CHECKPOINT:")
  })
})
```

```typescript
// apps/command/tests/executor/agent-runner.test.ts
import { describe, it, expect, vi } from "vitest"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import { runAgent } from "../../src/executor/agent-runner.js"
import type { Subtask } from "../../src/types.js"

const subtask: Subtask = {
  id: "ST-001", description: "Crear landing", vertical: "webs-apps",
  skills: [], estimatedHours: 1, dependencies: [],
}

function fakeChild(lines: string[], exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & { stdout: Readable; stderr: Readable }
  child.stdout = Readable.from(lines.map((l) => l + "\n"))
  child.stderr = Readable.from([])
  child.stdout.on("end", () => setImmediate(() => child.emit("close", exitCode)))
  return child
}

const base = {
  subtask, agentId: "lead-programmer", agentConfig: "config", clientContext: "", artifacts: [],
  workspaceDir: "C:/tmp",
}

describe("runAgent", () => {
  it("emits started, progress and completed on success", async () => {
    const events: string[] = []
    const onEvent = vi.fn(async (ev) => { events.push(ev.kind) })
    const spawn = vi.fn(() => fakeChild([
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "creando index.html" }] } }),
      JSON.stringify({ type: "result", result: "landing creada" }),
    ]))
    const r = await runAgent({ ...base, onEvent, spawn })
    expect(r.outcome).toBe("completed")
    expect(r.resultText).toBe("landing creada")
    expect(events[0]).toBe("started")
    expect(events).toContain("progress")
    expect(events[events.length - 1]).toBe("completed")
  })

  it("returns checkpoint outcome when marker present", async () => {
    const spawn = vi.fn(() => fakeChild([
      JSON.stringify({ type: "result", result: "hecho.\nHAT3X_CHECKPOINT: necesito hacer deploy" }),
    ]))
    const r = await runAgent({ ...base, onEvent: vi.fn(async () => {}), spawn })
    expect(r.outcome).toBe("checkpoint")
    expect(r.checkpointReason).toBe("necesito hacer deploy")
  })

  it("returns failed on non-zero exit", async () => {
    const spawn = vi.fn(() => fakeChild([], 1))
    const events: string[] = []
    const r = await runAgent({ ...base, onEvent: vi.fn(async (ev) => { events.push(ev.kind) }), spawn })
    expect(r.outcome).toBe("failed")
    expect(events[events.length - 1]).toBe("failed")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/command && npx vitest run tests/executor/agent-prompt.test.ts tests/executor/agent-runner.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write implementation**

```typescript
// apps/command/src/executor/agent-prompt.ts
import type { Subtask } from "../types.js"
import { REDLINE_INSTRUCTIONS } from "./redline-guard.js"

export interface AgentPromptInput {
  subtask: Subtask
  agentId: string
  agentConfig: string
  clientContext: string
  artifacts: string[]
}

export function buildAgentPrompt(input: AgentPromptInput): string {
  const skills = input.subtask.skills.length > 0
    ? `Skills que DEBES usar (invócalos con el Skill tool): ${input.subtask.skills.join(", ")}`
    : "Sin skills obligatorios."
  const artifacts = input.artifacts.length > 0
    ? `Artefactos de tus compañeros (úsalos como entrada):\n${input.artifacts.map((a) => `- ${a}`).join("\n")}`
    : "Sin artefactos previos."
  return [
    `# Tu identidad\n${input.agentConfig}`,
    `# Contexto del cliente\n${input.clientContext || "Tarea interna de HAT3X."}`,
    `# Tu subtarea (${input.subtask.id})\n${input.subtask.description}`,
    `# ${skills}`,
    `# ${artifacts}`,
    `# Reglas\n${REDLINE_INSTRUCTIONS}`,
    `Trabaja SOLO en el directorio actual. Al terminar, haz git add + commit de tu trabajo y resume en 2-3 frases qué has entregado.`,
  ].join("\n\n")
}
```

```typescript
// apps/command/src/executor/agent-runner.ts
import { spawn as nodeSpawn } from "node:child_process"
import { createInterface } from "node:readline"
import type { Subtask } from "../types.js"
import type { RunnerEvent } from "./types.js"
import { buildAgentPrompt } from "./agent-prompt.js"
import { buildAgentSettings } from "./redline-guard.js"

export interface ChildLike {
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  on(ev: "close", cb: (code: number | null) => void): void
}

export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string }) => ChildLike

const defaultSpawn: SpawnFn = (cmd, args, opts) =>
  nodeSpawn(cmd, args, { cwd: opts.cwd, shell: process.platform === "win32" }) as unknown as ChildLike

export interface RunAgentInput {
  subtask: Subtask
  agentId: string
  agentConfig: string
  clientContext: string
  artifacts: string[]
  workspaceDir: string
  onEvent: (ev: RunnerEvent) => Promise<void>
  spawn?: SpawnFn
  timeoutMs?: number
}

export interface RunAgentResult {
  outcome: "completed" | "failed" | "checkpoint"
  checkpointReason?: string
  resultText: string
}

const CHECKPOINT_MARKER = "HAT3X_CHECKPOINT:"

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const spawn = input.spawn ?? defaultSpawn
  const prompt = buildAgentPrompt(input)
  const settings = JSON.stringify(buildAgentSettings(input.workspaceDir))
  const emit = (kind: RunnerEvent["kind"], detail: string) =>
    input.onEvent({ kind, subtaskId: input.subtask.id, agentId: input.agentId, detail })

  await emit("started", input.subtask.description)

  const child = spawn("claude", [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "bypassPermissions",
    "--settings", settings,
  ], { cwd: input.workspaceDir })

  let resultText = ""
  const rl = createInterface({ input: child.stdout })

  const done = new Promise<number | null>((resolve) => {
    child.on("close", resolve)
  })

  for await (const line of rl) {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(line) as Record<string, unknown> } catch { continue }
    if (msg["type"] === "assistant") {
      const message = msg["message"] as { content?: Array<{ type: string; text?: string }> } | undefined
      const text = (message?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(" ").trim()
      if (text.length > 0) await emit("progress", text.slice(0, 120))
    }
    if (msg["type"] === "result") {
      resultText = String(msg["result"] ?? "")
    }
  }

  const code = await done

  if (code !== 0 && code !== null) {
    await emit("failed", `exit code ${code}`)
    return { outcome: "failed", resultText }
  }

  const markerIdx = resultText.indexOf(CHECKPOINT_MARKER)
  if (markerIdx >= 0) {
    const reason = resultText.slice(markerIdx + CHECKPOINT_MARKER.length).trim()
    return { outcome: "checkpoint", checkpointReason: reason, resultText }
  }

  await emit("completed", resultText.slice(0, 120))
  return { outcome: "completed", resultText }
}
```

Nota timeout: en integración real, envolver `done` con `Promise.race` y un timer de `timeoutMs ?? 30 * 60_000` que mate el proceso y devuelva `failed` con detail `"timeout"`. Incluirlo solo si la demo e2e (Task 12) lo necesita.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/command && npx vitest run tests/executor/agent-prompt.test.ts tests/executor/agent-runner.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/command/src/executor apps/command/tests/executor
git commit -m "feat(executor): agent runner con claude headless y stream-json"
```

---

### Task 5: Queue — despacho por fases con MAX_CONCURRENT_AGENTS

**Files:**
- Create: `apps/command/src/executor/queue.ts`
- Test: `apps/command/tests/executor/queue.test.ts`

**Interfaces:**
- Consumes: `ExecutionPlan`, `Phase`, `PhaseSubtask`, `Subtask` de `src/types.ts`; `RunAgentResult` de Task 4.
- Produces:
  - `type RunSubtaskFn = (subtask: Subtask, agentId: string) => Promise<{ outcome: "completed" | "failed" | "checkpoint"; checkpointReason?: string }>`
  - `type CheckpointFn = (input: { afterSubtaskId: string; reason: string }) => Promise<void>`
  - `executePlan(input: { plan: ExecutionPlan; subtasks: Subtask[]; maxConcurrent: number; runSubtask: RunSubtaskFn; onCheckpoint: CheckpointFn }): Promise<{ completed: string[]; failed: string[]; checkpoints: number }>`

**Semántica:** fases en orden; dentro de cada fase, subtareas en paralelo limitado a `maxConcurrent`. Si una subtarea devuelve `checkpoint` → llama `onCheckpoint` y NO avanza a la siguiente fase (las de la fase actual terminan). Si devuelve `failed` → cuenta como fallo, la fase termina, no avanza (v1 conservadora: cualquier fallo detiene fases posteriores).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/command/tests/executor/queue.test.ts
import { describe, it, expect, vi } from "vitest"
import { executePlan } from "../../src/executor/queue.js"
import type { ExecutionPlan, Subtask } from "../../src/types.js"

function mkSubtask(id: string): Subtask {
  return { id, description: id, vertical: "webs-apps", skills: [], estimatedHours: 1, dependencies: [] }
}

const subtasks = ["A", "B", "C", "D", "E"].map(mkSubtask)
const plan: ExecutionPlan = {
  phases: [
    { phaseNumber: 1, subtasks: [{ subtaskId: "A", agentId: "a1" }, { subtaskId: "B", agentId: "a2" }, { subtaskId: "C", agentId: "a3" }] },
    { phaseNumber: 2, subtasks: [{ subtaskId: "D", agentId: "a4" }, { subtaskId: "E", agentId: "a5" }] },
  ],
  checkpoints: [], totalEstimatedHours: 5, riskLevel: "low",
}

describe("executePlan", () => {
  it("runs all phases and respects maxConcurrent", async () => {
    let active = 0, maxActive = 0
    const runSubtask = vi.fn(async () => {
      active++; maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      return { outcome: "completed" as const }
    })
    const r = await executePlan({ plan, subtasks, maxConcurrent: 2, runSubtask, onCheckpoint: vi.fn() })
    expect(r.completed).toEqual(["A", "B", "C", "D", "E"])
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it("stops advancing phases after a checkpoint and calls onCheckpoint", async () => {
    const onCheckpoint = vi.fn()
    const runSubtask = vi.fn(async (s: Subtask) =>
      s.id === "B" ? { outcome: "checkpoint" as const, checkpointReason: "deploy" } : { outcome: "completed" as const }
    )
    const r = await executePlan({ plan, subtasks, maxConcurrent: 4, runSubtask, onCheckpoint })
    expect(onCheckpoint).toHaveBeenCalledWith({ afterSubtaskId: "B", reason: "deploy" })
    expect(r.checkpoints).toBe(1)
    expect(r.completed).not.toContain("D")
  })

  it("stops after a failure", async () => {
    const runSubtask = vi.fn(async (s: Subtask) =>
      s.id === "A" ? { outcome: "failed" as const } : { outcome: "completed" as const }
    )
    const r = await executePlan({ plan, subtasks, maxConcurrent: 4, runSubtask, onCheckpoint: vi.fn() })
    expect(r.failed).toEqual(["A"])
    expect(r.completed).not.toContain("D")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/command && npx vitest run tests/executor/queue.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// apps/command/src/executor/queue.ts
import type { ExecutionPlan, Subtask } from "../types.js"

export type RunSubtaskFn = (
  subtask: Subtask,
  agentId: string
) => Promise<{ outcome: "completed" | "failed" | "checkpoint"; checkpointReason?: string }>

export type CheckpointFn = (input: { afterSubtaskId: string; reason: string }) => Promise<void>

export interface ExecutePlanInput {
  plan: ExecutionPlan
  subtasks: Subtask[]
  maxConcurrent: number
  runSubtask: RunSubtaskFn
  onCheckpoint: CheckpointFn
}

export interface ExecutePlanResult {
  completed: string[]
  failed: string[]
  checkpoints: number
}

export async function executePlan(input: ExecutePlanInput): Promise<ExecutePlanResult> {
  const byId = new Map(input.subtasks.map((s) => [s.id, s]))
  const completed: string[] = []
  const failed: string[] = []
  let checkpoints = 0

  for (const phase of input.plan.phases) {
    const pending = [...phase.subtasks]
    let halt = false

    async function worker(): Promise<void> {
      for (;;) {
        const item = pending.shift()
        if (item === undefined) return
        const subtask = byId.get(item.subtaskId)
        if (subtask === undefined) { failed.push(item.subtaskId); continue }
        const result = await input.runSubtask(subtask, item.agentId)
        if (result.outcome === "completed") completed.push(subtask.id)
        else if (result.outcome === "failed") { failed.push(subtask.id); halt = true }
        else {
          checkpoints++
          halt = true
          await input.onCheckpoint({ afterSubtaskId: subtask.id, reason: result.checkpointReason ?? "checkpoint" })
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(input.maxConcurrent, phase.subtasks.length) },
      () => worker()
    )
    await Promise.all(workers)
    if (halt) break
  }

  return { completed, failed, checkpoints }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/command && npx vitest run tests/executor/queue.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/command/src/executor/queue.ts apps/command/tests/executor/queue.test.ts
git commit -m "feat(executor): cola por fases con limite de concurrencia"
```

---

### Task 6: Executor service — orquesta todo + endpoint y comando CLI

**Files:**
- Create: `apps/command/src/executor/index.ts`
- Modify: `apps/command/src/server.ts` (añadir `POST /api/execute` junto a los endpoints existentes)
- Modify: `apps/command/src/cli/index.ts` (añadir comando `ejecutar <id>`)
- Test: `apps/command/tests/executor/service.test.ts`

**Interfaces:**
- Consumes: todo lo anterior + `getSupabaseClient()` de `src/database/client.js`; `HatTask` de `src/types.ts`; `publishEvent` de state-bus.
- Produces: `executeTask(taskId: string, overrides?: Partial<ExecutorDeps>): Promise<ExecutePlanResult>` con `ExecutorDeps = { loadTask(taskId: string): Promise<HatTask>; updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>; runSubtask: RunSubtaskFn; publish: PublishFn; insertCheckpoint(input: { taskId: string; reason: string }): Promise<void>; prepareWorkspaceFn(input: { taskId: string; clientId: string | null; reposRoot: string }): Promise<{ dir: string; branch: string }>; reposRoot: string; maxConcurrent: number }` — todos con defaults reales, todos inyectables para test.

**Comportamiento:**
1. `loadTask` lee `hat3x_tasks` por id (mapeo snake_case→camelCase igual que `checkpoint-monitor.ts`).
2. Si `executionPlan === null` → error claro: "La tarea no tiene plan. Ejecuta primero el pipeline (/api/process)."
3. `prepareWorkspace` una vez por tarea. Marca la tarea `running` en `hat3x_tasks`.
4. `runSubtask` real = `runAgent` con `agentConfig` (leer `agents/[vertical]/CLAUDE.md` — `AGENTS_ROOT` env, default `../../agents` desde apps/command; fallback a identidad genérica), `clientContext` y artifacts (v1: vacío; v2: query a bus_events de `task.completed`).
5. `onCheckpoint` real: inserta fila en `hat3x_checkpoints` (columnas que lee `checkpoint-monitor.ts`) y publica `EVENT_TYPES.CHECKPOINT_TRIGGERED`.
6. Al terminar: `hat3x_tasks.status` → `completed` | `paused` (checkpoint) | `failed`.

- [ ] **Step 1: Write the failing test** — deps inyectadas, sin Supabase:

```typescript
// apps/command/tests/executor/service.test.ts
import { describe, it, expect, vi } from "vitest"
import { executeTask } from "../../src/executor/index.js"
import type { HatTask } from "../../src/types.js"

const task: HatTask = {
  id: "HAT3X-001", clientId: null, orderRaw: "landing",
  subtasks: [
    { id: "A", description: "hacer A", vertical: "webs-apps", skills: [], estimatedHours: 1, dependencies: [] },
  ],
  executionPlan: {
    phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: "A", agentId: "lead-programmer" }] }],
    checkpoints: [], totalEstimatedHours: 1, riskLevel: "low",
  },
  controlMode: "autopilot", status: "pending", createdAt: new Date().toISOString(),
}

describe("executeTask", () => {
  it("runs the plan with injected deps and reports status transitions", async () => {
    const statusUpdates: string[] = []
    const r = await executeTask("HAT3X-001", {
      loadTask: vi.fn(async () => task),
      updateTaskStatus: vi.fn(async (_id: string, s: string) => { statusUpdates.push(s) }),
      runSubtask: vi.fn(async () => ({ outcome: "completed" as const })),
      publish: vi.fn(async () => {}),
      insertCheckpoint: vi.fn(async () => {}),
      prepareWorkspaceFn: vi.fn(async () => ({ dir: "C:/tmp", branch: "hat3x/HAT3X-001" })),
      maxConcurrent: 4,
    })
    expect(r.completed).toEqual(["A"])
    expect(statusUpdates).toEqual(["running", "completed"])
  })

  it("throws a clear error when the task has no plan", async () => {
    await expect(executeTask("HAT3X-002", {
      loadTask: vi.fn(async () => ({ ...task, id: "HAT3X-002", executionPlan: null })),
    })).rejects.toThrow(/no tiene plan/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/command && npx vitest run tests/executor/service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// apps/command/src/executor/index.ts
import { join, resolve } from "node:path"
import { readFileSync, existsSync } from "node:fs"
import { getSupabaseClient } from "../database/client.js"
import { publishEvent } from "../state-bus/publisher.js"
import { EVENT_TYPES } from "../state-bus/event-types.js"
import type { HatTask, Subtask, TaskStatus } from "../types.js"
import type { PublishFn } from "./types.js"
import { createReporter } from "./reporter.js"
import { runAgent } from "./agent-runner.js"
import { prepareWorkspace } from "./workspace.js"
import { executePlan, type RunSubtaskFn, type ExecutePlanResult } from "./queue.js"

export interface ExecutorDeps {
  loadTask(taskId: string): Promise<HatTask>
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>
  runSubtask: RunSubtaskFn
  publish: PublishFn
  insertCheckpoint(input: { taskId: string; reason: string }): Promise<void>
  prepareWorkspaceFn(input: { taskId: string; clientId: string | null; reposRoot: string }): Promise<{ dir: string; branch: string }>
  reposRoot: string
  maxConcurrent: number
}

function defaultLoadTask(taskId: string): Promise<HatTask> {
  return getSupabaseClient().from("hat3x_tasks").select("*").eq("id", taskId).single()
    .then(({ data, error }) => {
      if (error != null || data == null) throw new Error(`Tarea ${taskId} no encontrada: ${error?.message ?? ""}`)
      const row = data as Record<string, unknown>
      return {
        id: row["id"] as string,
        clientId: (row["client_id"] as string | null) ?? null,
        orderRaw: row["order_raw"] as string,
        subtasks: (row["subtasks"] as HatTask["subtasks"]) ?? [],
        executionPlan: (row["execution_plan"] as HatTask["executionPlan"]) ?? null,
        controlMode: row["control_mode"] as HatTask["controlMode"],
        status: row["status"] as HatTask["status"],
        createdAt: row["created_at"] as string,
      }
    })
}

async function defaultUpdateStatus(taskId: string, status: TaskStatus): Promise<void> {
  const { error } = await getSupabaseClient().from("hat3x_tasks").update({ status }).eq("id", taskId)
  if (error != null) throw new Error(`No se pudo actualizar ${taskId}: ${error.message}`)
}

async function defaultInsertCheckpoint(input: { taskId: string; reason: string }): Promise<void> {
  const { error } = await getSupabaseClient().from("hat3x_checkpoints").insert({
    task_id: input.taskId, after_phase: 0, reason: input.reason,
    required_approval: "jose", status: "pending", triggered_at: new Date().toISOString(),
  })
  if (error != null) throw new Error(`No se pudo crear checkpoint: ${error.message}`)
  await publishEvent({ taskId: input.taskId, eventType: EVENT_TYPES.CHECKPOINT_TRIGGERED, agentId: null, payload: { reason: input.reason } })
}

function loadAgentConfig(agentId: string, vertical: string): string {
  const root = process.env["AGENTS_ROOT"] ?? resolve(process.cwd(), "..", "..", "agents")
  const candidates = [join(root, vertical, "CLAUDE.md"), join(root, vertical, "subagentes", agentId, "CLAUDE.md")]
  for (const c of candidates) {
    if (existsSync(c)) return readFileSync(c, "utf8")
  }
  return `Eres ${agentId}, un agente experto de HAT3X en ${vertical}. Trabajas con profesionalidad y entregas trabajo verificado.`
}

export async function executeTask(taskId: string, overrides: Partial<ExecutorDeps> = {}): Promise<ExecutePlanResult> {
  const loadTask = overrides.loadTask ?? defaultLoadTask
  const task = await loadTask(taskId)
  if (task.executionPlan === null) {
    throw new Error(`La tarea ${taskId} no tiene plan. Ejecuta primero el pipeline (/api/process).`)
  }

  const publish = overrides.publish ?? (publishEvent as PublishFn)
  const updateTaskStatus = overrides.updateTaskStatus ?? defaultUpdateStatus
  const insertCheckpoint = overrides.insertCheckpoint ?? defaultInsertCheckpoint
  const prepareWorkspaceFn = overrides.prepareWorkspaceFn ?? prepareWorkspace
  const reposRoot = overrides.reposRoot ?? (process.env["HAT3X_REPOS_ROOT"] ?? resolve(process.cwd(), "..", "..", "clients", "projects"))
  const maxConcurrent = overrides.maxConcurrent ?? parseInt(process.env["MAX_CONCURRENT_AGENTS"] ?? "4", 10)

  const ws = await prepareWorkspaceFn({ taskId, clientId: task.clientId, reposRoot })
  const report = createReporter(taskId, publish)

  const runSubtask: RunSubtaskFn = overrides.runSubtask ?? (async (subtask: Subtask, agentId: string) => {
    const r = await runAgent({
      subtask, agentId,
      agentConfig: loadAgentConfig(agentId, subtask.vertical),
      clientContext: task.clientId !== null ? `Cliente: ${task.clientId}` : "",
      artifacts: [],
      workspaceDir: ws.dir,
      onEvent: report,
    })
    return r.outcome === "checkpoint"
      ? { outcome: r.outcome, checkpointReason: r.checkpointReason ?? "checkpoint" }
      : { outcome: r.outcome }
  })

  await updateTaskStatus(taskId, "running")

  const result = await executePlan({
    plan: task.executionPlan,
    subtasks: task.subtasks,
    maxConcurrent,
    runSubtask,
    onCheckpoint: async ({ reason }) => { await insertCheckpoint({ taskId, reason }) },
  })

  const finalStatus: TaskStatus =
    result.failed.length > 0 ? "failed" : result.checkpoints > 0 ? "paused" : "completed"
  await updateTaskStatus(taskId, finalStatus)
  return result
}
```

Modificar `src/server.ts` — añadir antes del bloque 404, siguiendo el patrón exacto de `/api/process`:

```typescript
  if (req.method === "POST" && req.url === "/api/execute") {
    let body = ""
    req.on("data", (chunk: Buffer) => { body += chunk.toString() })
    req.on("end", () => {
      let taskId: string | undefined
      try { taskId = (JSON.parse(body) as { taskId?: string }).taskId } catch {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid JSON" }))
        return
      }
      if (!taskId) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "taskId is required" }))
        return
      }
      executeTask(taskId)
        .then((result) => {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: true, ...result }))
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[execute] ${taskId}: ${message}`)
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: message }))
        })
    })
    return
  }
```

(con `import { executeTask } from "./executor/index.js"` arriba).

Modificar `src/cli/index.ts` — añadir tras el comando `progress`:

```typescript
  program
    .command("ejecutar <id>")
    .description("Ejecuta el plan de una tarea con agentes headless")
    .action(async (id: string) => {
      try {
        const { executeTask } = await import("../executor/index.js")
        const r = await executeTask(id)
        console.log(`Completadas: ${r.completed.length} · Fallidas: ${r.failed.length} · Checkpoints: ${r.checkpoints}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/command && npx vitest run tests/executor/`
Expected: PASS (todos los tests del executor)

- [ ] **Step 5: Typecheck completo y commit**

Run: `cd apps/command && npx tsc --noEmit`
Expected: sin errores

```bash
git add apps/command/src apps/command/tests
git commit -m "feat(executor): executeTask orquesta plan completo + endpoint /api/execute + CLI ejecutar"
```

---

### Task 7: Supervisor — `oficina start` mantiene la oficina encendida

**Files:**
- Create: `apps/command/src/supervisor/index.ts`
- Modify: `apps/command/src/cli/index.ts` (comando `start`)
- Modify: `apps/command/package.json` (script `"office": "tsx src/supervisor/index.ts"`)
- Test: `apps/command/tests/supervisor/supervisor.test.ts`

**Interfaces:**
- Produces: `startSupervisor(services: ServiceSpec[], spawnFn?: SupervisorSpawnFn): SupervisorHandle` donde:
  - `interface ServiceSpec { name: string; cmd: string; args: string[] }`
  - `type SupervisorSpawnFn = (cmd: string, args: string[]) => ProcLike` con `ProcLike = { on(ev: "exit", cb: (code: number | null) => void): void; kill(): void }`
  - `interface SupervisorHandle { stop(): void; restartCount(name: string): number }`
- Reinicia un servicio cuando sale, con delay fijo de 5s (test usa fake timers). Servicios reales (`OFFICE_SERVICES`): `server`, `telegram`, `scheduler` vía `npx tsx`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/command/tests/supervisor/supervisor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "node:events"
import { startSupervisor } from "../../src/supervisor/index.js"

class FakeProc extends EventEmitter { kill = vi.fn() }

describe("startSupervisor", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("spawns each service and restarts on exit after 5s", async () => {
    const procs: FakeProc[] = []
    const spawnFn = vi.fn(() => { const p = new FakeProc(); procs.push(p); return p })
    const handle = startSupervisor([{ name: "server", cmd: "tsx", args: ["src/server.ts"] }], spawnFn)
    expect(spawnFn).toHaveBeenCalledTimes(1)

    procs[0]!.emit("exit", 1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(spawnFn).toHaveBeenCalledTimes(2)
    expect(handle.restartCount("server")).toBe(1)

    handle.stop()
    procs[1]!.emit("exit", 0)
    await vi.advanceTimersByTimeAsync(10000)
    expect(spawnFn).toHaveBeenCalledTimes(2) // no restart after stop
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/command && npx vitest run tests/supervisor/supervisor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// apps/command/src/supervisor/index.ts
import { spawn as nodeSpawn } from "node:child_process"

export interface ServiceSpec { name: string; cmd: string; args: string[] }

export interface ProcLike {
  on(ev: "exit", cb: (code: number | null) => void): void
  kill(): void
}

export type SupervisorSpawnFn = (cmd: string, args: string[]) => ProcLike

export interface SupervisorHandle {
  stop(): void
  restartCount(name: string): number
}

const RESTART_DELAY_MS = 5000

const defaultSpawn: SupervisorSpawnFn = (cmd, args) =>
  nodeSpawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" })

export function startSupervisor(services: ServiceSpec[], spawnFn: SupervisorSpawnFn = defaultSpawn): SupervisorHandle {
  let stopped = false
  const restarts = new Map<string, number>()
  const procs = new Map<string, ProcLike>()

  function launch(svc: ServiceSpec): void {
    const proc = spawnFn(svc.cmd, svc.args)
    procs.set(svc.name, proc)
    proc.on("exit", (code) => {
      console.log(`[supervisor] ${svc.name} salió (code ${code})`)
      if (stopped) return
      setTimeout(() => {
        if (stopped) return
        restarts.set(svc.name, (restarts.get(svc.name) ?? 0) + 1)
        console.log(`[supervisor] reiniciando ${svc.name}...`)
        launch(svc)
      }, RESTART_DELAY_MS)
    })
  }

  for (const svc of services) launch(svc)

  return {
    stop() {
      stopped = true
      for (const p of procs.values()) p.kill()
    },
    restartCount: (name) => restarts.get(name) ?? 0,
  }
}

export const OFFICE_SERVICES: ServiceSpec[] = [
  { name: "server", cmd: "npx", args: ["tsx", "src/server.ts"] },
  { name: "telegram", cmd: "npx", args: ["tsx", "src/telegram/index.ts"] },
  { name: "scheduler", cmd: "npx", args: ["tsx", "src/scheduler/index.ts"] },
]

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("supervisor/index.ts") ?? false
if (isMain) {
  console.log("[supervisor] 🏢 Oficina HAT3X encendida")
  const handle = startSupervisor(OFFICE_SERVICES)
  process.on("SIGINT", () => { handle.stop(); process.exit(0) })
}
```

CLI (`src/cli/index.ts`), añadir:

```typescript
  program
    .command("start")
    .description("Enciende la oficina (server + telegram + scheduler)")
    .action(async () => {
      const { startSupervisor, OFFICE_SERVICES } = await import("../supervisor/index.js")
      console.log("🏢 Oficina HAT3X encendida — Ctrl+C para apagar")
      const handle = startSupervisor(OFFICE_SERVICES)
      process.on("SIGINT", () => { handle.stop(); process.exit(0) })
    })
```

package.json scripts: añadir `"office": "tsx src/supervisor/index.ts"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/command && npx vitest run tests/supervisor/supervisor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/command/src/supervisor apps/command/src/cli/index.ts apps/command/package.json apps/command/tests/supervisor
git commit -m "feat(supervisor): oficina start con reinicio automatico de servicios"
```

---

### Task 8: Entorno vivo — Supabase + tests en verde

**Files:**
- Modify: `apps/command/.env.example` (añadir `MAX_CONCURRENT_AGENTS=4`, `HAT3X_REPOS_ROOT=`, `AGENTS_ROOT=`)
- Modify/Create: los tests que fallan por Realtime (8 archivos — identificarlos con el run)

**No es TDD clásico — es saneamiento:**

- [ ] **Step 1: Identificar los 19 tests que fallan**

Run: `cd apps/command && npx vitest run 2>&1 | grep -E "FAIL" | head -40`
Anotar archivos. Diagnóstico previo: intentan conexión Realtime real.

- [ ] **Step 2: Arreglarlos SIN Supabase vivo**

Patrón: donde un test cree un canal Realtime real (`.channel(...).subscribe()`), sustituir el cliente por un mock con `vi.mock("../../src/database/client.js", ...)` que devuelva un objeto con `channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })`. Si el test es de integración genuina (necesita Supabase), marcarlo `describe.skipIf(!process.env["SUPABASE_URL"]?.includes("supabase.co"))`.

- [ ] **Step 3: Suite completa en verde**

Run: `cd apps/command && npx vitest run`
Expected: 0 failed (los de integración skipped si no hay env)

- [ ] **Step 4: Verificar schema Supabase real**

Buscar migraciones existentes: `ls apps/command/supabase 2>/dev/null || grep -rl "CREATE TABLE" apps/command --include="*.sql"`. Confirmar que existen `hat3x_tasks`, `bus_events`, `hat3x_checkpoints` (y tablas de meetings) en el proyecto Supabase del `.env` (select limit 1 por tabla con el service role). Si falta alguna, aplicar el SQL del spec original §3/§5/§6. **Además:** habilitar Realtime en `bus_events` (`ALTER PUBLICATION supabase_realtime ADD TABLE bus_events;`) — la oficina visual lo necesita.

- [ ] **Step 5: Commit**

```bash
git add apps/command
git commit -m "fix(tests): suite en verde sin Supabase vivo + env example completo"
```

---

### Task 9: Jarvis — estado de la oficina desde bus_events (lógica pura + hook)

**Files:**
- Create: `apps/jarvis/src/lib/office-state.ts`
- Create: `apps/jarvis/src/hooks/useOfficeState.ts`
- Test: `apps/jarvis/tests/office-state.test.ts`

Antes de crear cliente Supabase browser nuevo: `grep -rl "createClient" apps/jarvis/src --include="*.ts" --include="*.tsx"` y reutilizar si existe.

**Interfaces:**
- Produces (en `office-state.ts`, lógica pura testeable):
  - `type AgentStatus = "working" | "meeting" | "blocked" | "idle"`
  - `interface OfficeAgent { agentId: string; status: AgentStatus; bubble: string | null; taskId: string | null; lastEventAt: string }`
  - `interface OfficeEvent { taskId: string; eventType: string; agentId: string | null; payload: Record<string, unknown>; createdAt: string }` (forma camelCase de una fila de `bus_events`)
  - `reduceOfficeState(agents: Map<string, OfficeAgent>, ev: OfficeEvent): Map<string, OfficeAgent>` — reducer puro:
    - `task.started`/`task.progress` → status `working`, bubble = `payload.detail`
    - `meeting.called`/`meeting.statement`/`meeting.vote` → `meeting`
    - `task.blocked`/`task.failed` → `blocked`
    - `task.completed`/`meeting.resolved`/`agent.offline` → `idle`, bubble null
  - `rowToOfficeEvent(row: Record<string, unknown>): OfficeEvent`
- `useOfficeState(): { agents: OfficeAgent[]; events: OfficeEvent[] }` — carga últimos 200 eventos por REST y se suscribe al canal Realtime `postgres_changes` INSERT en `bus_events`, aplicando el reducer.

- [ ] **Step 1: Write the failing test (reducer puro)**

```typescript
// apps/jarvis/tests/office-state.test.ts
import { describe, it, expect } from "vitest"
import { reduceOfficeState, type OfficeEvent, type OfficeAgent } from "../src/lib/office-state"

function ev(eventType: string, agentId: string, detail = "trabajando"): OfficeEvent {
  return { taskId: "HAT3X-001", eventType, agentId, payload: { detail }, createdAt: new Date().toISOString() }
}

describe("reduceOfficeState", () => {
  it("task.progress marks agent working with bubble", () => {
    const m = reduceOfficeState(new Map<string, OfficeAgent>(), ev("task.progress", "architect", "diseñando schema"))
    const a = m.get("architect")!
    expect(a.status).toBe("working")
    expect(a.bubble).toBe("diseñando schema")
    expect(a.taskId).toBe("HAT3X-001")
  })

  it("meeting.called moves agent to meeting", () => {
    let m = reduceOfficeState(new Map(), ev("task.progress", "architect"))
    m = reduceOfficeState(m, ev("meeting.called", "architect"))
    expect(m.get("architect")!.status).toBe("meeting")
  })

  it("task.blocked marks blocked; task.completed returns to idle", () => {
    let m = reduceOfficeState(new Map(), ev("task.blocked", "qa-lead"))
    expect(m.get("qa-lead")!.status).toBe("blocked")
    m = reduceOfficeState(m, ev("task.completed", "qa-lead"))
    expect(m.get("qa-lead")!.status).toBe("idle")
    expect(m.get("qa-lead")!.bubble).toBeNull()
  })

  it("ignores events without agentId", () => {
    const m = reduceOfficeState(new Map(), { ...ev("checkpoint.triggered", ""), agentId: null })
    expect(m.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/jarvis && npx vitest run tests/office-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// apps/jarvis/src/lib/office-state.ts
export type AgentStatus = 'working' | 'meeting' | 'blocked' | 'idle';

export interface OfficeAgent {
  agentId: string;
  status: AgentStatus;
  bubble: string | null;
  taskId: string | null;
  lastEventAt: string;
}

export interface OfficeEvent {
  taskId: string;
  eventType: string;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

const WORKING = new Set(['task.started', 'task.progress']);
const MEETING = new Set(['meeting.called', 'meeting.statement', 'meeting.vote']);
const BLOCKED = new Set(['task.blocked', 'task.failed']);
const IDLE = new Set(['task.completed', 'meeting.resolved', 'agent.offline']);

export function reduceOfficeState(
  agents: Map<string, OfficeAgent>,
  ev: OfficeEvent
): Map<string, OfficeAgent> {
  if (ev.agentId === null || ev.agentId === '') return agents;
  const next = new Map(agents);
  const detail = typeof ev.payload['detail'] === 'string' ? (ev.payload['detail'] as string) : null;

  let status: AgentStatus | null = null;
  if (WORKING.has(ev.eventType)) status = 'working';
  else if (MEETING.has(ev.eventType)) status = 'meeting';
  else if (BLOCKED.has(ev.eventType)) status = 'blocked';
  else if (IDLE.has(ev.eventType)) status = 'idle';
  if (status === null) return agents;

  next.set(ev.agentId, {
    agentId: ev.agentId,
    status,
    bubble: status === 'idle' ? null : detail,
    taskId: status === 'idle' ? null : ev.taskId,
    lastEventAt: ev.createdAt,
  });
  return next;
}

export function rowToOfficeEvent(row: Record<string, unknown>): OfficeEvent {
  return {
    taskId: row['task_id'] as string,
    eventType: row['event_type'] as string,
    agentId: (row['agent_id'] as string | null) ?? null,
    payload: (row['payload'] as Record<string, unknown>) ?? {},
    createdAt: row['created_at'] as string,
  };
}
```

```typescript
// apps/jarvis/src/hooks/useOfficeState.ts
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  reduceOfficeState,
  rowToOfficeEvent,
  type OfficeAgent,
  type OfficeEvent,
} from '../lib/office-state';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
);

export function useOfficeState(): { agents: OfficeAgent[]; events: OfficeEvent[] } {
  const [agents, setAgents] = useState<Map<string, OfficeAgent>>(new Map());
  const [events, setEvents] = useState<OfficeEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from('bus_events')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled || data == null) return;
        const evs = data.map(rowToOfficeEvent);
        setEvents(evs);
        setAgents(evs.reduce((m, e) => reduceOfficeState(m, e), new Map<string, OfficeAgent>()));
      });

    const channel = supabase
      .channel('office-bus')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_events' }, (payload) => {
        const ev = rowToOfficeEvent(payload.new as Record<string, unknown>);
        setEvents((prev) => [...prev.slice(-199), ev]);
        setAgents((prev) => reduceOfficeState(prev, ev));
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return { agents: Array.from(agents.values()), events };
}
```

Si `apps/jarvis/.env.local` no tiene `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, añadirlas a `.env.example` y documentar.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/jarvis && npx vitest run tests/office-state.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/office-state.ts apps/jarvis/src/hooks/useOfficeState.ts apps/jarvis/tests/office-state.test.ts
git commit -m "feat(jarvis): estado de la oficina en tiempo real desde bus_events"
```

---

### Task 10: Jarvis — página /oficina (plano 2D con avatares)

**Files:**
- Create: `apps/jarvis/src/app/oficina/page.tsx`
- Create: `apps/jarvis/src/components/office/OfficeFloor.tsx`
- Create: `apps/jarvis/src/components/office/AgentAvatar.tsx`
- Create: `apps/jarvis/src/components/office/AgentPanel.tsx`

**Interfaces:**
- Consumes: `useOfficeState()` de Task 9.
- Produces: página cliente (`'use client'`) — sin API nueva.

**Diseño de zonas (layout fijo, CSS grid):** Sala de reuniones, Dev, Diseño, QA, Operaciones, Descanso. Asignación: `meeting` → sala; `idle` → descanso; resto según mapa `VERTICAL_ZONE`. Idle > 12 agentes → contador "⚪ N agentes descansando" en vez de avatares individuales.

- [ ] **Step 1: Componentes**

```tsx
// apps/jarvis/src/components/office/AgentAvatar.tsx
'use client';
import type { OfficeAgent } from '../../lib/office-state';

const STATUS_COLOR: Record<OfficeAgent['status'], string> = {
  working: '#22c55e',
  meeting: '#3b82f6',
  blocked: '#ef4444',
  idle: '#9ca3af',
};

export function AgentAvatar({ agent, onClick }: { agent: OfficeAgent; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={agent.bubble ?? agent.agentId}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        background: 'none', border: 'none', cursor: 'pointer', width: 92,
      }}
    >
      {agent.bubble !== null && (
        <span style={{
          fontSize: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          padding: '2px 6px', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(0,0,0,.08)',
        }}>{agent.bubble}</span>
      )}
      <span style={{
        width: 40, height: 40, borderRadius: '50%',
        background: STATUS_COLOR[agent.status],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 14,
        transition: 'background .3s',
        animation: agent.status === 'working' ? 'pulse 2s infinite' : undefined,
      }}>{agent.agentId.slice(0, 2).toUpperCase()}</span>
      <span style={{ fontSize: 10, color: '#374151', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agent.agentId}
      </span>
    </button>
  );
}
```

```tsx
// apps/jarvis/src/components/office/OfficeFloor.tsx
'use client';
import type { OfficeAgent } from '../../lib/office-state';
import { AgentAvatar } from './AgentAvatar';

const VERTICAL_ZONE: Record<string, string> = {
  'webs-apps': 'Dev', github: 'Dev', deployment: 'Dev', database: 'Dev',
  chatbots: 'Diseño', voz: 'Diseño',
  testing: 'QA', security: 'QA',
  automatizaciones: 'Operaciones', crm: 'Operaciones', calendar: 'Operaciones', documentation: 'Operaciones',
};

const ZONES = ['Sala de reuniones', 'Dev', 'Diseño', 'QA', 'Operaciones', 'Descanso'] as const;

function zoneOf(agent: OfficeAgent, verticalByAgent: Record<string, string>): string {
  if (agent.status === 'meeting') return 'Sala de reuniones';
  if (agent.status === 'idle') return 'Descanso';
  return VERTICAL_ZONE[verticalByAgent[agent.agentId] ?? ''] ?? 'Dev';
}

export function OfficeFloor({
  agents, verticalByAgent, onSelect,
}: {
  agents: OfficeAgent[];
  verticalByAgent: Record<string, string>;
  onSelect: (a: OfficeAgent) => void;
}) {
  const byZone = new Map<string, OfficeAgent[]>(ZONES.map((z) => [z, []]));
  for (const a of agents) byZone.get(zoneOf(a, verticalByAgent))!.push(a);
  const idle = byZone.get('Descanso')!;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 16 }}>
      <style>{`@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5) } 50% { box-shadow: 0 0 0 8px rgba(34,197,94,0) } }`}</style>
      {ZONES.map((zone) => (
        <section key={zone} style={{
          border: '2px solid #e5e7eb', borderRadius: 12, padding: 12, minHeight: 140,
          background: zone === 'Sala de reuniones' ? '#eff6ff' : zone === 'Descanso' ? '#f9fafb' : '#fff',
        }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#6b7280' }}>{zone}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {zone === 'Descanso' && idle.length > 12 ? (
              <span style={{ fontSize: 13, color: '#6b7280' }}>⚪ {idle.length} agentes descansando</span>
            ) : (
              byZone.get(zone)!.map((a) => <AgentAvatar key={a.agentId} agent={a} onClick={() => onSelect(a)} />)
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
```

```tsx
// apps/jarvis/src/components/office/AgentPanel.tsx
'use client';
import type { OfficeAgent, OfficeEvent } from '../../lib/office-state';

export function AgentPanel({ agent, events, onClose }: {
  agent: OfficeAgent; events: OfficeEvent[]; onClose: () => void;
}) {
  const agentEvents = events.filter((e) => e.agentId === agent.agentId).slice(-30).reverse();
  return (
    <aside style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 340, background: '#fff',
      borderLeft: '1px solid #e5e7eb', padding: 16, overflowY: 'auto', zIndex: 50,
      boxShadow: '-4px 0 12px rgba(0,0,0,.06)',
    }}>
      <button onClick={onClose} style={{ float: 'right', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{agent.agentId}</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
        {agent.status === 'working' ? '🟢 Trabajando' : agent.status === 'meeting' ? '🔵 En reunión' : agent.status === 'blocked' ? '🔴 Bloqueado' : '⚪ Descansando'}
        {agent.taskId !== null ? ` · ${agent.taskId}` : ''}
      </p>
      <h3 style={{ fontSize: 13, color: '#374151' }}>Actividad reciente</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {agentEvents.map((e, i) => (
          <li key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ color: '#9ca3af' }}>{new Date(e.createdAt).toLocaleTimeString('es-ES')}</span>{' '}
            <strong>{e.eventType}</strong>
            <div style={{ color: '#4b5563' }}>{String(e.payload['detail'] ?? '')}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

```tsx
// apps/jarvis/src/app/oficina/page.tsx
'use client';
import { useState } from 'react';
import { useOfficeState } from '../../hooks/useOfficeState';
import { OfficeFloor } from '../../components/office/OfficeFloor';
import { AgentPanel } from '../../components/office/AgentPanel';
import type { OfficeAgent } from '../../lib/office-state';

export default function OficinaPage() {
  const { agents, events } = useOfficeState();
  const [selected, setSelected] = useState<OfficeAgent | null>(null);
  const working = agents.filter((a) => a.status === 'working').length;
  const blocked = agents.filter((a) => a.status === 'blocked').length;

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ padding: '16px 16px 0' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>🏢 Oficina HAT3X</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          🟢 {working} trabajando · 🔴 {blocked} bloqueados · {agents.length} agentes vistos hoy
        </p>
      </header>
      <OfficeFloor agents={agents} verticalByAgent={{}} onSelect={setSelected} />
      {selected !== null && (
        <AgentPanel agent={agents.find((a) => a.agentId === selected.agentId) ?? selected} events={events} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}
```

Nota `verticalByAgent`: v1 pasa `{}` (los working caen en zona Dev). Mejora futura: incluir `vertical` en el payload del `RunnerEvent` y derivar el mapa en `useOfficeState`. NO bloquear esta task por ello.

- [ ] **Step 2: Verificar build**

Run: `cd apps/jarvis && npx next build 2>&1 | tail -5`
Expected: build OK (o `npx tsc --noEmit` si el build completo es lento)

- [ ] **Step 3: Smoke visual con datos sintéticos**

Insertar 5 eventos de prueba en `bus_events` (script one-off con service role): `task.started`/`task.progress` para `architect` y `lead-programmer`, `meeting.called` para `ux-designer`, `task.blocked` para `qa-lead`. Arrancar `npm run dev` y abrir `http://localhost:3001/oficina`: deben verse 4 avatares en sus zonas con burbujas y el panel lateral al hacer clic.

- [ ] **Step 4: Commit**

```bash
git add apps/jarvis/src/app/oficina apps/jarvis/src/components/office
git commit -m "feat(jarvis): oficina 2D con avatares en tiempo real"
```

---

### Task 11: Jarvis — dashboard /command con feed vivo + /checkpoints accionable

**Files:**
- Modify: `apps/jarvis/src/app/command/page.tsx` (añadir feed de eventos vivo + tarjetas de agentes activos usando `useOfficeState`)
- Modify: `apps/jarvis/src/app/command/checkpoints/page.tsx` (botones aprobar/rechazar reales)
- Create: `apps/jarvis/src/app/api/command/checkpoints/route.ts` (comprobar antes `ls apps/jarvis/src/app/api/command` y reutilizar si ya existe endpoint equivalente)

**Interfaces:**
- Consumes: `useOfficeState()`; tabla `hat3x_checkpoints`; eventos `checkpoint.approved`/`checkpoint.rejected`.
- Produces: `POST /api/command/checkpoints` body `{ id: string; action: 'approve' | 'reject'; feedback?: string }` → update `hat3x_checkpoints` (`status`, `resolved_at`, `feedback`) + insert en `bus_events`. Cliente Supabase con SERVICE ROLE solo en el servidor.

- [ ] **Step 1: Leer las páginas existentes** (`apps/jarvis/src/app/command/page.tsx` y `checkpoints/page.tsx`) y extender siguiendo su estilo (no reescribir lo que funcione).

- [ ] **Step 2: API route de checkpoints**

```typescript
// apps/jarvis/src/app/api/command/checkpoints/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; action?: 'approve' | 'reject'; feedback?: string };
  if (!body.id || (body.action !== 'approve' && body.action !== 'reject')) {
    return NextResponse.json({ error: 'id y action (approve|reject) requeridos' }, { status: 400 });
  }
  const status = body.action === 'approve' ? 'approved' : 'rejected';

  const { data, error } = await supabase
    .from('hat3x_checkpoints')
    .update({ status, resolved_at: new Date().toISOString(), feedback: body.feedback ?? null })
    .eq('id', body.id)
    .select('task_id')
    .single();
  if (error != null || data == null) {
    return NextResponse.json({ error: error?.message ?? 'checkpoint no encontrado' }, { status: 500 });
  }

  await supabase.from('bus_events').insert({
    task_id: data.task_id as string,
    event_type: body.action === 'approve' ? 'checkpoint.approved' : 'checkpoint.rejected',
    agent_id: null,
    payload: { checkpointId: body.id, feedback: body.feedback ?? null },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Página checkpoints** — lista `hat3x_checkpoints` con `status = 'pending'` y por cada uno tres botones que hacen `fetch('/api/command/checkpoints', { method: 'POST', body: JSON.stringify({ id, action, feedback }) })`: ✅ Aprobar (`approve`), ✏️ Con cambios (prompt de texto → `approve` con feedback), ❌ Rechazar (prompt de motivo → `reject`). Tras la respuesta, refrescar la lista.

- [ ] **Step 4: Dashboard /command** — añadir dos secciones con `useOfficeState()`: "Agentes activos" (tarjetas: agentId, status con color, bubble, taskId) y "Feed en vivo" (últimos 50 `events` con hora, eventType y detail — mismo formato que AgentPanel).

- [ ] **Step 5: Build + commit**

Run: `cd apps/jarvis && npx next build 2>&1 | tail -5`
Expected: OK

```bash
git add apps/jarvis/src/app
git commit -m "feat(jarvis): dashboard con feed vivo y checkpoints accionables"
```

---

### Task 12: Demo end-to-end — la oficina trabaja de verdad

**Files:**
- Create: `docs/OFICINA.md` (guía de uso: encender, dar órdenes, supervisar, aprobar)

**Sin código nuevo — verificación integral:**

- [ ] **Step 1: Encender la oficina**

```bash
cd apps/command && npm run office
```
Expected: `[supervisor] 🏢 Oficina HAT3X encendida` + server (3002) + telegram + scheduler arriba.

- [ ] **Step 2: Lanzar tarea real interna**

```bash
cd apps/command && npx tsx src/index.ts nueva "Crea una landing HTML simple de una página para probar la oficina: título HAT3X, tres secciones de servicios, footer" --modo autopilot
```
Anotar el `HAT3X-NNN`. Luego: `curl -X POST localhost:3002/api/process -H "Content-Type: application/json" -d "{\"taskId\":\"HAT3X-NNN\"}"` y `curl -X POST localhost:3002/api/execute -H "Content-Type: application/json" -d "{\"taskId\":\"HAT3X-NNN\"}"`.

- [ ] **Step 3: Verificar en la oficina visual**

`cd apps/jarvis && npm run dev` → abrir `http://localhost:3001/oficina`. Expected: avatares 🟢 con burbujas de progreso mientras la tarea corre; al terminar pasan a ⚪.

- [ ] **Step 4: Verificar entregable**

`ls clients/projects/interno/` → debe existir el HTML committeado en la rama `hat3x/HAT3X-NNN` (`git -C clients/projects/interno log --oneline`).

- [ ] **Step 5: Verificar checkpoint**

Lanzar segunda tarea que cruce línea roja: `nueva "Haz deploy a producción de la landing de prueba"`. Expected: el agente NO despliega, aparece checkpoint en `/command/checkpoints` de Jarvis y notificación en Telegram. Aprobar desde Jarvis → evento `checkpoint.approved` visible en el feed.

- [ ] **Step 6: Escribir docs/OFICINA.md**

Guía en español: requisitos (.env de ambas apps, Realtime habilitado en bus_events), `oficina start`, dar órdenes (CLI/Telegram/Jarvis), las 3 vistas, cómo aprobar checkpoints, troubleshooting (claude no encontrado en PATH, límites de suscripción, Supabase caído).

- [ ] **Step 7: Commit final + actualizar memoria**

```bash
git add docs/OFICINA.md
git commit -m "docs: guia de uso de la oficina virtual HAT3X"
```
Actualizar la memoria del proyecto (`project_hat3x_command.md`): Plan 12 ejecutado, estado real de la demo.

---

## Self-Review

- **Cobertura del spec:** §3 Executor → Tasks 1-6 · §4 Supervisor → Task 7 · §5 colaboración: artefactos v1 en Task 6, reuniones existentes se disparan vía `task.blocked` (infraestructura previa de coordination) · §6 visual → Tasks 9-11 · §7 entorno → Task 8 · §8 verificación → Task 12. Gap consciente: facilitador de reuniones headless queda sobre el meeting-protocol existente; si la demo no convoca reuniones, tarea de seguimiento — no bloquea el goal.
- **Placeholders:** ninguno — todo paso de código lleva el código.
- **Consistencia de tipos:** `RunnerEvent`/`PublishFn` (T1) usados en T4/T6; `RunSubtaskFn` (T5) usado en T6; `OfficeAgent`/`OfficeEvent` (T9) usados en T10/T11; columnas snake_case alineadas con `publisher.ts` y `checkpoint-monitor.ts` existentes.
