# HAT3X Command — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la capa de datos, Command Center y State Bus — la base sobre la que se construyen todos los demás componentes del sistema.

**Architecture:** Un paquete TypeScript standalone en `command/` con cliente Supabase, Command Center que recibe órdenes y crea tareas persistentes, y un State Bus basado en Supabase Realtime para pub/sub de eventos entre agentes. El CLI expone los primeros comandos funcionales: `nueva` y `status`.

**Tech Stack:** TypeScript strict, Supabase (DB + Realtime), Vitest, Commander.js para CLI, Zod para validación, dotenv

---

## Mapa de Ficheros

```
command/
├── package.json
├── tsconfig.json
├── .env.example
├── vitest.config.ts
├── src/
│   ├── index.ts                         ← entry point del CLI
│   ├── types.ts                         ← tipos compartidos del sistema
│   ├── database/
│   │   ├── client.ts                    ← singleton Supabase
│   │   └── migrations/
│   │       └── 001_initial.sql          ← todas las tablas
│   ├── command-center/
│   │   ├── index.ts                     ← orquesta el flujo de creación
│   │   ├── task-factory.ts              ← genera ID y crea tarea en Supabase
│   │   ├── client-memory.ts             ← carga contexto del cliente
│   │   └── control-mode.ts             ← determina modo según contexto
│   ├── state-bus/
│   │   ├── index.ts                     ← re-exporta publisher y subscriber
│   │   ├── publisher.ts                 ← publica eventos al bus
│   │   ├── subscriber.ts                ← suscripción a eventos
│   │   └── event-types.ts              ← todos los tipos de evento
│   └── cli/
│       ├── index.ts                     ← setup Commander
│       ├── commands/
│       │   ├── nueva.ts                 ← comando /oficina nueva
│       │   └── status.ts               ← comando /oficina status
│       └── formatter.ts                ← formatea output al terminal
└── tests/
    ├── helpers/
    │   ├── setup.ts                     ← carga .env para tests
    │   ├── supabase-test-client.ts      ← cliente Supabase para tests
    │   └── factories.ts                 ← factories de datos de prueba
    ├── command-center/
    │   ├── task-factory.test.ts
    │   ├── client-memory.test.ts
    │   └── control-mode.test.ts
    ├── state-bus/
    │   ├── publisher.test.ts
    │   └── subscriber.test.ts
    ├── cli/
    │   ├── nueva.test.ts
    │   └── status.test.ts
    └── integration/
        └── foundation.test.ts
```

---

## Task 1: Estructura del proyecto y dependencias

**Files:**
- Create: `command/package.json`
- Create: `command/tsconfig.json`
- Create: `command/.env.example`
- Create: `command/vitest.config.ts`

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "hat3x-command",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "cli": "tsx src/index.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "commander": "^12.0.0",
    "dotenv": "^16.4.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Crear .env.example**

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# HAT3X Command
HAT3X_TELEGRAM_BOT_TOKEN=your-telegram-bot-token
HAT3X_DEFAULT_CONTROL_MODE=phased
```

- [ ] **Step 4: Crear vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/helpers/setup.ts"],
  },
})
```

- [ ] **Step 5: Instalar dependencias**

```bash
cd command && npm install
```

Expected: `node_modules/` creado sin errores

- [ ] **Step 6: Commit**

```bash
git add command/package.json command/tsconfig.json command/.env.example command/vitest.config.ts
git commit -m "feat(command): project setup and dependencies"
```

---

## Task 2: Tipos compartidos del sistema

**Files:**
- Create: `command/src/types.ts`
- Create: `command/tests/helpers/setup.ts`

- [ ] **Step 1: Crear tests/helpers/setup.ts**

```typescript
import { config } from "dotenv"
config({ path: "../.env" })
```

- [ ] **Step 2: Crear src/types.ts**

```typescript
export type ControlMode = "autopilot" | "phased" | "supervised" | "configurable"

export type TaskStatus = "pending" | "running" | "paused" | "completed" | "failed"

export type SubtaskType =
  | "discovery"
  | "design"
  | "development"
  | "integration"
  | "testing"
  | "security"
  | "performance"
  | "seo"
  | "deployment"
  | "documentation"
  | "communication"

export interface HatTask {
  id: string
  clientId: string | null
  orderRaw: string
  subtasks: unknown
  executionPlan: unknown
  controlMode: ControlMode
  status: TaskStatus
  createdAt: string
}

export interface ClientMemory {
  id: string
  name: string
  sector: string | null
  previousProjects: string[]
  notes: string | null
}

export interface BusEvent {
  id?: string
  taskId: string
  eventType: string
  agentId: string | null
  payload: Record<string, unknown>
  createdAt?: string
}
```

- [ ] **Step 3: Verificar TypeScript sin errores**

```bash
cd command && npx tsc --noEmit
```

