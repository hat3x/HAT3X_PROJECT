# HAT3X Command — Capa de Ejecución Real + Oficina Visual ("Plan 12")
**Fecha:** 2026-07-04
**Estado:** Aprobado por Jose M.
**Autor:** Jose M. + Claude (brainstorming session)
**Extiende:** `2026-05-17-hat3x-command-design.md`

---

## 1. Contexto y Problema

HAT3X Command (apps/command) está construido en gran parte: Command Center, Intelligence
Layer, Coordination (reuniones + checkpoints), Learning Officer, Scheduler, bot de Telegram
y CLI. 135 tests pasan; 19 fallan únicamente por falta de conexión viva a Supabase Realtime.
Jarvis (apps/jarvis) existe como interfaz conversacional Next.js conectada a Command.

**El hueco crítico:** no existe la capa de ejecución. Command analiza una orden, la
descompone, asigna agentes y skills y genera el plan — pero nadie hace el trabajo. No hay
ninguna invocación de Claude Code. Los +180 agentes existen como definiciones, no como
trabajadores.

Este spec define esa capa y la experiencia visual para supervisarla.

## 2. Decisiones aprobadas

| Decisión | Elección | Motivo |
|---|---|---|
| Motor de ejecución | Procesos `claude -p` headless lanzados por Command | Autonomía 24/7 sin sesión abierta; usa la suscripción de Claude Code |
| Concurrencia | `MAX_CONCURRENT_AGENTS=4` (configurable) | Equilibrio velocidad / límites de la ventana de 5h |
| Permisos | Libres dentro de `clients/projects/[cliente]/`; líneas rojas → checkpoint | Fluidez sin riesgo fuera de la carpeta del proyecto |
| Vista | Oficina 2D con avatares + dashboard denso, ambas en Jarvis | Experiencia "oficina real" + control profundo |
| Orden de construcción | 1) Executor + entorno · 2) Visual · 3) Demo e2e | Sin ejecución no hay nada que ver |

## 3. El Executor — `apps/command/src/executor/`

Convierte los execution plans existentes en trabajo real.

### 3.1 `queue.ts` — Cola por fases
- Lee el execution plan (fases + dependencias del Execution Planner).
- Despacha subtareas cuyo estado de dependencias esté satisfecho.
- Respeta `MAX_CONCURRENT_AGENTS` (env, default 4). El resto espera slot.
- Reacciona a eventos del State Bus: `task.completed` libera slot y re-evalúa la cola;
  `checkpoint.triggered` pausa las subtareas dependientes (las independientes siguen).

### 3.2 `agent-runner.ts` — Un agente real por subtarea
- Lanza `claude -p` headless con `--output-format stream-json` para capturar progreso.
- Ensambla el prompt con: subtarea (título, descripción, deliverable), identidad del agente
  (`agents/[nombre]/config.md` + `memory.md`), skills asignados por el Capability Matcher
  (instrucción explícita de invocarlos), y contexto del cliente desde Supabase.
- `cwd` = carpeta del proyecto. Permisos: bypass dentro del workspace.
- Timeout y reintentos configurables; 2 fallos → `task.blocked` → protocolo de reunión.

### 3.3 `workspace.ts` — Espacio de trabajo aislado
- Crea/prepara `clients/projects/[cliente]/` y una rama git por tarea (`hat3x/HAT3X-NNN`).
- El agente solo puede tocar su workspace; commits automáticos por subtarea completada.

### 3.4 `redline-guard.ts` — Líneas rojas
Hooks/config inyectados en cada proceso headless que **bloquean** y convierten en
`checkpoint.triggered` (Telegram con botones ✅/✏️/❌):
- Deploy a producción
- Comunicación saliente a clientes (email, WhatsApp)
- Acciones irreversibles o con gasto económico
- Escritura fuera del workspace asignado

### 3.5 `reporter.ts` — Progreso al State Bus
Publica en `bus_events` (ya existente): `task.started`, `task.progress` (con descripción
humana de qué hace el agente — alimenta las burbujas de la oficina visual),
`task.completed`, `task.failed`, `artifact.shared`.

## 4. Servicios 24/7 — Supervisor

Comando `oficina start` / `oficina stop` (CLI existente) que levanta y supervisa 4 procesos:
servidor Command, bot Telegram, scheduler y loop del Executor. Reinicio automático si uno
cae. Mientras la oficina está encendida, una orden por Telegram o Jarvis ejecuta el
pipeline completo sin Claude Code abierto.

## 5. Colaboración entre agentes

- **Artefactos:** `artifact.shared` en el State Bus; el runner inyecta los artefactos de
  las dependencias en el prompt de las subtareas siguientes.
- **Reuniones:** el Meeting Protocol existente se conecta al Executor. Bloqueo doble o
  conflicto → `meeting.called`; el facilitador es una llamada headless que recibe las
  posturas, modera la votación y publica `meeting.resolved`. Sin consenso en 2 rondas →
  checkpoint humano.

## 6. Oficina Visual — en Jarvis (apps/jarvis)

Tres rutas, todas sobre Supabase Realtime (mismos datos, distinta representación):

### 6.1 `/oficina` — Plano 2D con avatares
- Zonas: Dev, Diseño, QA, Operaciones, Sala de reuniones, Descanso (idle).
- Cada agente del pool = avatar con nombre y rol. Estados: 🟢 trabajando (burbuja con el
  `task.progress` más reciente), 🔵 en reunión (avatar se mueve a la sala), 🔴 bloqueado,
  ⚪ idle.
- Clic en avatar → panel lateral: tarea actual, log en vivo, artefactos.
- Implementación: SVG/CSS animado (sin motor de juego). Barra inferior: proyecto activo,
  progreso global, checkpoints pendientes.

### 6.2 `/command` — Dashboard denso
Tarjetas de agentes activos, feed de eventos en vivo, progreso por fases, métricas.
(Extiende la ruta `/command` ya empezada en Jarvis.)

### 6.3 `/checkpoints` — Aprobaciones
Lista de checkpoints pendientes con botones ✅ Aprobar / ✏️ Con cambios / ❌ Rechazar.
Espejo funcional del bot de Telegram.

## 7. Entorno y salud

- Verificar/aplicar el schema Supabase completo (tablas del spec original).
- Arreglar los 19 tests que fallan (dependencia de Realtime vivo: entorno o mocks).
- Verificar la conexión Jarvis ↔ Command (`command-client.ts`).
- `.env.example` actualizado en apps/command y apps/jarvis.

## 8. Verificación end-to-end

1. **Demo interna:** `oficina nueva "landing simple de prueba"` → 3-4 agentes en paralelo
   visibles en `/oficina`, checkpoint llegando a Telegram, entregable committeado en la
   carpeta del proyecto.
2. **Cliente real:** flujo completo con onboarding, Jose solo aprueba checkpoints.

## 9. Fuera de alcance (explícito)

- WhatsApp saliente a clientes vía Twilio (Plan 9 original).
- Módulo de finanzas (Plan 11).
- Especialización sectorial avanzada / anti-patterns (se activan solos con el Learning
  Officer tras proyectos reales).
