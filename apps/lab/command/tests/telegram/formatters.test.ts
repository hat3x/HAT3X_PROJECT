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
  checkpoints: [{ afterPhase: 1, reason: "Client deliverable", requiredApproval: "both" as const }],
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