Expected: sin output (0 errores)

- [ ] **Step 4: Commit**

```bash
git add command/src/types.ts command/tests/helpers/setup.ts
git commit -m "feat(command): shared type definitions"
```

---

## Task 3: Supabase — migración y cliente

**Files:**
- Create: `command/src/database/migrations/001_initial.sql`
- Create: `command/src/database/client.ts`
- Create: `command/tests/helpers/supabase-test-client.ts`
- Create: `command/tests/database/client.test.ts`

- [ ] **Step 1: Crear migración SQL**

Crear `command/src/database/migrations/001_initial.sql`:
```sql
CREATE TABLE IF NOT EXISTS hat3x_tasks (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  order_raw TEXT NOT NULL,
  subtasks JSONB DEFAULT '[]'::jsonb,
  execution_plan JSONB DEFAULT '{}'::jsonb,
  control_mode TEXT NOT NULL DEFAULT 'phased',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hat3x_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT,
  previous_projects TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL REFERENCES hat3x_tasks(id),
  event_type TEXT NOT NULL,
  agent_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bus_events_task
  ON bus_events(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bus_events_type
  ON bus_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS capability_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  context_tags TEXT[] DEFAULT '{}',
  agents JSONB DEFAULT '[]'::jsonb,
  skills JSONB DEFAULT '[]'::jsonb,
  success_rate FLOAT DEFAULT 0,
  learned_from TEXT[] DEFAULT '{}',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skill_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'partial')),
  sector TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  agent_id TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('auto', 'proposed', 'approved', 'rejected')),
  change_description TEXT NOT NULL,
  before_snapshot JSONB,
  after_snapshot JSONB,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evolution_proposals (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  impact TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER PUBLICATION supabase_realtime ADD TABLE bus_events;
```

- [ ] **Step 2: Ejecutar migración en Supabase**

Ir a Supabase Dashboard → SQL Editor → pegar el contenido de `001_initial.sql` → Run.

Expected: "Success. No rows returned"

- [ ] **Step 3: Crear src/database/client.ts**

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client

  const url = process.env["SUPABASE_URL"]
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment"
    )
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  })

  return _client
}

export function resetClient(): void {
  _client = null
}
```

- [ ] **Step 4: Crear tests/helpers/supabase-test-client.ts**

```typescript
import { getSupabaseClient } from "../../src/database/client.js"
import type { SupabaseClient } from "@supabase/supabase-js"

export function getTestClient(): SupabaseClient {
  return getSupabaseClient()
}

export async function cleanTestData(taskId: string): Promise<void> {
  const client = getTestClient()
  await client.from("bus_events").delete().eq("task_id", taskId)
  await client.from("hat3x_tasks").delete().eq("id", taskId)
}
```

- [ ] **Step 5: Crear tests/database/client.test.ts**

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { getSupabaseClient, resetClient } from "../../src/database/client.js"

describe("getSupabaseClient", () => {
  beforeEach(() => resetClient())

  it("returns a client when env vars are set", () => {
    const client = getSupabaseClient()
    expect(client).toBeDefined()
  })

  it("returns the same instance on repeated calls", () => {
    const a = getSupabaseClient()
    const b = getSupabaseClient()
    expect(a).toBe(b)
  })

  it("throws when SUPABASE_URL is missing", () => {
    const url = process.env["SUPABASE_URL"]
    delete process.env["SUPABASE_URL"]
    resetClient()
    expect(() => getSupabaseClient()).toThrow("SUPABASE_URL")
    process.env["SUPABASE_URL"] = url
    resetClient()
  })
})
```

- [ ] **Step 6: Ejecutar tests**

```bash
cd command && npm test tests/database/client.test.ts
```

Expected: 3 passed

- [ ] **Step 7: Commit**

```bash
git add command/src/database/ command/tests/helpers/ command/tests/database/
git commit -m "feat(command): supabase client and initial migration"
```

---

## Task 4: Task Factory

