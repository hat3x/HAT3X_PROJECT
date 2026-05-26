# HAT3X Command — Plan 6: Scheduler (Learning Officer automático)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El Learning Officer corre automáticamente cada lunes a las 9:00 AM y José puede dispararlo desde Telegram con `/aprender` sin necesidad de abrir un terminal.

**Architecture:** `node-cron` programa una tarea semanal dentro del proceso del bot que llama a `runLearningCycle(sender)`. El mismo `sender` que usa el bot para enviar alertas de checkpoints entrega el informe de evolución. El comando `/aprender` en Telegram permite disparar el ciclo en cualquier momento. Todo se cablea en `telegram/index.ts` tras crear el bot.

**Tech Stack:** TypeScript/ESM, `node-cron` + `@types/node-cron`, grammY, `runLearningCycle` + `NotificationSender` existentes, Vitest.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `command/src/scheduler/index.ts` | Create | `startLearningScheduler(sender)` — cron semanal |
| `command/src/telegram/handlers/commands.ts` | Modify | Añadir `createHandleAprender(sender)` + actualizar `/ayuda` |
| `command/src/telegram/bot.ts` | Modify | Exportar `wireLearnCommand(bot, sender)` |
| `command/src/telegram/index.ts` | Modify | Cablear `wireLearnCommand` + `startLearningScheduler` |
| `command/tests/scheduler/index.test.ts` | Create | Tests unitarios del scheduler (mock cron) |

---

### Task 1: Instalar node-cron

**Files:**
- Modify: `command/package.json` (gestionado por npm)

- [ ] **Step 1: Instalar dependencias**

```bash
cd command && npm install node-cron && npm install --save-dev @types/node-cron
```

Expected: `added N packages`

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd command && npx tsc --noEmit
```

Expected: sin errores

- [ ] **Step 3: Commit**

```bash
git add command/package.json command/package-lock.json
git commit -m "chore(deps): add node-cron for learning scheduler"
```

---

### Task 2: Crear LearningScheduler

**Files:**
- Create: `command/src/scheduler/index.ts`
- Create: `command/tests/scheduler/index.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `command/tests/scheduler/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}))
vi.mock("../../src/learning-officer/index.js", () => ({
  runLearningCycle: vi.fn().mockResolvedValue("ok"),
}))

import cron from "node-cron"
import { runLearningCycle } from "../../src/learning-officer/index.js"
import { startLearningScheduler } from "../../src/scheduler/index.js"
import type { NotificationSender } from "../../src/telegram/notifications/sender.js"

function makeSender(): NotificationSender {
  return { sendEvolutionReport: vi.fn() } as unknown as NotificationSender
}

describe("startLearningScheduler", () => {
  beforeEach(() => { vi.clearAllMocks() })

  afterEach(() => {
    delete process.env["LEARNING_SCHEDULE"]
  })

  it("schedules with default Monday 9am expression", () => {
    startLearningScheduler(makeSender())
    expect(cron.schedule).toHaveBeenCalledWith("0 9 * * 1", expect.any(Function))
  })

  it("uses LEARNING_SCHEDULE env var when set", () => {
    process.env["LEARNING_SCHEDULE"] = "0 8 * * 5"
    startLearningScheduler(makeSender())
    expect(cron.schedule).toHaveBeenCalledWith("0 8 * * 5", expect.any(Function))
  })

  it("calls runLearningCycle with the sender when cron fires", async () => {
    const sender = makeSender()
    startLearningScheduler(sender)
    const [, callback] = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls[0] as [string, () => Promise<void>]
    await callback()
    expect(runLearningCycle).toHaveBeenCalledWith(sender)
  })

  it("does not throw if runLearningCycle rejects", async () => {
    vi.mocked(runLearningCycle).mockRejectedValueOnce(new Error("DB down"))
    startLearningScheduler(makeSender())
    const [, callback] = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls[0] as [string, () => Promise<void>]
    await expect(callback()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Ejecutar para verificar que falla**

```bash
cd command && npx vitest run tests/scheduler/index.test.ts
```

Expected: FAIL — módulo no encontrado

- [ ] **Step 3: Implementar el scheduler**

Crear `command/src/scheduler/index.ts`:

```typescript
import cron from "node-cron"
import type { NotificationSender } from "../telegram/notifications/sender.js"
import { runLearningCycle } from "../learning-officer/index.js"

