import { EVENT_TYPES } from "../state-bus/event-types.js"
import type { EventType } from "../state-bus/event-types.js"
import type { PublishFn, RunnerEvent } from "./types.js"

const KIND_TO_EVENT: Record<RunnerEvent["kind"], EventType> = {
  started: EVENT_TYPES.TASK_STARTED,
  progress: EVENT_TYPES.TASK_PROGRESS,
  completed: EVENT_TYPES.TASK_COMPLETED,
  failed: EVENT_TYPES.TASK_FAILED,
  artifact: EVENT_TYPES.ARTIFACT_SHARED,
}

export function createReporter(taskId: string, publish: PublishFn) {
  return async (ev: RunnerEvent): Promise<void> => {
    await publish({
      taskId,
      eventType: KIND_TO_EVENT[ev.kind],
      agentId: ev.agentId,
      payload: { subtaskId: ev.subtaskId, detail: ev.detail },
    })
  }
}