**Files:**
- Create: `command/src/command-center/task-factory.ts`
- Create: `command/tests/command-center/task-factory.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, it, expect, afterEach } from "vitest"
import { createTask } from "../../src/command-center/task-factory.js"
import { getTestClient, cleanTestData } from "../helpers/supabase-test-client.js"

describe("createTask", () => {
  const createdIds: string[] = []

  afterEach(async () => {
    for (const id of createdIds) await cleanTestData(id)
    createdIds.length = 0
  })

  it("creates a task with auto-generated sequential ID", async () => {
    const task = await createTask({ orderRaw: "Web para clínica NovaMed", controlMode: "phased" })
    createdIds.push(task.id)
    expect(task.id).toMatch(/^HAT3X-\d{3}$/)
    expect(task.status).toBe("pending")
    expect(task.controlMode).toBe("phased")
  })

  it("persists the task in Supabase", async () => {
    const task = await createTask({ orderRaw: "Agente de voz", controlMode: "autopilot" })
    createdIds.push(task.id)
    const client = getTestClient()
    const { data } = await client.from("hat3x_tasks").select("*").eq("id", task.id).single()
    expect(data?.order_raw).toBe("Agente de voz")
  })

  it("assigns clientId when provided", async () => {
    const task = await createTask({ orderRaw: "Chatbot", controlMode: "phased", clientId: "client-novamed" })
    createdIds.push(task.id)
    expect(task.clientId).toBe("client-novamed")
  })

  it("increments the ID counter sequentially", async () => {
    const t1 = await createTask({ orderRaw: "Tarea 1", controlMode: "phased" })
    const t2 = await createTask({ orderRaw: "Tarea 2", controlMode: "phased" })
    createdIds.push(t1.id, t2.id)
    const n1 = parseInt(t1.id.replace("HAT3X-", ""))
    const n2 = parseInt(t2.id.replace("HAT3X-", ""))
    expect(n2).toBe(n1 + 1)
  })
})
```

- [ ] **Step 2: Ejecutar test — verificar que falla**

```bash
cd command && npm test tests/command-center/task-factory.test.ts
```

Expected: FAIL — "Cannot find module task-factory"

- [ ] **Step 3: Implementar task-factory.ts**

```typescript
import { getSupabaseClient } from "../database/client.js"
import type { HatTask, ControlMode } from "../types.js"

interface CreateTaskInput {
  orderRaw: string
  controlMode: ControlMode
  clientId?: string
}

async function getNextTaskId(): Promise<string> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from("hat3x_tasks")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to get last task ID: ${error.message}`)
  }

  if (!data) return "HAT3X-001"

  const lastNumber = parseInt(data.id.replace("HAT3X-", ""), 10)
  return `HAT3X-${String(lastNumber + 1).padStart(3, "0")}`
}

