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
