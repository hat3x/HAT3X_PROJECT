# HAT3X Command — Especificación de Diseño
**Fecha:** 2026-05-17
**Estado:** Pendiente de revisión
**Autor:** Jose M. + Claude (brainstorming session)

---

## 1. Visión General

HAT3X Command es la oficina virtual autónoma de HAT3X. Recibe una orden en lenguaje natural y coordina automáticamente todos los agentes y skills disponibles para ejecutarla — sin intervención humana salvo en decisiones de alto impacto.

### Principios de Diseño

- **Composable sobre jerárquico** — cualquier combinación de agentes para cualquier tarea
- **Máximo potencial** — 80-90% de los ~600 skills y ~50 agentes activos en cada proyecto
- **Autónomo con supervisión selectiva** — trabaja solo, interrumpe solo cuando importa
- **Evolutivo** — cada proyecto hace al sistema más inteligente
- **Stack HAT3X** — usa todas las herramientas existentes (n8n, Supabase, Twilio, RetellAI)

---

## 2. Arquitectura — 7 Capas

```
CAPA 1  Entrada          CLI · Web Dashboard · Telegram (Jose) · WhatsApp (clientes)
CAPA 2  Command Center   Recibe orden · Carga memoria · Crea tarea · Define modo
CAPA 3  Intelligence     Task Analyzer · Capability Matcher · Execution Planner · Risk Assessor
CAPA 4  Agent Pool       HAT3X PMs · ECC Agents · Superpowers · Skills Engine (600+)
CAPA 5  Coordination     State Bus · Team Meetings · Human Checkpoints · Progress Tracker
CAPA 6  Memory           Supabase · Memoria por agente · Learning Officer · Capability Map
CAPA 7  Integrations     n8n · Supabase · Twilio · RetellAI · GitHub · Cal.com · HubSpot
```

---

## 3. Capa 2 — Command Center

Punto de entrada unificado para cualquier orden.

**Responsabilidades:**
- Recibir orden desde cualquier canal (CLI, Web, Telegram)
- Cargar memoria del cliente desde Supabase
- Cargar historial de proyectos similares
- Crear registro de tarea con ID único (`HAT3X-NNN`)
- Determinar modo de control según contexto

**Modos de control:**
| Modo | Descripción | Cuándo se usa |
|---|---|---|
| `autopilot` | Sin checkpoints, entrega directa | Tareas internas, baja complejidad |
| `phased` | Checkpoint al final de cada fase clave | Proyectos de cliente estándar |
| `supervised` | Visibilidad total, intervención en cualquier punto | Proyectos VIP, alta complejidad |
| `configurable` | Jose elige el modo al lanzar cada tarea | Por defecto |

**Schema Supabase:**
```sql
CREATE TABLE hat3x_tasks (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  order_raw TEXT,
  subtasks JSONB,
  execution_plan JSONB,
  control_mode TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. Capa 3 — Intelligence Layer

El cerebro del sistema. Convierte una orden en un plan de ejecución optimizado en menos de 60 segundos.

### 4.1 Task Analyzer

Descompone la orden en subtareas atómicas estructuradas.

```typescript
interface Subtask {
  id: string                     // "ST-089-001"
  type: SubtaskType
  title: string
  description: string
  context: {
    technology: string[]
    sector: string
    complexity: "low" | "medium" | "high"
    hasExternalImpact: boolean
    isIrreversible: boolean
  }
  dependencies: string[]
  estimatedHours: number
  deliverable: string
}

type SubtaskType =
  | "discovery" | "design" | "development" | "integration"
  | "testing" | "security" | "performance" | "seo"
  | "deployment" | "documentation" | "communication"
```

### 4.2 Capability Matcher

Para cada subtarea, selecciona agentes y skills óptimos del pool completo.

**Scoring:**
```
score = base_score (Capability Map)
      + sector_bonus (especialización sectorial del agente)
      + history_boost (éxito en proyectos anteriores similares)
      + recency_weight (proyectos recientes pesan más)