export async function createTask(input: CreateTaskInput): Promise<HatTask> {
  const client = getSupabaseClient()
  const id = await getNextTaskId()

  const { data, error } = await client
    .from("hat3x_tasks")
    .insert({
      id,
      client_id: input.clientId ?? null,
      order_raw: input.orderRaw,
      subtasks: [],
      execution_plan: {},
      control_mode: input.controlMode,
      status: "pending",
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create task: ${error.message}`)
  if (!data) throw new Error("Task created but no data returned")

  return {
    id: data.id,
    clientId: data.client_id,
    orderRaw: data.order_raw,
    subtasks: data.subtasks,
    executionPlan: data.execution_plan,
    controlMode: data.control_mode,
    status: data.status,
    createdAt: data.created_at,
  }
}
```

- [ ] **Step 4: Ejecutar tests — verificar que pasan**

```bash
cd command && npm test tests/command-center/task-factory.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add command/src/command-center/task-factory.ts command/tests/command-center/task-factory.test.ts
git commit -m "feat(command): task factory with sequential IDs"
```

---

## Task 5: Client Memory

**Files:**
- Create: `command/src/command-center/client-memory.ts`
- Create: `command/tests/command-center/client-memory.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, it, expect, afterEach } from "vitest"
import { loadClientMemory, upsertClient } from "../../src/command-center/client-memory.js"
import { getTestClient } from "../helpers/supabase-test-client.js"

const TEST_ID = "test-client-mem-001"

describe("loadClientMemory", () => {
  afterEach(async () => {
    await getTestClient().from("hat3x_clients").delete().eq("id", TEST_ID)
  })

  it("returns null when client does not exist", async () => {
    expect(await loadClientMemory("nonexistent-xyz")).toBeNull()
  })

  it("returns client data when client exists", async () => {
    await upsertClient({ id: TEST_ID, name: "NovaMed", sector: "clinicas", previousProjects: ["HAT3X-083"], notes: null })
    const memory = await loadClientMemory(TEST_ID)
    expect(memory?.name).toBe("NovaMed")
    expect(memory?.sector).toBe("clinicas")
    expect(memory?.previousProjects).toContain("HAT3X-083")
  })
})

describe("upsertClient", () => {
  afterEach(async () => {
    await getTestClient().from("hat3x_clients").delete().eq("id", TEST_ID)
  })

  it("creates a new client record", async () => {
    await upsertClient({ id: TEST_ID, name: "Test", sector: null, previousProjects: [], notes: null })
    expect(await loadClientMemory(TEST_ID)).not.toBeNull()
  })

  it("updates an existing client record", async () => {
    await upsertClient({ id: TEST_ID, name: "Old", sector: null, previousProjects: [], notes: null })
    await upsertClient({ id: TEST_ID, name: "Updated", sector: "restaurantes", previousProjects: ["HAT3X-071"], notes: "nota" })
    const m = await loadClientMemory(TEST_ID)
    expect(m?.name).toBe("Updated")
    expect(m?.sector).toBe("restaurantes")
  })
})
```

- [ ] **Step 2: Ejecutar test — verificar que falla**

```bash
cd command && npm test tests/command-center/client-memory.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implementar client-memory.ts**

```typescript
import { getSupabaseClient } from "../database/client.js"
import type { ClientMemory } from "../types.js"

export async function loadClientMemory(clientId: string): Promise<ClientMemory | null> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_clients")
    .select("*")
    .eq("id", clientId)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(`Failed to load client memory: ${error.message}`)
  }

  return {
    id: data.id,
    name: data.name,
    sector: data.sector,
    previousProjects: data.previous_projects ?? [],
    notes: data.notes,
  }
}

interface UpsertClientInput {
  id: string
  name: string
  sector: string | null
  previousProjects: string[]
  notes: string | null
}

export async function upsertClient(input: UpsertClientInput): Promise<void> {
  const { error } = await getSupabaseClient().from("hat3x_clients").upsert({
    id: input.id,
    name: input.name,
    sector: input.sector,
    previous_projects: input.previousProjects,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Failed to upsert client: ${error.message}`)
}
```

- [ ] **Step 4: Ejecutar tests — verificar que pasan**

```bash
cd command && npm test tests/command-center/client-memory.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add command/src/command-center/client-memory.ts command/tests/command-center/client-memory.test.ts
git commit -m "feat(command): client memory load and upsert"
```

---

## Task 6: Control Mode Resolver

**Files:**
- Create: `command/src/command-center/control-mode.ts`
- Create: `command/tests/command-center/control-mode.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, it, expect } from "vitest"
import { resolveControlMode } from "../../src/command-center/control-mode.js"
import type { ClientMemory } from "../../src/types.js"

const existing: ClientMemory = { id: "c1", name: "NovaMed", sector: "clinicas", previousProjects: ["HAT3X-083"], notes: null }
const newClient: ClientMemory = { id: "c2", name: "Nuevo", sector: null, previousProjects: [], notes: null }

describe("resolveControlMode", () => {
  it("returns explicit mode when set", () => {
    expect(resolveControlMode({ explicitMode: "autopilot", clientMemory: existing, orderRaw: "x" })).toBe("autopilot")
  })

  it("returns supervised for new clients", () => {
    expect(resolveControlMode({ explicitMode: null, clientMemory: newClient, orderRaw: "x" })).toBe("supervised")
  })

  it("returns phased for existing clients", () => {
    expect(resolveControlMode({ explicitMode: null, clientMemory: existing, orderRaw: "x" })).toBe("phased")
  })

  it("returns supervised when no client memory", () => {
    expect(resolveControlMode({ explicitMode: null, clientMemory: null, orderRaw: "x" })).toBe("supervised")
  })
})
```

- [ ] **Step 2: Ejecutar test — verificar que falla**

```bash
cd command && npm test tests/command-center/control-mode.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implementar control-mode.ts**

```typescript
import type { ControlMode, ClientMemory } from "../types.js"

interface ResolveControlModeInput {
  explicitMode: ControlMode | null
  clientMemory: ClientMemory | null
  orderRaw: string
}

export function resolveControlMode(input: ResolveControlModeInput): ControlMode {
  if (input.explicitMode) return input.explicitMode
  if (!input.clientMemory || input.clientMemory.previousProjects.length === 0) return "supervised"
  return "phased"
}
```

- [ ] **Step 4: Ejecutar tests — verificar que pasan**

```bash
cd command && npm test tests/command-center/control-mode.test.ts
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add command/src/command-center/control-mode.ts command/tests/command-center/control-mode.test.ts
git commit -m "feat(command): control mode resolver"
```

---

## Task 7: Command Center — orquestador

**Files:**
- Create: `command/src/command-center/index.ts`
- Create: `command/tests/command-center/index.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, it, expect, afterEach } from "vitest"
import { CommandCenter } from "../../src/command-center/index.js"
import { cleanTestData } from "../helpers/supabase-test-client.js"

describe("CommandCenter", () => {
  const ids: string[] = []
  afterEach(async () => { for (const id of ids) await cleanTestData(id); ids.length = 0 })

  it("processes an order and returns a task", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Web para test" })
    ids.push(task.id)
    expect(task.id).toMatch(/^HAT3X-\d{3}$/)
    expect(task.status).toBe("pending")
  })

  it("uses supervised for unknown clients", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Test", clientId: "nonexistent-xyz" })
    ids.push(task.id)
    expect(task.controlMode).toBe("supervised")
  })

  it("respects explicit control mode", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Test", controlMode: "autopilot" })
    ids.push(task.id)
    expect(task.controlMode).toBe("autopilot")
  })
})
```

- [ ] **Step 2: Ejecutar test — verificar que falla**

```bash
cd command && npm test tests/command-center/index.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implementar command-center/index.ts**

