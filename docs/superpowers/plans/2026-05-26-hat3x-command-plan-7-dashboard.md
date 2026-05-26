# HAT3X Command — Plan 7: Dashboard web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un dashboard interno en `/dashboard` dentro de `hat3x-web` que muestra en tiempo real el estado de tareas, checkpoints pendientes y el historial de evolución del Learning Officer. Solo accesible con contraseña.

**Architecture:** Next.js 14 App Router con Server Components que consultan Supabase directamente usando la Service Role Key (sin exposición al cliente). Protección por cookie: el middleware comprueba la cookie `dashboard-session`; si no está presente o no coincide con `DASHBOARD_TOKEN`, redirige a `/dashboard/login`. El dashboard es de solo lectura — las aprobaciones siguen haciéndose desde Telegram.

**Tech Stack:** Next.js 14 (App Router), `@supabase/supabase-js`, Tailwind CSS con el sistema de colores existente (`surface-1/2/3`, `purple-primary`, `text-primary/secondary`), TypeScript, Vitest.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `hat3x-web/.env.local.example` | Create | Plantilla de variables de entorno |
| `hat3x-web/lib/supabase.ts` | Create | `getServerClient()` — Supabase con service role key |
| `hat3x-web/lib/dashboard/types.ts` | Create | Tipos: `DashTask`, `DashCheckpoint`, `EvolutionEntry`, `EvolutionProposal` |
| `hat3x-web/lib/dashboard/formatters.ts` | Create | `statusColor()`, `impactColor()`, `formatDate()` — funciones puras |
| `hat3x-web/middleware.ts` | Create | Protección de rutas `/dashboard/*` por cookie |
| `hat3x-web/app/api/dashboard/auth/route.ts` | Create | POST: valida contraseña, pone cookie, redirige |
| `hat3x-web/app/dashboard/login/page.tsx` | Create | Formulario de login (Client Component) |
| `hat3x-web/app/dashboard/layout.tsx` | Create | Layout con barra de navegación interna |
| `hat3x-web/app/dashboard/page.tsx` | Create | Resumen: contadores por estado, checkpoints pendientes, última evolución |
| `hat3x-web/app/dashboard/tasks/page.tsx` | Create | Lista de tareas paginada |
| `hat3x-web/app/dashboard/tasks/[id]/page.tsx` | Create | Detalle de tarea: subtasks, plan, checkpoints |
| `hat3x-web/app/dashboard/checkpoints/page.tsx` | Create | Todos los checkpoints con filtro por estado |
| `hat3x-web/app/dashboard/evolution/page.tsx` | Create | Historial evolution_log + propuestas pendientes |
| `hat3x-web/tests/dashboard/formatters.test.ts` | Create | Tests unitarios de funciones puras |

---

### Task 1: Instalar Supabase y configurar entorno

**Files:**
- Modify: `hat3x-web/package.json`
- Create: `hat3x-web/.env.local.example`

- [ ] **Step 1: Instalar @supabase/supabase-js**

```bash
cd hat3x-web && npm install @supabase/supabase-js
```

Expected: `added N packages`

- [ ] **Step 2: Crear .env.local.example**

Crear `hat3x-web/.env.local.example`:

```
# Supabase — usa la URL y Service Role Key del proyecto HAT3X
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Contraseña de acceso al dashboard interno
DASHBOARD_TOKEN=una-contraseña-segura
```

- [ ] **Step 3: Verificar que TypeScript compila**

```bash
cd hat3x-web && npx tsc --noEmit
```

Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add hat3x-web/package.json hat3x-web/package-lock.json hat3x-web/.env.local.example
git commit -m "chore(dashboard): install @supabase/supabase-js, add env example"
```

---

### Task 2: Supabase server client + tipos + formatters

**Files:**
- Create: `hat3x-web/lib/supabase.ts`
- Create: `hat3x-web/lib/dashboard/types.ts`
- Create: `hat3x-web/lib/dashboard/formatters.ts`
- Create: `hat3x-web/tests/dashboard/formatters.test.ts`

- [ ] **Step 1: Escribir tests de formatters que fallan**

Crear `hat3x-web/tests/dashboard/formatters.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { statusColor, impactColor, formatDate } from "../../lib/dashboard/formatters"

