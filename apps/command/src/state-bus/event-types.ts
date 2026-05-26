export const EVENT_TYPES = {
  TASK_STARTED:          "task.started",
  TASK_PROGRESS:         "task.progress",
  TASK_COMPLETED:        "task.completed",
  TASK_BLOCKED:          "task.blocked",
  TASK_FAILED:           "task.failed",
  ARTIFACT_SHARED:       "artifact.shared",
  MEETING_CALLED:        "meeting.called",
  MEETING_STATEMENT:     "meeting.statement",
  MEETING_VOTE:          "meeting.vote",
  MEETING_RESOLVED:      "meeting.resolved",
  CHECKPOINT_TRIGGERED:  "checkpoint.triggered",
  CHECKPOINT_APPROVED:   "checkpoint.approved",
  CHECKPOINT_REJECTED:   "checkpoint.rejected",
  AGENT_ONLINE:          "agent.online",
  AGENT_OFFLINE:         "agent.offline",
  INTEGRATION_REQUESTED: "integration.requested",
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]