```typescript
import { createTask } from "./task-factory.js"
import { loadClientMemory } from "./client-memory.js"
import { resolveControlMode } from "./control-mode.js"
import type { HatTask, ControlMode } from "../types.js"

interface ProcessOrderInput {
  orderRaw: string
  clientId?: string
  controlMode?: ControlMode
}

export class CommandCenter {
  async processOrder(input: ProcessOrderInput): Promise<HatTask> {
    const clientMemory = input.clientId ? await loadClientMemory(input.clientId) : null

    const controlMode = resolveControlMode({
      explicitMode: input.controlMode ?? null,
      clientMemory,
      orderRaw: input.orderRaw,
    })

    return createTask({ orderRaw: input.orderRaw, controlMode, clientId: input.clientId })
  }
}
```

- [ ] **Step 4: Ejecutar tests — verificar que pasan**

```bash
cd command && npm test tests/command-center/index.test.ts
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add command/src/command-center/index.ts command/tests/command-center/index.test.ts
git commit -m "feat(command): command center orchestrator"
```

---

## Task 8: State Bus — Publisher y Event Types

**Files:**
- Create: `command/src/state-bus/event-types.ts`
- Create: `command/src/state-bus/publisher.ts`
- Create: `command/tests/state-bus/publisher.test.ts`

- [ ] **Step 1: Crear event-types.ts**

```typescript
export const EVENT_TYPES = {
  TASK_STARTED:          "task.started",
  TASK_PROGRESS:         "task.progress",
  TASK_COMPLETED:        "task.completed",
  TASK_BLOCKED:          "task.blocked",
  TASK_FAILED:           "task.failed",
  ARTIFACT_SHARED:       "artifact.shared",
  MEETING_CALLED:        "meeting.called",
  MEETING_STATEMENT:     "meeting.statement",
  MEETING_VOTE:          "meeting.vote",
  MEETING_RESOLVED:      "meeting.resolved",
  CHECKPOINT_TRIGGERED:  "checkpoint.triggered",
  CHECKPOINT_APPROVED:   "checkpoint.approved",
  CHECKPOINT_REJECTED:   "checkpoint.rejected",
  AGENT_ONLINE:          "agent.online",
  AGENT_OFFLINE:         "agent.offline",
  INTEGRATION_REQUESTED: "integration.requested",
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]
```

- [ ] **Step 2: Escribir el test del publisher**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { publishEvent } from "../../src/state-bus/publisher.js"
import { EVENT_TYPES } from "../../src/state-bus/event-types.js"
import { getTestClient, cleanTestData } from "../helpers/supabase-test-client.js"

const TASK_ID = "HAT3X-TEST-PUB"

describe("publishEvent", () => {
  beforeEach(async () => {
    await getTestClient().from("hat3x_tasks").upsert({
      id: TASK_ID, order_raw: "test", control_mode: "phased", status: "running",
    })
  })
  afterEach(async () => { await cleanTestData(TASK_ID) })

  it("inserts an event into bus_events", async () => {
    await publishEvent({ taskId: TASK_ID, eventType: EVENT_TYPES.TASK_STARTED, agentId: "lead-programmer", payload: { subtaskId: "ST-001" } })
    const { data } = await getTestClient().from("bus_events").select("*").eq("task_id", TASK_ID).single()
    expect(data?.agent_id).toBe("lead-programmer")
    expect(data?.payload).toMatchObject({ subtaskId: "ST-001" })
  })

  it("allows null agentId for system events", async () => {
    await publishEvent({ taskId: TASK_ID, eventType: EVENT_TYPES.CHECKPOINT_TRIGGERED, agentId: null, payload: { reason: "Phase complete" } })
    const { data } = await getTestClient().from("bus_events").select("agent_id").eq("event_type", EVENT_TYPES.CHECKPOINT_TRIGGERED).eq("task_id", TASK_ID).single()
    expect(data?.agent_id).toBeNull()
  })
})
```

- [ ] **Step 3: Ejecutar test — verificar que falla**

```bash
cd command && npm test tests/state-bus/publisher.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implementar publisher.ts**

```typescript
import { getSupabaseClient } from "../database/client.js"
import type { EventType } from "./event-types.js"

interface PublishEventInput {
  taskId: string
  eventType: EventType
  agentId: string | null
  payload: Record<string, unknown>
}

export async function publishEvent(input: PublishEventInput): Promise<void> {
  const { error } = await getSupabaseClient().from("bus_events").insert({
    task_id: input.taskId,
    event_type: input.eventType,
    agent_id: input.agentId,
    payload: input.payload,
  })
  if (error) throw new Error(`Failed to publish event: ${error.message}`)
}
```