export function startLearningScheduler(sender: NotificationSender): void {
  const schedule = process.env["LEARNING_SCHEDULE"] ?? "0 9 * * 1"
  cron.schedule(schedule, async () => {
    try {
      await runLearningCycle(sender)
    } catch (err) {
      console.error("[LearningScheduler] Error:", err instanceof Error ? err.message : String(err))
    }
  })
  console.log(`📅 LearningScheduler activo — schedule: ${schedule}`)
}
```

- [ ] **Step 4: Ejecutar para verificar que pasa**

```bash
cd command && npx vitest run tests/scheduler/index.test.ts
```

Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add command/src/scheduler/index.ts command/tests/scheduler/index.test.ts
git commit -m "feat(scheduler): add LearningScheduler — weekly auto aprender"
```

---

### Task 3: Añadir /aprender a Telegram y cablear todo

**Files:**
- Modify: `command/src/telegram/handlers/commands.ts`
- Modify: `command/src/telegram/bot.ts`
- Modify: `command/src/telegram/index.ts`
- Modify: `command/tests/telegram/commands.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Abrir `command/tests/telegram/commands.test.ts`. Añadir al bloque de mocks al inicio (después de `vi.mock("../../src/command-center/index")`):

```typescript
vi.mock("../../src/learning-officer/index.js", () => ({
  runLearningCycle: vi.fn().mockResolvedValue("🧠 informe"),
}))
```

Añadir al final del archivo (antes del cierre del módulo):

```typescript
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
```

- [ ] **Step 2: Ejecutar para verificar que falla**

```bash
cd command && npx vitest run tests/telegram/commands.test.ts
```

Expected: FAIL — `createHandleAprender` not exported

- [ ] **Step 3: Añadir createHandleAprender a commands.ts**

Abrir `command/src/telegram/handlers/commands.ts`. Añadir imports al inicio del archivo (junto a los imports existentes):

```typescript
import { runLearningCycle } from "../../learning-officer/index.js"
import type { NotificationSender } from "../notifications/sender.js"
```

Añadir esta función al final del archivo (después de `handleAyuda`):

```typescript
export function createHandleAprender(sender: NotificationSender) {
  return async (ctx: Context): Promise<void> => {
    await ctx.reply("🧠 Ejecutando ciclo de aprendizaje...")
    try {
      await runLearningCycle(sender)
    } catch (err) {
      await ctx.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
```

En `handleAyuda`, actualizar la constante `help` para incluir `/aprender`:

```typescript
  const help = [
    "*HAT3X Command — Comandos disponibles:*",
    "",
    "/status — Ver últimas 5 tareas",
    "/nuevo <orden> — Crear nueva tarea",
    "/plan <id> — Ver plan de ejecución",
    "/checkpoints — Ver checkpoints pendientes",
    "/aprobar <id> [feedback] — Aprobar checkpoint",
    "/rechazar <id> <motivo> — Rechazar checkpoint",
    "/aprender — Ejecutar ciclo de aprendizaje",
    "/ayuda — Este mensaje",
  ].join("\n")
```

- [ ] **Step 4: Ejecutar para verificar que pasa**

```bash
cd command && npx vitest run tests/telegram/commands.test.ts
```

Expected: todos los tests pasan

- [ ] **Step 5: Añadir wireLearnCommand a bot.ts**

Abrir `command/src/telegram/bot.ts`. Añadir import al inicio (junto a los imports existentes):

```typescript
import { createHandleAprender } from "./handlers/commands.js"
import type { NotificationSender } from "./notifications/sender.js"
```

Añadir esta función exportada al final del archivo (después de `startGlobalSubscriber`):

```typescript
export function wireLearnCommand(bot: Bot, sender: NotificationSender): void {
  bot.command("aprender", createHandleAprender(sender))
}
```

- [ ] **Step 6: Reescribir telegram/index.ts**

Reemplazar el contenido completo de `command/src/telegram/index.ts` con:

```typescript
import { config } from "dotenv"
config({ path: ".env" })

import { createBot, startGlobalSubscriber, wireLearnCommand } from "./bot.js"
import { NotificationSender } from "./notifications/sender.js"
import { startLearningScheduler } from "../scheduler/index.js"

async function startBot(): Promise<void> {
  const bot = createBot()
  const sender = new NotificationSender(bot)
  const globalSub = startGlobalSubscriber(bot)

  wireLearnCommand(bot, sender)
  startLearningScheduler(sender)

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

- [ ] **Step 7: Ejecutar suite completa**

```bash
cd command && npm test
```

Expected: todos los tests pasan, sin regresiones

- [ ] **Step 8: Commit final**

```bash
git add command/src/scheduler/index.ts command/tests/scheduler/index.test.ts command/src/telegram/handlers/commands.ts command/src/telegram/bot.ts command/src/telegram/index.ts command/tests/telegram/commands.test.ts command/package.json command/package-lock.json
git commit -m "feat(telegram): add /aprender command + wire LearningScheduler into bot"
```
