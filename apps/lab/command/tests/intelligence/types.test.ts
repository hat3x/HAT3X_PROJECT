import { describe, it, expectTypeOf } from "vitest"
import type {
  Subtask,
  AgentSelection,
  Checkpoint,
  Phase,
  PhaseSubtask,
  ExecutionPlan,
  HatTask,
  Vertical,
  RiskLevel,
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
