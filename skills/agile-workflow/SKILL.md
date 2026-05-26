# SKILL: Agile Workflow & Project Management

Basado en [levnikolaevich/claude-code-skills](https://github.com/levnikolaevich/claude-code-skills) y [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — Product & PM skills

## Roles Ágiles HAT3X

| Rol | Responsabilidades |
|-----|-------------------|
| **Product Owner** | Define prioridades, acepta/rechaza entregables |
| **Scrum Master** | Facilita procesos, elimina bloqueos |
| **Dev Team** | Implementa, testa, entrega |
| **Stakeholders** | Feedback, validación |

---

## Ceremonias Ágiles

### 1. Sprint Planning

**Cuándo:** Inicio de cada sprint (2 semanas típico)

**Agenda:**
```markdown
1. Revisar backlog del producto (30 min)
2. Definir objetivo del sprint (15 min)
3. Seleccionar historias para el sprint (45 min)
4. Desglosar historias en tareas (30 min)
5. Compromiso del sprint (15 min)

Total: ~2 horas para sprint de 2 semanas
```

**Template de Sprint Goal:**
```markdown
## Sprint [N] — [FECHA INICIO] a [FECHA FIN]

### Objetivo
[Una frase clara del objetivo principal]

### Historias Comprometidas

| ID | Historia | Puntos | Owner |
|----|----------|--------|-------|
| US-01 | [Descripción] | 5 | @nombre |
| US-02 | [Descripción] | 3 | @nombre |

### Capacidad del Equipo
- Total puntos: X
- Días disponibles: Y (considerar vacaciones, otros proyectos)
```

---

### 2. Daily Standup

**Cuándo:** Cada día, misma hora (15 min máximo)

**Formato asíncrono (Slack/Teams):**
```markdown
**Daily — [FECHA]**

@nombre
✅ Ayer: [qué hice]
🎯 Hoy: [qué haré]
🚧 Bloqueos: [si hay]

@nombre2
✅ Ayer: ...
```

**Formato síncrono (llamada):**
```
Cada miembro responde:
1. ¿Qué hice ayer?
2. ¿Qué haré hoy?
3. ¿Tengo algún bloqueo?
```

---

### 3. Sprint Review

**Cuándo:** Final del sprint (1-2 horas)

**Agenda:**
```markdown
1. Demo de historias completadas (45 min)
2. Feedback de stakeholders (30 min)
3. Actualización del backlog (30 min)
4. Discusión de release (15 min)
```

**Template:**
```markdown
# Sprint Review — Sprint [N]

## Demo

### ✅ Completado
- [ ] US-01: [demo + screenshots]
- [ ] US-02: [demo + screenshots]

### ⏸️ En progreso (pasa a siguiente sprint)
- [ ] US-03: [qué falta, por qué no se completó]

## Feedback Recibido

| Stakeholder | Feedback | Acción |
|-------------|----------|--------|
| [Nombre] | [comentario] | [tarea creada] |

## Backlog Actualizado
- Nuevas historias: [lista]
- Repriorizadas: [lista]
```

---

### 4. Sprint Retrospective

**Cuándo:** Final del sprint, después del review (1 hora)

**Formato: Start, Stop, Continue**
```markdown
# Retrospectiva — Sprint [N]

## Start (qué empezar a hacer)
- [ ] [idea 1]
- [ ] [idea 2]

## Stop (qué dejar de hacer)
- [ ] [idea 1]
- [ ] [idea 2]

## Continue (qué seguir haciendo)
- [ ] [idea 1]
- [ ] [idea 2]

## Action Items

| Acción | Owner | Due Date |
|--------|-------|----------|
| [acción] | @nombre | [fecha] |
```

---

## User Stories Template

```markdown
# US-[N]: [Título corto]

## Historia
Como [rol], quiero [objetivo], para [beneficio].

## Criterios de Aceptación

- [ ] Criterio 1
- [ ] Criterio 2
- [ ] Criterio 3

## Tareas Técnicas

- [ ] [tarea 1]
- [ ] [tarea 2]
- [ ] [tarea 3]

## Estimación
- Puntos: [X]
- Horas: [Y]

## Definición de Done

- [ ] Código implementado
- [ ] Tests pasando
- [ ] Code review aprobado
- [ ] Documentación actualizada
- [ ] Deploy en staging
- [ ] QA passed
```

---

## Backlog Management

### Prioritización (MoSCoW)

| Prioridad | Significado | Criterio |
|-----------|-------------|----------|
| **Must have** | Crítico | Sin esto, el producto no sirve |
| **Should have** | Importante | Debería estar, pero hay workaround |
| **Could have** | Nice to have | Mejora la experiencia pero no es crítico |
| **Won't have** | Por ahora no | Acordado que no entra en este sprint/release |

### Backlog Refinement

**Cuándo:** 1-2 veces por semana (30-60 min)

**Checklist:**
```markdown
- [ ] Historias claras y específicas
- [ ] Criterios de aceptación definidos
- [ ] Estimaciones actualizadas
- [ ] Dependencias identificadas
- [ ] Top 5-10 historias "ready" para próximo sprint
```

---

## Definición de Ready

Una historia está "ready" cuando:

```markdown
- [ ] Descripción clara (formato historia de usuario)
- [ ] Criterios de aceptación definidos
- [ ] Estimada por el equipo
- [ ] Dependencias resueltas
- [ ] Mockups/designs adjuntos (si aplica)
- [ ] Priorizada por PO
```

---

## Definición de Done

Una historia está "done" cuando:

```markdown
- [ ] Código implementado y commiteado
- [ ] Tests unitarios pasando
- [ ] Tests de integración pasando
- [ ] Code review aprobado (1+ approvals)
- [ ] Sin issues de seguridad
- [ ] Documentación actualizada
- [ ] Deploy en staging/test
- [ ] QA manual passed (si aplica)
- [ ] Aceptada por PO
```

---

## Métricas Ágiles

### Velocity

```markdown
## Velocity del Equipo

| Sprint | Puntos comprometidos | Puntos completados | % |
|--------|---------------------|-------------------|---|
| Sprint 1 | 25 | 22 | 88% |
| Sprint 2 | 25 | 25 | 100% |
| Sprint 3 | 30 | 27 | 90% |

**Velocity promedio:** 24.7 puntos/sprint
```

### Burndown Chart

```markdown
## Sprint [N] — Burndown

| Día | Ideal | Real |
|-----|-------|------|
| 1 | 25 | 25 |
| 2 | 22 | 23 |
| 3 | 19 | 20 |
| 4 | 16 | 15 |
| ... | ... | ... |
```

### Lead Time & Cycle Time

| Métrica | Fórmula | Objetivo |
|---------|---------|----------|
| Lead Time | Entrega - Creación | < 14 días |
| Cycle Time | Inicio - Entrega | < 5 días |
| Throughput | Historias/sprint | Estable o creciente |

---

## Plantillas de Gestión

### Project Kickoff

```markdown
# Project Kickoff — [NOMBRE PROYECTO]

## Contexto
[Por qué existe este proyecto, qué problema resuelve]

## Objetivos
- [ ] Objetivo 1 (medible)
- [ ] Objetivo 2 (medible)

## Stakeholders
| Rol | Nombre | Contacto |
|-----|--------|----------|
| Sponsor | [Nombre] | [Email] |
| PO | [Nombre] | [Email] |
| Tech Lead | [Nombre] | [Email] |

## Timeline
- Inicio: [FECHA]
- MVP: [FECHA]
- Release: [FECHA]

## Riesgos Iniciales
| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| [Riesgo] | Alta/Media/Baja | Alto/Medio/Bajo | [Acción] |
```

### Status Report Semanal

```markdown
# Status Report — Semana [N]

## Resumen Ejecutivo
[2-3 frases del estado general]

## Esta Semana
- ✅ Completado: [lista]
- 🚧 En progreso: [lista]
- 🚧 Bloqueos: [lista]

## Próxima Semana
- [ ] Planificado 1
- [ ] Planificado 2

## Riesgos / Decisiones Necesarias
| Tema | Descripción | Decisión necesaria de |
|------|-------------|----------------------|
| [Tema] | [Descripción] | [Persona/rol] |

## Métricas
- Velocity: X puntos
- Bugs abiertos: X
- Bugs críticos: X
```

---

## Checklist de Proyecto Listo

```markdown
## Inicio
- [ ] Kickoff realizado
- [ ] Backlog inicial creado
- [ ] Sprint 1 planificado
- [ ] Equipo alineado en DoR y DoD

## Durante
- [ ] Daily ceremonies ocurriendo
- [ ] Backlog refinado semanalmente
- [ ] Stakeholders actualizados

## Cierre
- [ ] Sprint review final realizado
- [ ] Retrospectiva completada
- [ ] Documentación entregada
- [ ] Handoff al cliente
- [ ] Lecciones aprendidas documentadas
```