- [ ] **Step 5: Ejecutar tests — verificar que pasan**

```bash
cd command && npm test tests/state-bus/publisher.test.ts
```

Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add command/src/state-bus/event-types.ts command/src/state-bus/publisher.ts command/tests/state-bus/publisher.test.ts
git commit -m "feat(command): state bus publisher and event types"
```

---

## Task 9: State Bus — Subscriber

**Files:**
- Create: `command/src/state-bus/subscriber.ts`
- Create: `command/src/state-bus/index.ts`
- Create: `command/tests/state-bus/subscriber.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createSubscriber } from "../../src/state-bus/subscriber.js"
import { publishEvent } from "../../src/state-bus/publisher.js"
import { EVENT_TYPES } from "../../src/state-bus/event-types.js"
import { getTestClient, cleanTestData } from "../helpers/supabase-test-client.js"

const TASK_ID = "HAT3X-TEST-SUB"

describe("createSubscriber", () => {
  beforeEach(async () => {
    await getTestClient().from("hat3x_tasks").upsert({
      id: TASK_ID, order_raw: "test sub", control_mode: "phased", status: "running",
    })
  })
  afterEach(async () => { await cleanTestData(TASK_ID) })

  it("calls handler when a matching event is published", async () => {
    const handler = vi.fn()
    const sub = createSubscriber({ taskId: TASK_ID, eventTypes: [EVENT_TYPES.TASK_COMPLETED], handler })
    await sub.subscribe()

    await publishEvent({ taskId: TASK_ID, eventType: EVENT_TYPES.TASK_COMPLETED, agentId: "lead-programmer", payload: { subtaskId: "ST-001" } })
    await new Promise((r) => setTimeout(r, 500))
    await sub.unsubscribe()

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ eventType: EVENT_TYPES.TASK_COMPLETED })
  }, 5000)
})
```

- [ ] **Step 2: Ejecutar test — verificar que falla**

```bash
cd command && npm test tests/state-bus/subscriber.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implementar subscriber.ts**

```typescript
import { getSupabaseClient } from "../database/client.js"
import type { BusEvent } from "../types.js"
import type { EventType } from "./event-types.js"
import type { RealtimeChannel } from "@supabase/supabase-js"

type EventHandler = (event: BusEvent) => void | Promise<void>

interface SubscriberOptions {
  taskId: string
  eventTypes: EventType[]
  handler: EventHandler
}

export interface Subscriber {
  subscribe(): Promise<void>
  unsubscribe(): Promise<void>
}

export function createSubscriber(options: SubscriberOptions): Subscriber {
  const client = getSupabaseClient()
  let channel: RealtimeChannel | null = null

  return {
    async subscribe() {
      channel = client
        .channel(`bus:${options.taskId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "bus_events",
          filter: `task_id=eq.${options.taskId}`,
        }, (payload) => {
          const r = payload.new as Record<string, unknown>
          const eventType = r["event_type"] as string
          if (options.eventTypes.includes(eventType as EventType)) {
            void options.handler({
              id: r["id"] as string,
              taskId: r["task_id"] as string,
              eventType,
              agentId: r["agent_id"] as string | null,
              payload: r["payload"] as Record<string, unknown>,
              createdAt: r["created_at"] as string,
            })
          }
        })
        .subscribe()
    },
    async unsubscribe() {
      if (channel) { await client.removeChannel(channel); channel = null }
    },
  }
}
```

- [ ] **Step 4: Crear state-bus/index.ts**

```typescript
export { publishEvent } from "./publisher.js"
export { createSubscriber } from "./subscriber.js"
export { EVENT_TYPES } from "./event-types.js"
export type { EventType } from "./event-types.js"
export type { Subscriber } from "./subscriber.js"
```

- [ ] **Step 5: Ejecutar tests — verificar que pasan**

```bash
cd command && npm test tests/state-bus/subscriber.test.ts
```

Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add command/src/state-bus/subscriber.ts command/src/state-bus/index.ts command/tests/state-bus/subscriber.test.ts
git commit -m "feat(command): state bus subscriber via Supabase Realtime"
```

---

## Task 10: CLI — Comandos nueva y status

**Files:**
- Create: `command/src/cli/formatter.ts`
- Create: `command/src/cli/commands/nueva.ts`
- Create: `command/src/cli/commands/status.ts`
- Create: `command/src/cli/index.ts`
- Create: `command/src/index.ts`
- Create: `command/tests/cli/nueva.test.ts`
- Create: `command/tests/cli/status.test.ts`

- [ ] **Step 1: Crear formatter.ts**