```

**Skills siempre obligatorios en desarrollo:**
- `superpowers:test-driven-development` — antes de escribir código
- `everything-claude-code:code-reviewer` — post código
- `everything-claude-code:security-reviewer` — post código
- `superpowers:verification-before-completion` — antes de marcar completado

**Skills siempre obligatorios en deploy:**
- `smoke-check`
- `superpowers:verification-before-completion`

### 4.3 Execution Planner

Construye el grafo de dependencias y maximiza paralelismo.

**Algoritmo:**
1. Grafo dirigido de dependencias entre subtareas
2. Topological sort → orden obligatorio
3. Agrupar nodos sin dependencias → fase paralela
4. Calcular ruta crítica
5. Asignar fases e inyectar checkpoints del Risk Assessor

### 4.4 Risk Assessor

Inyecta checkpoints humanos según reglas de riesgo.

| Trigger | Acción | Canal |
|---|---|---|
| Cliente nuevo | Checkpoint post-discovery | Telegram |
| Diseño completado | Checkpoint aprobación diseño | Web + Telegram |
| Antes de deploy producción | Checkpoint validación final | Web + Telegram |
| Acción irreversible | Checkpoint pre-acción | Telegram |
| Comunicación saliente al cliente | Checkpoint revisión | Web |
| Nueva integración no aprobada | Pausa y solicita aprobación | Telegram |
| Sin consenso en reunión de equipo | Escalada al humano | Telegram |

---

## 5. Capa 4 — Agent Pool + Skills Engine

### Agent Pool

Todos los agentes son ciudadanos de primera clase. No hay jerarquía fija — se componen según la tarea.

**HAT3X PMs:** PM Automatizaciones, PM Voz, PM Chatbots, PM Webs & Apps, PM Operaciones + 16 agentes en `agents/`

**Everything-Claude-Code:** architect, code-reviewer, security-reviewer, performance-optimizer, tdd-guide, typescript-reviewer, database-reviewer, e2e-runner, planner, doc-updater, build-error-resolver

**Superpowers:** brainstorming, writing-plans, executing-plans, systematic-debugging, test-driven-development, verification-before-completion

**Agentes en `agents/`:** design, engineering, marketing, sales, operations, product, strategy, testing, support, integrations, academic, spatial-computing

### Skills Engine

600+ skills invocados por agentes como herramientas en el momento correcto.

**Skills HAT3X core (11):** nextjs-shadcn, react-query-patterns, typescript-strict, supabase-rls, performance-web, accessibility-wcag, ui-ux-patterns, pwa-capacitor, deploy-vercel, testing-vitest, onboarding-hat3x

**Por categoría:** frontend, backend, voz (retell-ai, elevenlabs), chatbots (whatsapp-business, rag-chatbots), automatización (n8n, zapier, make), seguridad, SEO, deploy + cientos más en antigravity-awesome-skills

### Capability Map

Ficheros YAML versionados. El Capability Matcher los consulta. El Learning Officer los actualiza.

```
command/capability-map/
├── discovery.yaml
├── design.yaml
├── development.yaml
├── integration.yaml
├── testing.yaml
├── security.yaml
├── performance.yaml
├── seo.yaml
├── deployment.yaml
├── documentation.yaml
├── communication.yaml
└── mandatory-always.yaml
```

**Schema Supabase:**
```sql
CREATE TABLE capability_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  context_tags TEXT[],
  agents JSONB,
  skills JSONB,
  success_rate FLOAT DEFAULT 0,
  learned_from TEXT[],
  last_updated TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE skill_usage_history (
  project_id TEXT,
  skill_name TEXT,
  outcome TEXT,
  sector TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. Capa 5 — Coordination Bus

### 6.1 State Bus — Supabase Realtime

Agentes publican eventos. Cada uno se suscribe solo a los relevantes.

**Tipos de eventos:** task.started, task.progress, task.completed, task.blocked, task.failed, artifact.shared, meeting.called, meeting.statement, meeting.vote, meeting.resolved, checkpoint.triggered, checkpoint.approved, checkpoint.rejected, agent.online, agent.offline, integration.requested

```sql
CREATE TABLE bus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 6.2 Team Meeting Protocol

Los agentes resuelven conflictos internamente. Solo escalan si no hay consenso o el impacto es alto.

**Triggers:** agente bloqueado 2 veces, conflicto diseño/implementación, fin de fase, scope change, dos agentes tocando el mismo sistema, quality gate fallido

**Flujo:** blocked/meeting.called → facilitador convoca → cada agente expone → votación con confidence → consenso → resolved → si no consenso en 2 rondas → Human Checkpoint

**Escalado si:** 2 rondas sin acuerdo, impacto alto, confidence promedio < 0.70

### 6.3 Human Checkpoint System

1. Risk Assessor o Meeting Protocol dispara checkpoint
2. Pausa subtareas afectadas (independientes siguen)
3. Notifica Telegram + Web
4. Timeout: urgente 2h (llamada RetellAI), normal 24h (recordatorio)
5. Aprobación → reanuda · Rechazo → re-planifica

### 6.4 Progress Tracker

Estado unificado en tiempo real. Visible en web y Telegram. Incluye: progreso global, fases, agentes activos, reuniones activas, checkpoints pendientes, métricas.

---

## 7. Capa 6 — Memory & Evolution Engine

### 7.1 Memoria por Agente

```
agents/[nombre]/
├── config.md        ← instrucciones actuales (versionadas con git)
├── memory.md        ← conocimiento acumulado por sector/cliente
└── metrics.json     ← rendimiento histórico
```

### 7.2 Learning Officer

**Cuándo actúa:** tras cada proyecto, semanal, on-demand `/oficina aprender`, cuando agente falla 2+ veces

**5 Fases:**
1. Recolección (5 min) — outputs, métricas, errores, feedback checkpoints
2. Análisis (10 min) — qué funcionó, qué falló, qué tardó, qué faltó
3. Evolución (15 min) — actualiza configs, capability map, sector profiles
4. Validación (5 min) — aplica auto si menor, propone si mayor
5. Reporte (2 min) — informe semanal, notifica por Telegram

**Cambios automáticos:** ajuste scores ±0.1, añadir skill score < 0.7, actualizar tiempos estimados, añadir notas sectoriales, registrar anti-patterns

**Propone al humano:** reescritura config.md, nuevo skill mandatory, eliminar skill, crear agente, nueva integración

**Mínimo proyectos antes de aplicar:** especialización sectorial (2), skill mandatory (3), eliminar skill (3), reescritura mayor config (5)

**Seguridad:** todos los cambios son git commits · rollback siempre disponible · snapshot before/after en Supabase

```sql
CREATE TABLE evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT,
  agent_id TEXT,
  change_type TEXT,
  change_description TEXT,
  before_snapshot JSONB,
  after_snapshot JSONB,
  applied_at TIMESTAMPTZ DEFAULT now(),
  applied_by TEXT
);

