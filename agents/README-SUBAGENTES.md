# Sistema de Subagentes HAT3X

> **178 subagentes especializados** integrados en el sistema HAT3X
> Fuente: [agency-agents](https://github.com/msitarzewski/agency-agents)

## Resumen

El sistema de subagentes de HAT3X ha sido expandido con **178 agentes especializados** que pueden ser delegados automáticamente por los PMs principales. Cada subagente es un experto en un dominio específico y está listo para ejecutar tareas especializadas.

## Distribución por Vertical

| Vertical | Subagentes | Descripción |
|----------|-----------|-------------|
| **webs-apps** | 49 | Desarrollo web, ingeniería, diseño, testing |
| **automatizaciones** | 5 | Automatización, flujos de trabajo, integraciones |
| **chatbots** | 39 | Marketing, ventas, comunidades, social media |
| **operaciones** | 85 | Gestión, estrategia, producto, soporte, especializados |
| **voz** | 0 | *(Subagentes de voz serán añadidos en futura expansión)* |

**Total: 178 subagentes**

## Estructura del Sistema

```
agents/
├── [vertical]/
│   ├── CLAUDE.md              # PM principal
│   ├── subagentes/
│   │   ├── [agente-id]/
│   │   │   └── CLAUDE.md      # Subagente especializado
│   │   └── ...
│   └── README.md              # Documentación específica de la vertical
└── SUBAGENTES-MAESTRO.md      # Índice completo (auto-generado)
```

## Uso

### Para PMs Principales

Cuando recibas un proyecto, identifica qué tareas especializadas pueden ser delegadas:

```
[DELEGAR EN PARALELO]
→ Subagente 1: "[tarea específica]"
→ Subagente 2: "[tarea específica]"
Contexto: {briefing completo}
```

### Ejemplos de Delegación

**PM Webs y Apps:**
```
[DELEGAR]
PM: webs-apps
Subagente: "engineering-ai-engineer"
Tarea: "Diseñar e implementar sistema de recomendaciones con ML para el e-commerce"
Contexto: {proyecto completo}
```

**PM Chatbots:**
```
[DELEGAR]
PM: chatbots
Subagente: "marketing-seo-specialist"
Tarea: "Optimizar contenido del chatbot para motores de búsqueda y AEO"
Contexto: {proyecto completo}
```

**PM Operaciones:**
```
[DELEGAR]
PM: operaciones
Subagente: "product-product-manager"
Tarea: "Priorizar backlog y definir roadmap para el MVP"
Contexto: {proyecto completo}
```

## Características de los Subagentes

### Frontmatter Estandarizado

Cada subagente incluye metadatos YAML:

```yaml
---
name: Nombre del Agente
description: Breve descripción de 1 línea
color: blue/green/purple/orange/red/gray
emoji: 🤖/🎨/⚡/🚀/📊/🔧
vibe: Frase que captura la esencia
vertical: webs-apps/chatbots/automatizaciones/voz/operaciones
source: agency-agents/[categoria]/[archivo].md
tags: [categoria, subagente]
---
```

### Contenido Incluido

1. **Identity & Expertise** - Quién es y qué sabe
2. **Core Mission** - Misión y tareas principales
3. **Deliverables** - Qué produce
4. **Workflow Integration** - Cómo colabora con el PM
5. **Success Metrics** - Cómo medir éxito
6. **Example Invocation** - Ejemplo de uso

## Mantenimiento

### Regenerar Índice

Si se añaden o modifican subagentes:

```bash
# Regenerar solo el índice maestro
node scripts/convert-agents.js --index

# Reprocesar todos los agentes (si hay actualizaciones en agency-agents)
node scripts/convert-agents.js
```

### Actualizar PMs

Si se añaden nuevos subagentes:

```bash
node scripts/update-pm-references.js
```

## Mejores Prácticas

### Para PMs

1. **Delega temprano** - No esperes a tener todo planeado
2. **Contexto completo** - Proporciona briefing completo del proyecto
3. **Tareas específicas** - Sé claro en el objetivo del subagente
4. **Deadline claro** - Establece expectativas de tiempo
5. **Revisa antes de integrar** - Valida entregables antes de mezclar

### Para Subagentes

1. **Enfócate en tu dominio** - No salgas de tu especialidad
2. **Comunica bloqueadores** - Reporta dependencias inmediatamente
3. **Documenta todo** - Deja registro de decisiones
4. **Métricas claras** - Define cómo se mide tu éxito

## Categorías de Subagentes

### Webs y Apps (49)

**Engineering:**
- AI Engineer, Backend Architect, Frontend Developer, Mobile App Builder
- DevOps Automator, Security Engineer, Software Architect, SRE
- Data Engineer, Database Optimizer, CMS Developer, etc.

**Design:**
- UI Designer, UX Architect, UX Researcher, Brand Guardian
- Visual Storyteller, Image Prompt Engineer, etc.

**Testing:**
- Accessibility Auditor, API Tester, Performance Benchmarker
- Reality Checker, Test Results Analyzer, etc.

**Spatial Computing:**
- visionOS Spatial Engineer, XR Immersive Developer
- XR Interface Architect, macOS Spatial/Metal Engineer

### Automatizaciones (5)

- Automation Governance Architect
- Backend Architect
- Data Consolidation Agent
- Report Distribution Agent
- Sales Data Extraction Agent

### Chatbots (39)

**Marketing:**
- SEO Specialist, Social Media Strategist, Content Creator
- Growth Hacker, Instagram Curator, TikTok Strategist
- China-specific: Douyin Strategist, WeChat Manager, Bilibili Strategist

**Sales:**
- Account Strategist, Sales Coach, Deal Strategist
- Outbound Strategist, Pipeline Analyst, Proposal Strategist

**Community:**
- Reddit Community Builder, Discord Community Architect

### Operaciones (85)

**Strategy:**
- Nexus Strategy, Phase 0-6 Playbooks, Scenario Runbooks

**Product:**
- Product Manager, Sprint Prioritizer, Feedback Synthesizer

**Project Management:**
- Project Shepherd, Jira Workflow Steward, Studio Producer

**Specialized:**
- Blockchain Security Auditor, Compliance Auditor, Salesforce Architect
- Recruitment Specialist, Corporate Training Designer, etc.

**Support:**
- Analytics Reporter, Finance Tracker, Legal Compliance Checker

**Academic:**
- Anthropologist, Historian, Psychologist, Geographer

## Troubleshooting

### Si un subagente no responde

1. Verifica que el nombre sea exacto (case-sensitive)
2. Revisa que está en la vertical correcta
3. Consulta el índice maestro: `agents/SUBAGENTES-MAESTRO.md`

### Si necesitas un agente que no existe

1. Revisa si hay un subagente similar en otra vertical
2. Si no existe, considera crear un nuevo agente especializado
3. Documenta el nuevo agente siguiendo el formato estándar

## Soporte

Para dudas sobre el sistema de subagentes:

1. Consulta `agents/SUBAGENTES-MAESTRO.md` para ver todos los agentes
2. Revisa el CLAUDE.md de cada vertical para ver subagentes específicos
3. Verifica la documentación original en `agency-agents/README.md`

---

**Sistema generado automáticamente** | Última actualización: 2026-04-05
**Total de subagentes:** 178 | **Verticales:** 5 | **Fuente:** agency-agents