```typescript
import type { HatTask } from "../types.js"

const STATUS_ICON: Record<string, string> = {
  pending: "⏳", running: "🟢", paused: "⏸", completed: "✅", failed: "❌",
}

export function formatTask(task: HatTask): string {
  return [
    `HAT3X Command ⚡`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `${STATUS_ICON[task.status] ?? "?"} Proyecto: ${task.id}`,
    `   Modo:    ${task.controlMode}`,
    `   Estado:  ${task.status}`,
    `   Orden:   "${task.orderRaw}"`,
    `   Creado:  ${new Date(task.createdAt).toLocaleString("es-ES")}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n")
}

export function formatTaskList(tasks: HatTask[]): string {
  if (tasks.length === 0) return "HAT3X Command — Sin proyectos activos."

  const lines = ["HAT3X Command ⚡", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "PROYECTOS ACTIVOS", ""]
  for (const t of tasks) {
    lines.push(`  ${STATUS_ICON[t.status] ?? "?"}  ${t.id}  [${t.status}]  "${t.orderRaw.slice(0, 50)}"`)
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  return lines.join("\n")
}
```

- [ ] **Step 2: Escribir tests del CLI**

Crear `command/tests/cli/nueva.test.ts`:
```typescript
import { describe, it, expect, afterEach } from "vitest"
import { runNueva } from "../../src/cli/commands/nueva.js"
import { cleanTestData } from "../helpers/supabase-test-client.js"

describe("runNueva", () => {
  const ids: string[] = []
  afterEach(async () => { for (const id of ids) await cleanTestData(id); ids.length = 0 })

  it("creates a task and returns formatted output", async () => {
    const output = await runNueva({ order: "Web para test CLI", mode: undefined, clientId: undefined })
    const m = output.match(/HAT3X-\d{3}/)
    expect(m).not.toBeNull()
    if (m?.[0]) ids.push(m[0])
    expect(output).toContain("HAT3X Command")
  })

  it("respects explicit mode flag", async () => {
    const output = await runNueva({ order: "Test autopilot", mode: "autopilot", clientId: undefined })
    const m = output.match(/HAT3X-\d{3}/)
    if (m?.[0]) ids.push(m[0])
    expect(output).toContain("autopilot")
  })
})
```

Crear `command/tests/cli/status.test.ts`:
```typescript
import { describe, it, expect, afterEach } from "vitest"
import { runStatus } from "../../src/cli/commands/status.js"
import { CommandCenter } from "../../src/command-center/index.js"
import { cleanTestData } from "../helpers/supabase-test-client.js"

describe("runStatus", () => {
  const ids: string[] = []
  afterEach(async () => { for (const id of ids) await cleanTestData(id); ids.length = 0 })

  it("returns not found for nonexistent ID", async () => {
    expect(await runStatus({ id: "HAT3X-NONEXISTENT" })).toContain("no encontrado")
  })

  it("returns task details for valid ID", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Status test" })
    ids.push(task.id)
    const output = await runStatus({ id: task.id })
    expect(output).toContain(task.id)
    expect(output).toContain("pending")
  })
})
```

- [ ] **Step 3: Ejecutar tests — verificar que fallan**

```bash
cd command && npm test tests/cli/
```

Expected: FAIL

- [ ] **Step 4: Implementar commands/nueva.ts**

```typescript
import { CommandCenter } from "../../command-center/index.js"
import { formatTask } from "../formatter.js"
import type { ControlMode } from "../../types.js"

interface NuevaOptions { order: string; mode: string | undefined; clientId: string | undefined }

export async function runNueva(options: NuevaOptions): Promise<string> {
  const task = await new CommandCenter().processOrder({
    orderRaw: options.order,
    controlMode: options.mode as ControlMode | undefined,
    clientId: options.clientId,
  })
  return formatTask(task)
}
```

- [ ] **Step 5: Implementar commands/status.ts**

```typescript
import { getSupabaseClient } from "../../database/client.js"
import { formatTask, formatTaskList } from "../formatter.js"
import type { HatTask } from "../../types.js"

function toHatTask(d: Record<string, unknown>): HatTask {
  return {
    id: d["id"] as string,
    clientId: d["client_id"] as string | null,
    orderRaw: d["order_raw"] as string,
    subtasks: d["subtasks"],
    executionPlan: d["execution_plan"],
    controlMode: d["control_mode"] as HatTask["controlMode"],
    status: d["status"] as HatTask["status"],
    createdAt: d["created_at"] as string,
  }
}

export async function runStatus(options: { id?: string }): Promise<string> {
  const client = getSupabaseClient()

  if (options.id) {
    const { data, error } = await client.from("hat3x_tasks").select("*").eq("id", options.id).single()
    if (error || !data) return `Proyecto ${options.id} no encontrado.`
    return formatTask(toHatTask(data as Record<string, unknown>))
  }

  const { data } = await client.from("hat3x_tasks").select("*").in("status", ["pending", "running", "paused"]).order("created_at", { ascending: false })
  return formatTaskList((data ?? []).map((d) => toHatTask(d as Record<string, unknown>)))
}
```

- [ ] **Step 6: Implementar cli/index.ts**

```typescript
import { Command } from "commander"
import { runNueva } from "./commands/nueva.js"
import { runStatus } from "./commands/status.js"