CREATE TABLE evolution_proposals (
  id TEXT PRIMARY KEY,
  description TEXT,
  impact TEXT,
  evidence JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.3 Sector Specialization

Agentes acumulan expertise por sector via `memory.md` y tags en Supabase. El Capability Matcher aplica `sector_bonus` al scoring cuando el sector es conocido.

### 7.4 Anti-Patterns Registry

`command/anti-patterns/registry.yaml` — El Learning Officer detecta, registra e inyecta anti-patterns en los `config.md` de agentes afectados.

---

## 8. Capa 7 — Integration Layer

### Herramientas Actuales HAT3X

| Herramienta | Uso |
|---|---|
| n8n | Automatizaciones, flujos, webhooks |
| Supabase | DB, Auth, Realtime, Storage, Edge Functions |
| Twilio | WhatsApp Business (notificaciones a clientes) |
| RetellAI | Agentes telefónicos de voz |
| GitHub | Repositorios, CI/CD, PRs |
| Cal.com | Reservas y citas |
| HubSpot | CRM clientes |
| ElevenLabs | Síntesis de voz |

### Protocolo para Nuevas Integraciones

1. Agente publica `integration.requested` con justificación
2. Human Checkpoint via Telegram
3. Aprueba → registra + añade al Capability Map
4. Rechaza → agente busca alternativa con herramientas disponibles

---

## 9. Las 4 Interfaces

### 9.1 CLI — Control Técnico (Claude Code)

Prefijo `/oficina`. Comandos principales:

```bash
/oficina nueva "descripción" [--modo autopilot|phased|supervised]
/oficina status [id]
/oficina watch [id]
/oficina aprobar [id] ["feedback"]
/oficina rechazar [id] "motivo"
/oficina checkpoints
/oficina equipo
/oficina agente [nombre]
/oficina reunion [id]
/oficina inyectar [task-id] [agente] "instrucción"
/oficina aprender [id]
/oficina evolucion
/oficina propuestas
/oficina aprobar-propuesta [PROP-id]
/oficina rechazar-propuesta [PROP-id] "motivo"
/oficina rollback [agente] v[versión]
/oficina simular "descripción"
/oficina metricas
/oficina pausar-todo / reanudar-todo
/oficina nueva-integracion "herramienta + motivo"
```

### 9.2 Web Dashboard — Next.js + shadcn/ui + Supabase Realtime

**Rutas:** `/command/` (overview), `/command/proyectos`, `/command/proyectos/[id]`, `/command/equipo`, `/command/capability-map`, `/command/learning`, `/command/checkpoints`, `/command/settings`

**Componentes clave:** barra de progreso con fases, panel de agentes en tiempo real, feed de eventos del State Bus, tarjeta de reunión activa, lista de artefactos, botones de checkpoint

### 9.3 Telegram Bot — Control para Jose

Bot privado. API libre y gratuita.

**Comandos nativos:** /status, /nuevo, /checkpoints, /aprobar, /equipo, /metricas

**Botones inline en checkpoints:** [✅ Aprobar] [✏️ Con cambios] [❌ Rechazar]

**Mensajes proactivos:** checkpoint pendiente (con botones), proyecto completado, propuestas del Learning Officer, agente bloqueado sin solución, alerta crítica, resumen semanal

### 9.4 WhatsApp Business — Solo Notificaciones a Clientes

Gestionado por PM Operaciones + n8n + Twilio. Solo saliente. No recibe órdenes.

**Notificaciones:** proyecto iniciado, hito completado, solicitud de assets al cliente, proyecto entregado, recordatorios de citas

---

## 10. Estructura de Ficheros

```
command/
├── index.ts
├── intelligence/
│   ├── task-analyzer.ts
│   ├── capability-matcher.ts
│   ├── execution-planner.ts
│   ├── risk-assessor.ts
│   ├── index.ts
│   └── prompts/
│       ├── task-analyzer.md
│       └── capability-scorer.md
├── capability-map/
│   ├── discovery.yaml
│   ├── design.yaml
│   ├── development.yaml
│   ├── integration.yaml
│   ├── testing.yaml
│   ├── security.yaml
│   ├── performance.yaml
│   ├── seo.yaml
│   ├── deployment.yaml
│   ├── documentation.yaml
│   ├── communication.yaml
│   └── mandatory-always.yaml
├── coordination/
│   ├── state-bus.ts
│   ├── meeting-protocol.ts
│   ├── checkpoint-system.ts
│   ├── progress-tracker.ts
│   └── escalation-rules.ts
├── learning-officer/
│   ├── index.ts
│   ├── collector.ts
│   ├── analyzer.ts
│   ├── evolver.ts
│   ├── versioner.ts
│   ├── reporter.ts
│   └── prompts/
│       ├── analyze-project.md
│       ├── evolve-config.md
│       └── detect-patterns.md
├── anti-patterns/
│   └── registry.yaml
├── evolution-history/
│   └── .gitkeep
└── interfaces/
    ├── cli/
    │   └── commands.ts
    ├── web/
    │   ├── app/command/
    │   └── components/command/
    ├── telegram/
    │   ├── bot.ts
    │   ├── handlers.ts
    │   └── notifications.ts
    └── whatsapp/
        └── client-notifications.ts
```

---

## 11. Ejemplo End-to-End

**Orden:** `"Web profesional para Clínica NovaMed con reservas y WhatsApp"`

**Intelligence Layer (< 60s):** 12 subtareas · 18 agentes · 45 skills · 6 fases · 2 checkpoints humanos

**Agentes:** master-orchestrator, architect, art-director, ux-designer, lead-programmer, ui-programmer, ts-reviewer, db-reviewer, security-reviewer, performance-optimizer, pm-webs-apps, pm-chatbots, qa-tester, e2e-runner, devops-engineer, community-manager, onboarding-coordinator, learning-officer

**Skills por fase:**
- Discovery: brainstorming, writing-plans, planner, site-architecture
- Design: frontend-design, ui-ux-pro-max, shadcn, animate, design-review
- Dev: tdd, nextjs-shadcn, typescript-strict, supabase-rls, react-query-patterns
- Integration: whatsapp-business, rag-chatbots, cal-com-automation, n8n-workflow-patterns
- Quality: security-audit, performance-web, accessibility-wcag, testing-vitest, e2e-runner
- Deploy: deploy-vercel, github-actions-templates, smoke-check
- Delivery: onboarding-hat3x, documentation

**Resultado:** ~22h autónomas (vs ~48h lineal) · Lighthouse 90+ · WCAG AA · 0 vulnerabilidades OWASP

---

## 12. Fases de Implementación

| Fase | Componentes | Resultado |
|---|---|---|
| 1 | Supabase schema + State Bus + Command Center | Tareas se crean y persisten |
| 2 | Task Analyzer + Capability Map base | Órdenes se descomponen |
| 3 | Capability Matcher + Execution Planner | Plans se generan automáticamente |
| 4 | Risk Assessor + Checkpoint System | Humano recibe alertas |
| 5 | Telegram Bot | Control desde móvil |
| 6 | Web Dashboard | Visibilidad en tiempo real |
| 7 | Team Meeting Protocol | Agentes resuelven conflictos solos |
| 8 | Learning Officer | Sistema empieza a evolucionar |
| 9 | WhatsApp client notifications | Clientes reciben updates |
| 10 | Especialización sectorial + Anti-patterns | Sistema maduro |

---

## 13. Decisiones de Diseño Clave

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Pool composable de agentes | Jerarquía rígida de 5 PMs | Maximiza uso del 80-90% de capabilities |
| Telegram para control interno | WhatsApp para todo | API libre, gratis, botones inline nativos |
| Supabase Realtime para State Bus | Redis pub/sub | Ya en stack HAT3X, sin infra adicional |
| YAML versionados para Capability Map | Solo Supabase | Human-readable, versionable con git, auditables |
| Git commits para evolución de agentes | Solo base de datos | Rollback garantizado, historial visible |
| Enfoque B (Virtual Office) | C (Platform First) | 40% ya construido, valor inmediato |