describe("statusColor", () => {
  it("returns green class for completed", () => {
    expect(statusColor("completed")).toContain("green")
  })
  it("returns yellow class for running", () => {
    expect(statusColor("running")).toContain("yellow")
  })
  it("returns red class for failed", () => {
    expect(statusColor("failed")).toContain("red")
  })
  it("returns gray class for unknown status", () => {
    expect(statusColor("unknown")).toContain("gray")
  })
})

describe("impactColor", () => {
  it("returns red class for high", () => {
    expect(impactColor("high")).toContain("red")
  })
  it("returns yellow class for medium", () => {
    expect(impactColor("medium")).toContain("yellow")
  })
  it("returns blue class for low", () => {
    expect(impactColor("low")).toContain("blue")
  })
})

describe("formatDate", () => {
  it("formats ISO date to DD/MM/YYYY HH:mm", () => {
    expect(formatDate("2026-05-26T09:00:00Z")).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
  it("returns guión for null", () => {
    expect(formatDate(null)).toBe("—")
  })
})
```

- [ ] **Step 2: Ejecutar para verificar que falla**

```bash
cd hat3x-web && npx vitest run tests/dashboard/formatters.test.ts
```

Expected: FAIL — módulo no encontrado

- [ ] **Step 3: Crear lib/supabase.ts**

Crear `hat3x-web/lib/supabase.ts`:

```typescript
import { createClient } from "@supabase/supabase-js"

export function getServerClient() {
  const url = process.env["SUPABASE_URL"]
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]
  if (url == null || key == null) {
    throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias")
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
```

- [ ] **Step 4: Crear lib/dashboard/types.ts**

Crear `hat3x-web/lib/dashboard/types.ts`:

```typescript
export interface DashTask {
  id: string
  client_id: string | null
  order_raw: string
  status: string
  control_mode: string
  created_at: string
}

export interface DashCheckpoint {
  id: string
  task_id: string
  after_phase: number
  reason: string
  required_approval: string
  status: string
  feedback: string | null
  triggered_at: string
  resolved_at: string | null
}

export interface EvolutionEntry {
  id: string
  project_id: string | null
  agent_id: string | null
  vertical: string | null
  change_type: string
  description: string
  before_value: unknown
  after_value: unknown
  applied_at: string
  applied_by: string
}

export interface EvolutionProposal {
  id: string
  description: string
  impact: string
  evidence: unknown
  status: string
  feedback: string | null
  created_at: string
  resolved_at: string | null
}
```

- [ ] **Step 5: Crear lib/dashboard/formatters.ts**

Crear `hat3x-web/lib/dashboard/formatters.ts`:

```typescript
const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-400 bg-green-400/10",
  running:   "text-yellow-400 bg-yellow-400/10",
  pending:   "text-blue-400 bg-blue-400/10",
  failed:    "text-red-400 bg-red-400/10",
}

const IMPACT_COLORS: Record<string, string> = {
  high:   "text-red-400 bg-red-400/10",
  medium: "text-yellow-400 bg-yellow-400/10",
  low:    "text-blue-400 bg-blue-400/10",
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "text-gray-400 bg-gray-400/10"
}

export function impactColor(impact: string): string {
  return IMPACT_COLORS[impact] ?? "text-gray-400 bg-gray-400/10"
}

export function formatDate(iso: string | null): string {
  if (iso == null) return "—"
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}
```

- [ ] **Step 6: Ejecutar para verificar que pasa**

```bash
cd hat3x-web && npx vitest run tests/dashboard/formatters.test.ts
```

Expected: 9 tests pass

- [ ] **Step 7: Commit**

```bash
git add hat3x-web/lib/supabase.ts hat3x-web/lib/dashboard/types.ts hat3x-web/lib/dashboard/formatters.ts hat3x-web/tests/dashboard/formatters.test.ts
git commit -m "feat(dashboard): add Supabase server client, types, and formatter utilities"
```

---

### Task 3: Middleware de autenticación + login

**Files:**
- Create: `hat3x-web/middleware.ts`
- Create: `hat3x-web/app/api/dashboard/auth/route.ts`
- Create: `hat3x-web/app/dashboard/login/page.tsx`

- [ ] **Step 1: Crear middleware.ts**

Crear `hat3x-web/middleware.ts`:

```typescript
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith("/dashboard") || pathname.startsWith("/dashboard/login")) {
    return NextResponse.next()
  }

  const token = process.env["DASHBOARD_TOKEN"]
  const cookie = request.cookies.get("dashboard-session")?.value

  if (token == null || cookie !== token) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/dashboard/login"
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*"],
}
```

- [ ] **Step 2: Crear API route de auth**

Crear `hat3x-web/app/api/dashboard/auth/route.ts`:

```typescript
import { NextResponse } from "next/server"

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json() as { password?: string }
  const token = process.env["DASHBOARD_TOKEN"]

  if (token == null || body.password !== token) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set("dashboard-session", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  })
  return response
}
```

- [ ] **Step 3: Crear página de login**

Crear `hat3x-web/app/dashboard/login/page.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage(): JSX.Element {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/dashboard/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push("/dashboard")
      router.refresh()
    } else {
      const data = await res.json() as { error?: string }
      setError(data.error ?? "Error de autenticación")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center">
      <div className="bg-surface-2 border border-border-subtle rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-text-primary text-xl font-semibold mb-6">HAT3X Dashboard</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-sm mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-3 border border-border-subtle rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-purple-primary"
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-primary text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 hover:bg-purple-light transition-colors"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar que TypeScript compila**

```bash
cd hat3x-web && npx tsc --noEmit
```

Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add hat3x-web/middleware.ts hat3x-web/app/api/dashboard/auth/route.ts hat3x-web/app/dashboard/login/page.tsx
git commit -m "feat(dashboard): add middleware auth + login page"
```

---

### Task 4: Layout del dashboard + Overview

**Files:**
- Create: `hat3x-web/app/dashboard/layout.tsx`
- Create: `hat3x-web/app/dashboard/page.tsx`

- [ ] **Step 1: Crear layout.tsx**

Crear `hat3x-web/app/dashboard/layout.tsx`:

```tsx
import Link from "next/link"

const NAV_LINKS = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/dashboard/tasks", label: "Tareas" },
  { href: "/dashboard/checkpoints", label: "Checkpoints" },
  { href: "/dashboard/evolution", label: "Evolución" },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="min-h-screen bg-surface-1 text-text-primary">
      <nav className="border-b border-border-subtle bg-surface-2 px-6 py-3 flex items-center gap-6">
        <span className="text-purple-primary font-semibold text-sm tracking-wide">HAT3X CMD</span>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-text-secondary hover:text-text-primary text-sm transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <main className="p-6 max-w-content mx-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Crear page.tsx (Overview)**

Crear `hat3x-web/app/dashboard/page.tsx`:

```tsx
import { getServerClient } from "@/lib/supabase"
import { formatDate } from "@/lib/dashboard/formatters"
import type { DashTask, EvolutionEntry } from "@/lib/dashboard/types"

async function getOverviewData() {
  const supabase = getServerClient()

  const [tasksRes, checkpointsRes, lastEvoRes] = await Promise.all([
    supabase.from("hat3x_tasks").select("status"),
    supabase
      .from("hat3x_checkpoints")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("evolution_log")
      .select("applied_at, description")
      .order("applied_at", { ascending: false })
      .limit(1),
  ])

  const tasks = (tasksRes.data ?? []) as Pick<DashTask, "status">[]
  const byStatus = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})

  const lastEvo = ((lastEvoRes.data ?? []) as Pick<EvolutionEntry, "applied_at" | "description">[])[0]

  return {
    byStatus,
    total: tasks.length,
    pendingCheckpoints: checkpointsRes.count ?? 0,
    lastEvo,
  }
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const { byStatus, total, pendingCheckpoints, lastEvo } = await getOverviewData()

  const statCards = [
    { label: "Total tareas", value: total },
    { label: "Completadas", value: byStatus["completed"] ?? 0 },
    { label: "En curso", value: byStatus["running"] ?? 0 },
    { label: "Pendientes", value: byStatus["pending"] ?? 0 },
    { label: "Checkpoints pendientes", value: pendingCheckpoints },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-text-primary text-2xl font-semibold">Resumen</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-surface-2 border border-border-subtle rounded-xl p-4">
            <p className="text-text-secondary text-xs mb-1">{card.label}</p>
            <p className="text-text-primary text-3xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>
      {lastEvo != null && (
        <div className="bg-surface-2 border border-border-subtle rounded-xl p-4">
          <p className="text-text-secondary text-xs mb-1">Última evolución</p>
          <p className="text-text-primary text-sm">{lastEvo.description}</p>
          <p className="text-text-muted text-xs mt-1">{formatDate(lastEvo.applied_at)}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar que TypeScript compila**

```bash
cd hat3x-web && npx tsc --noEmit
```

Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add hat3x-web/app/dashboard/layout.tsx hat3x-web/app/dashboard/page.tsx
git commit -m "feat(dashboard): add layout nav + overview stats page"
```

---

### Task 5: Tasks list + Task detail

**Files:**
- Create: `hat3x-web/app/dashboard/tasks/page.tsx`
- Create: `hat3x-web/app/dashboard/tasks/[id]/page.tsx`

- [ ] **Step 1: Crear tasks/page.tsx**

Crear `hat3x-web/app/dashboard/tasks/page.tsx`:

```tsx
import Link from "next/link"
import { getServerClient } from "@/lib/supabase"
import { statusColor, formatDate } from "@/lib/dashboard/formatters"
import type { DashTask } from "@/lib/dashboard/types"

export default async function TasksPage(): Promise<JSX.Element> {
  const supabase = getServerClient()
  const { data } = await supabase
    .from("hat3x_tasks")
    .select("id, client_id, order_raw, status, control_mode, created_at")
    .order("created_at", { ascending: false })
    .limit(50)

  const tasks = (data ?? []) as DashTask[]

  return (
    <div className="space-y-4">
      <h1 className="text-text-primary text-2xl font-semibold">Tareas</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-secondary border-b border-border-subtle">
              <th className="text-left py-2 pr-4">ID</th>
              <th className="text-left py-2 pr-4">Orden</th>
              <th className="text-left py-2 pr-4">Estado</th>
              <th className="text-left py-2 pr-4">Modo</th>
              <th className="text-left py-2">Creada</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-b border-border-subtle hover:bg-surface-2 transition-colors">
                <td className="py-3 pr-4">
                  <Link
                    href={`/dashboard/tasks/${task.id}`}
                    className="text-purple-light hover:underline font-mono text-xs"
                  >
                    {task.id}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-text-primary max-w-xs truncate">{task.order_raw}</td>
                <td className="py-3 pr-4">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(task.status)}`}>
                    {task.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-text-secondary">{task.control_mode}</td>
                <td className="py-3 text-text-muted">{formatDate(task.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && (
          <p className="text-text-muted text-sm py-8 text-center">Sin tareas todavía</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear tasks/[id]/page.tsx**

Crear `hat3x-web/app/dashboard/tasks/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase"
import { statusColor, formatDate } from "@/lib/dashboard/formatters"
import type { DashCheckpoint } from "@/lib/dashboard/types"

interface PageProps {
  params: { id: string }
}

export default async function TaskDetailPage({ params }: PageProps): Promise<JSX.Element> {
  const supabase = getServerClient()

  const [taskRes, checkpointsRes] = await Promise.all([
    supabase
      .from("hat3x_tasks")
      .select("id, order_raw, status, control_mode, created_at, subtasks, execution_plan")
      .eq("id", params.id)
      .single(),
    supabase
      .from("hat3x_checkpoints")
      .select("*")
      .eq("task_id", params.id)
      .order("triggered_at", { ascending: true }),
  ])

  if (taskRes.error != null || taskRes.data == null) notFound()

  const task = taskRes.data as {
    id: string
    order_raw: string
    status: string
    control_mode: string
    created_at: string
    subtasks: Array<{ vertical: string; description: string }> | null
    execution_plan: { phases?: Array<{ name: string; subtasks: unknown[] }> } | null
  }

  const checkpoints = (checkpointsRes.data ?? []) as DashCheckpoint[]
  const subtasks = task.subtasks ?? []
  const phases = task.execution_plan?.phases ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-text-primary text-2xl font-semibold font-mono">{task.id}</h1>
          <p className="text-text-secondary mt-1">{task.order_raw}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor(task.status)}`}>
          {task.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-surface-2 border border-border-subtle rounded-xl p-4">
          <p className="text-text-secondary text-xs mb-1">Modo de control</p>
          <p className="text-text-primary">{task.control_mode}</p>
        </div>
        <div className="bg-surface-2 border border-border-subtle rounded-xl p-4">
          <p className="text-text-secondary text-xs mb-1">Creada</p>
          <p className="text-text-primary">{formatDate(task.created_at)}</p>
        </div>
      </div>

      {subtasks.length > 0 && (
        <section>
          <h2 className="text-text-primary font-medium mb-3">Subtasks ({subtasks.length})</h2>
          <ul className="space-y-2">
            {subtasks.map((st, i) => (
              <li key={i} className="bg-surface-2 border border-border-subtle rounded-lg px-4 py-2 text-sm text-text-secondary">
                <span className="text-purple-light mr-2">[{st.vertical}]</span>{st.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {phases.length > 0 && (
        <section>
          <h2 className="text-text-primary font-medium mb-3">Plan de ejecución ({phases.length} fases)</h2>
          <ol className="space-y-2">
            {phases.map((phase, i) => (
              <li key={i} className="bg-surface-2 border border-border-subtle rounded-lg px-4 py-2 text-sm">
                <span className="text-text-secondary">Fase {i + 1}:</span>{" "}
                <span className="text-text-primary">{phase.name}</span>
                <span className="text-text-muted ml-2">({phase.subtasks.length} subtasks)</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {checkpoints.length > 0 && (
        <section>
          <h2 className="text-text-primary font-medium mb-3">Checkpoints ({checkpoints.length})</h2>
          <ul className="space-y-2">
            {checkpoints.map((cp) => (
              <li key={cp.id} className="bg-surface-2 border border-border-subtle rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-text-muted">{cp.id}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(cp.status)}`}>
                    {cp.status}
                  </span>
                </div>
                <p className="text-text-secondary">{cp.reason}</p>
                {cp.feedback != null && (
                  <p className="text-text-muted mt-1 italic">"{cp.feedback}"</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar que TypeScript compila**

```bash
cd hat3x-web && npx tsc --noEmit
```

Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add hat3x-web/app/dashboard/tasks/page.tsx "hat3x-web/app/dashboard/tasks/[id]/page.tsx"
git commit -m "feat(dashboard): add tasks list + task detail pages"
```

---

### Task 6: Checkpoints + Evolution + smoke test

**Files:**
- Create: `hat3x-web/app/dashboard/checkpoints/page.tsx`
- Create: `hat3x-web/app/dashboard/evolution/page.tsx`

- [ ] **Step 1: Crear checkpoints/page.tsx**

Crear `hat3x-web/app/dashboard/checkpoints/page.tsx`:

```tsx
import Link from "next/link"
import { getServerClient } from "@/lib/supabase"
import { statusColor, formatDate } from "@/lib/dashboard/formatters"
import type { DashCheckpoint } from "@/lib/dashboard/types"

function CheckpointRow({ cp }: { cp: DashCheckpoint }): JSX.Element {
  return (
    <tr className="border-b border-border-subtle hover:bg-surface-2 transition-colors">
      <td className="py-3 pr-4 font-mono text-xs text-text-muted">{cp.id}</td>
      <td className="py-3 pr-4">
        <Link href={`/dashboard/tasks/${cp.task_id}`} className="text-purple-light hover:underline font-mono text-xs">
          {cp.task_id}
        </Link>
      </td>
      <td className="py-3 pr-4 text-text-secondary text-sm max-w-xs truncate">{cp.reason}</td>
      <td className="py-3 pr-4">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(cp.status)}`}>
          {cp.status}
        </span>
      </td>
      <td className="py-3 text-text-muted text-xs">{formatDate(cp.triggered_at)}</td>
    </tr>
  )
}

function CheckpointTable({ items, title }: { items: DashCheckpoint[]; title: string }): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-text-primary font-medium">{title} ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-text-muted text-sm py-4">Sin registros</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-secondary border-b border-border-subtle">
                <th className="text-left py-2 pr-4">ID</th>
                <th className="text-left py-2 pr-4">Tarea</th>
                <th className="text-left py-2 pr-4">Motivo</th>
                <th className="text-left py-2 pr-4">Estado</th>
                <th className="text-left py-2">Creado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((cp) => <CheckpointRow key={cp.id} cp={cp} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default async function CheckpointsPage(): Promise<JSX.Element> {
  const supabase = getServerClient()
  const { data } = await supabase
    .from("hat3x_checkpoints")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(100)

  const checkpoints = (data ?? []) as DashCheckpoint[]
  const pending = checkpoints.filter((c) => c.status === "pending")
  const resolved = checkpoints.filter((c) => c.status !== "pending")

  return (
    <div className="space-y-8">
      <h1 className="text-text-primary text-2xl font-semibold">Checkpoints</h1>
      <CheckpointTable items={pending} title="Pendientes" />
      <CheckpointTable items={resolved} title="Resueltos" />
    </div>
  )
}
```

- [ ] **Step 2: Crear evolution/page.tsx**

Crear `hat3x-web/app/dashboard/evolution/page.tsx`:

```tsx
import { getServerClient } from "@/lib/supabase"
import { impactColor, formatDate } from "@/lib/dashboard/formatters"
import type { EvolutionEntry, EvolutionProposal } from "@/lib/dashboard/types"

export default async function EvolutionPage(): Promise<JSX.Element> {
  const supabase = getServerClient()

  const [logRes, proposalsRes] = await Promise.all([
    supabase
      .from("evolution_log")
      .select("id, project_id, agent_id, vertical, change_type, description, applied_at, applied_by")
      .order("applied_at", { ascending: false })
      .limit(30),
    supabase
      .from("evolution_proposals")
      .select("id, description, impact, status, feedback, created_at, resolved_at")
      .order("created_at", { ascending: false }),
  ])

  const entries = (logRes.data ?? []) as EvolutionEntry[]
  const proposals = (proposalsRes.data ?? []) as EvolutionProposal[]
  const pendingProposals = proposals.filter((p) => p.status === "pending")

  return (
    <div className="space-y-8">
      <h1 className="text-text-primary text-2xl font-semibold">Evolución</h1>

      {pendingProposals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-text-primary font-medium">Propuestas pendientes ({pendingProposals.length})</h2>
          <div className="space-y-3">
            {pendingProposals.map((p) => (
              <div key={p.id} className="bg-surface-2 border border-border-subtle rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-xs text-text-muted">{p.id}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${impactColor(p.impact)}`}>
                    {p.impact}
                  </span>
                </div>
                <p className="text-text-primary text-sm">{p.description}</p>
                <p className="text-text-muted text-xs mt-2">Usa /aprobar_prop {p.id} en Telegram para aprobar</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-text-primary font-medium">Historial de cambios ({entries.length})</h2>
        {entries.length === 0 ? (
          <p className="text-text-muted text-sm py-4">Sin cambios registrados todavía</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-surface-2 border border-border-subtle rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-purple-light text-xs">{entry.change_type}</span>
                  <span className="text-text-muted text-xs">{formatDate(entry.applied_at)}</span>
                </div>
                <p className="text-text-secondary">{entry.description}</p>
                {entry.vertical != null && (
                  <p className="text-text-muted text-xs mt-1">Vertical: {entry.vertical}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Ejecutar tests de hat3x-web**

```bash
cd hat3x-web && npm test
```

Expected: 9 tests pass (formatters.test.ts)

- [ ] **Step 4: Verificar que TypeScript compila**

```bash
cd hat3x-web && npx tsc --noEmit
```

Expected: sin errores

- [ ] **Step 5: Smoke test en dev**

```bash
cd hat3x-web && cp .env.local.example .env.local
# Editar .env.local con las variables reales: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DASHBOARD_TOKEN
npm run dev
```

Verificar:
- http://localhost:3000/dashboard → redirige a `/dashboard/login`
- Ingresar la contraseña → accede al dashboard
- Navegar: Resumen, Tareas, Checkpoints, Evolución → todas las páginas cargan sin errores

- [ ] **Step 6: Commit final**

```bash
git add hat3x-web/app/dashboard/checkpoints/page.tsx hat3x-web/app/dashboard/evolution/page.tsx
git commit -m "feat(dashboard): add checkpoints and evolution pages — Plan 7 complete"
```