export function buildCli(): Command {
  const program = new Command()
  program.name("oficina").description("HAT3X Command — Oficina Virtual Autónoma").version("0.1.0")

  program
    .command("nueva <orden>")
    .description("Lanzar nueva tarea")
    .option("--modo <modo>", "Modo: autopilot|phased|supervised")
    .option("--cliente <id>", "ID del cliente")
    .action(async (orden: string, opts: { modo?: string; cliente?: string }) => {
      console.log(await runNueva({ order: orden, mode: opts.modo, clientId: opts.cliente }))
    })

  program
    .command("status [id]")
    .description("Ver estado de proyectos")
    .action(async (id?: string) => { console.log(await runStatus({ id })) })

  return program
}
```

- [ ] **Step 7: Crear src/index.ts**

```typescript
import "dotenv/config"
import { buildCli } from "./cli/index.js"

buildCli().parse(process.argv)
```

- [ ] **Step 8: Ejecutar tests CLI**

```bash
cd command && npm test tests/cli/
```

Expected: 4 passed

- [ ] **Step 9: Smoke test manual**

```bash
cd command && npm run cli -- nueva "Web profesional para NovaMed con reservas y WhatsApp"
```

Expected:
```
HAT3X Command ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Proyecto: HAT3X-001
   Modo:    supervised
   Estado:  pending
   Orden:   "Web profesional para NovaMed con reservas y WhatsApp"
   Creado:  [fecha actual]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

```bash
cd command && npm run cli -- status
```

Expected: lista con el proyecto creado

- [ ] **Step 10: Commit**

```bash
git add command/src/cli/ command/src/index.ts command/tests/cli/
git commit -m "feat(command): CLI commands nueva and status"
```

---

## Task 11: Test de integración end-to-end

**Files:**
- Create: `command/tests/integration/foundation.test.ts`

- [ ] **Step 1: Escribir test de integración**

```typescript
import { describe, it, expect, afterEach } from "vitest"
import { CommandCenter } from "../../src/command-center/index.js"
import { publishEvent, createSubscriber, EVENT_TYPES } from "../../src/state-bus/index.js"
import { cleanTestData } from "../helpers/supabase-test-client.js"

describe("Foundation integration", () => {
  const ids: string[] = []
  afterEach(async () => { for (const id of ids) await cleanTestData(id); ids.length = 0 })

  it("create task → publish event → receive via subscriber", async () => {
    const task = await new CommandCenter().processOrder({ orderRaw: "Integration test" })
    ids.push(task.id)
    expect(task.status).toBe("pending")

    const received: unknown[] = []
    const sub = createSubscriber({ taskId: task.id, eventTypes: [EVENT_TYPES.TASK_STARTED], handler: (e) => { received.push(e) } })
    await sub.subscribe()

    await publishEvent({ taskId: task.id, eventType: EVENT_TYPES.TASK_STARTED, agentId: "master-orchestrator", payload: { msg: "started" } })
    await new Promise((r) => setTimeout(r, 500))
    await sub.unsubscribe()

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ eventType: EVENT_TYPES.TASK_STARTED, agentId: "master-orchestrator" })
  }, 10000)
})
```

- [ ] **Step 2: Ejecutar test de integración**

```bash
cd command && npm test tests/integration/foundation.test.ts
```

Expected: 1 passed

- [ ] **Step 3: Ejecutar toda la suite**

```bash
cd command && npm test
```

Expected: todos los tests pasan

- [ ] **Step 4: Commit final**

```bash
git add command/tests/integration/
git commit -m "test(command): foundation integration — create task + publish + realtime receive"
```

---

## Resumen del Plan

Al completar este plan tendrás:

- ✅ Supabase con todas las tablas del sistema (incluidas las de planes futuros)
- ✅ Command Center funcional — recibe órdenes, determina modo, crea tareas
- ✅ State Bus funcional — publish/subscribe via Supabase Realtime
- ✅ CLI con comandos `nueva` y `status`
- ✅ Suite de tests completa con integración E2E
- ✅ Base sólida para construir los Planes 2-5 encima

**Siguiente paso: Plan 2 — Intelligence Layer** (Task Analyzer + Capability Map + Capability Matcher + Execution Planner + Risk Assessor)

---

**Plan completo en:** `docs/superpowers/plans/2026-05-17-hat3x-command-plan-1-foundation.md`

**Dos opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — subagente fresco por tarea, review entre tareas, iteración rápida

**2. Inline Execution** — ejecución en esta sesión con checkpoints de revisión

¿Cuál prefieres?
