# HAT3X Command — Plan 4: Coordination Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the agent coordination layer: meetings (multi-agent consensus), meeting facilitator (detect consensus + escalate to checkpoint), checkpoint monitor (timeout reminders), Telegram notifications for meetings, and `oficina progress <id>` CLI command.

**Architecture:** Agents call meetings via `MeetingFactory`; each agent votes with a confidence score. `MeetingFacilitator` runs after each vote to detect consensus (avg confidence ≥ 0.70 + majority position > 50%) or escalate to a HatCheckpoint after 2 rounds. `CheckpointMonitor` queries pending checkpoints older than 24h and sends Telegram reminders. All meeting events flow through the existing bus_events Realtime channel to `NotificationSender`.

**Tech Stack:** Supabase (hat3x_meetings + hat3x_meeting_votes tables, Realtime), TypeScript/ESM, grammY, Vitest, existing `publishEvent`/`createCheckpoint`/`NotificationSender`/`getSupabaseClient` utilities.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/database/migrations/003_meetings.sql` | Create | hat3x_meetings + hat3x_meeting_votes tables + Realtime |
| `src/coordination/types.ts` | Create | HatMeeting, MeetingVote, ConsensusResult, MeetingStatus types |
| `src/coordination/meeting-factory.ts` | Create | createMeeting, castVote, getVotes, closeMeeting, escalateMeeting |
| `src/coordination/meeting-facilitator.ts` | Create | detectConsensus (pure), maybeEscalate |
| `src/coordination/checkpoint-monitor.ts` | Create | checkTimeouts — query + remind pending checkpoints > 24h |
| `src/telegram/notifications/sender.ts` | Modify | Add sendMeetingCalled, sendMeetingResolved, sendCheckpointReminder |
| `src/state-bus/global-subscriber.ts` | Modify | Route meeting.called → sendMeetingCalled, meeting.resolved → sendMeetingResolved |
| `src/index.ts` | Modify | Add `oficina progress <id>` command |
| `tests/coordination/meeting-factory.test.ts` | Create | Unit tests for meeting factory |
| `tests/coordination/meeting-facilitator.test.ts` | Create | Unit tests for facilitator (pure + async) |
| `tests/coordination/checkpoint-monitor.test.ts` | Create | Unit tests for checkpoint monitor |
| `tests/telegram/sender-coordination.test.ts` | Create | Tests for new NotificationSender methods |
| `tests/state-bus/global-subscriber-coordination.test.ts` | Create | Tests for new event routing |

---

### Task 1: SQL Migration — hat3x_meetings + hat3x_meeting_votes

**Files:**
- Create: `command/src/database/migrations/003_meetings.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 003_meetings.sql
-- hat3x_meetings: one row per meeting called by an agent
CREATE TABLE IF NOT EXISTS hat3x_meetings (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES hat3x_tasks(id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,
  called_by     TEXT NOT NULL,              -- agent_id that called the meeting
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','resolved','escalated')),
  round         INTEGER NOT NULL DEFAULT 1, -- voting round counter
  consensus     TEXT,                       -- winning position when resolved
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- hat3x_meeting_votes: one row per agent per round
CREATE TABLE IF NOT EXISTS hat3x_meeting_votes (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES hat3x_meetings(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  position    TEXT NOT NULL,   -- agent's chosen position string
  confidence  NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  round       INTEGER NOT NULL,
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, agent_id, round)
);

CREATE INDEX IF NOT EXISTS hat3x_meetings_task_id_idx ON hat3x_meetings(task_id);
CREATE INDEX IF NOT EXISTS hat3x_meeting_votes_meeting_id_idx ON hat3x_meeting_votes(meeting_id);

-- Enable Supabase Realtime for meetings
ALTER PUBLICATION supabase_realtime ADD TABLE hat3x_meetings;
```

- [ ] **Step 2: Apply migration in Supabase Dashboard**

Navigate to Supabase Dashboard → SQL Editor, paste and run `003_meetings.sql`.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify tables**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('hat3x_meetings','hat3x_meeting_votes');
```

Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
git add command/src/database/migrations/003_meetings.sql
git commit -m "feat(coordination): add hat3x_meetings and hat3x_meeting_votes tables"
```

---

### Task 2: Coordination Types

**Files:**
- Create: `command/src/coordination/types.ts`
- Test: `command/tests/coordination/types.test.ts`

- [ ] **Step 1: Write the failing type test**

```typescript
// tests/coordination/types.test.ts
import { describe, it, expectTypeOf } from "vitest"
import type { HatMeeting, MeetingVote, ConsensusResult, MeetingStatus } from "../../src/coordination/types"

describe("coordination types", () => {
  it("HatMeeting has required fields", () => {
    expectTypeOf<HatMeeting>().toHaveProperty("id")
    expectTypeOf<HatMeeting>().toHaveProperty("taskId")
    expectTypeOf<HatMeeting>().toHaveProperty("topic")
    expectTypeOf<HatMeeting>().toHaveProperty("calledBy")
    expectTypeOf<HatMeeting>().toHaveProperty("status")
    expectTypeOf<HatMeeting>().toHaveProperty("round")
  })

  it("MeetingVote has required fields", () => {
    expectTypeOf<MeetingVote>().toHaveProperty("id")
    expectTypeOf<MeetingVote>().toHaveProperty("meetingId")
    expectTypeOf<MeetingVote>().toHaveProperty("agentId")
    expectTypeOf<MeetingVote>().toHaveProperty("position")
    expectTypeOf<MeetingVote>().toHaveProperty("confidence")
    expectTypeOf<MeetingVote>().toHaveProperty("round")
  })

  it("ConsensusResult has reached and optional fields", () => {
    expectTypeOf<ConsensusResult>().toHaveProperty("reached")
    expectTypeOf<ConsensusResult>().toHaveProperty("position")
    expectTypeOf<ConsensusResult>().toHaveProperty("avgConfidence")
  })

  it("MeetingStatus is a union of literals", () => {
    const s: MeetingStatus = "open"
    const s2: MeetingStatus = "resolved"
    const s3: MeetingStatus = "escalated"
    expect([s, s2, s3]).toEqual(["open", "resolved", "escalated"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command && npx vitest run tests/coordination/types.test.ts
```

Expected: FAIL — "Cannot find module '../../src/coordination/types'"

- [ ] **Step 3: Create types file**

```typescript
// src/coordination/types.ts
export type MeetingStatus = "open" | "resolved" | "escalated"

export interface HatMeeting {
  id: string
  taskId: string
  topic: string
  calledBy: string
  status: MeetingStatus
  round: number
  consensus: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface MeetingVote {
  id: string
  meetingId: string
  agentId: string
  position: string
  confidence: number  // 0.00 – 1.00
  round: number
  votedAt: string
}

export interface ConsensusResult {
  reached: boolean
  position: string | null      // winning position if reached
  avgConfidence: number        // average confidence across all votes in round
  majorityPosition: string | null  // position held by > 50% of votes
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd command && npx vitest run tests/coordination/types.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add command/src/coordination/types.ts command/tests/coordination/types.test.ts
git commit -m "feat(coordination): add HatMeeting, MeetingVote, ConsensusResult types"
```

---

### Task 3: Meeting Factory

**Files:**
- Create: `command/src/coordination/meeting-factory.ts`
- Test: `command/tests/coordination/meeting-factory.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/coordination/meeting-factory.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")
vi.mock("../../src/state-bus/publisher")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_INSERT = vi.fn().mockResolvedValue({ error: null })
const MOCK_UPDATE = vi.fn().mockResolvedValue({ error: null })
const MOCK_EQ = vi.fn().mockReturnThis()
const MOCK_SELECT = vi.fn().mockResolvedValue({
  data: [
    { id: "V-001", meeting_id: "MTG-001", agent_id: "pm-chatbots",
      position: "launch", confidence: 0.85, round: 1,
      voted_at: new Date().toISOString() }
  ],
  error: null
})
const MOCK_FROM_VOTES = { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }

describe("createMeeting", () => {
  it("inserts to hat3x_meetings and returns HatMeeting", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: MOCK_INSERT }),
    } as any)

    const { createMeeting } = await import("../../src/coordination/meeting-factory")
    const meeting = await createMeeting({ taskId: "HAT3X-001", topic: "Launch scope?", calledBy: "pm-chatbots" })

    expect(MOCK_INSERT).toHaveBeenCalledOnce()
    expect(meeting.taskId).toBe("HAT3X-001")
    expect(meeting.topic).toBe("Launch scope?")
    expect(meeting.calledBy).toBe("pm-chatbots")
    expect(meeting.status).toBe("open")
    expect(meeting.round).toBe(1)
    expect(meeting.id).toMatch(/^MTG-\d{3}$/)
  })

  it("throws if insert fails", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: "DB error" } }) }),
    } as any)

    const { createMeeting } = await import("../../src/coordination/meeting-factory")
    await expect(createMeeting({ taskId: "T1", topic: "test", calledBy: "agent" })).rejects.toThrow("Failed to create meeting")
  })
})

describe("castVote", () => {
  it("inserts to hat3x_meeting_votes and returns MeetingVote", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: MOCK_INSERT }),
    } as any)

    const { castVote } = await import("../../src/coordination/meeting-factory")
    const vote = await castVote({ meetingId: "MTG-001", agentId: "pm-voz", position: "delay", confidence: 0.6, round: 1 })

    expect(MOCK_INSERT).toHaveBeenCalledOnce()
    expect(vote.position).toBe("delay")
    expect(vote.confidence).toBe(0.6)
  })
})

describe("closeMeeting", () => {
  it("updates meeting to resolved with consensus", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      }),
    } as any)

    const { closeMeeting } = await import("../../src/coordination/meeting-factory")
    await expect(closeMeeting("MTG-001", "launch")).resolves.toBeUndefined()
  })
})

describe("escalateMeeting", () => {
  it("updates meeting to escalated", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      }),
    } as any)

    const { escalateMeeting } = await import("../../src/coordination/meeting-factory")
    await expect(escalateMeeting("MTG-001")).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command && npx vitest run tests/coordination/meeting-factory.test.ts
```

Expected: FAIL — "Cannot find module '../../src/coordination/meeting-factory'"

- [ ] **Step 3: Implement meeting factory**

```typescript
// src/coordination/meeting-factory.ts
import { getSupabaseClient } from "../database/client.js"
import { publishEvent } from "../state-bus/publisher.js"
import { EVENT_TYPES } from "../state-bus/event-types.js"
import type { HatMeeting, MeetingVote } from "./types.js"

interface CreateMeetingInput {
  taskId: string
  topic: string
  calledBy: string
}

interface CastVoteInput {
  meetingId: string
  agentId: string
  position: string
  confidence: number
  round: number
}

let _meetingCounter = 0
let _voteCounter = 0

function nextMeetingId(): string {
  _meetingCounter++
  return `MTG-${String(_meetingCounter).padStart(3, "0")}`
}

function nextVoteId(): string {
  _voteCounter++
  return `VOT-${String(_voteCounter).padStart(3, "0")}`
}

export async function createMeeting(input: CreateMeetingInput): Promise<HatMeeting> {
  const id = nextMeetingId()
  const now = new Date().toISOString()

  const row = {
    id,
    task_id: input.taskId,
    topic: input.topic,
    called_by: input.calledBy,
    status: "open" as const,
    round: 1,
    consensus: null,
    created_at: now,
    resolved_at: null,
  }

  const { error } = await getSupabaseClient().from("hat3x_meetings").insert(row)
  if (error != null) throw new Error(`Failed to create meeting: ${error.message}`)

  await publishEvent({
    taskId: input.taskId,
    eventType: EVENT_TYPES.MEETING_CALLED,
    agentId: input.calledBy,
    payload: { meeting: row },
  })

  return {
    id,
    taskId: input.taskId,
    topic: input.topic,
    calledBy: input.calledBy,
    status: "open",
    round: 1,
    consensus: null,
    createdAt: now,
    resolvedAt: null,
  }
}

export async function castVote(input: CastVoteInput): Promise<MeetingVote> {
  const id = nextVoteId()
  const now = new Date().toISOString()

  const row = {
    id,
    meeting_id: input.meetingId,
    agent_id: input.agentId,
    position: input.position,
    confidence: input.confidence,
    round: input.round,
    voted_at: now,
  }

  const { error } = await getSupabaseClient().from("hat3x_meeting_votes").insert(row)
  if (error != null) throw new Error(`Failed to cast vote: ${error.message}`)

  return {
    id,
    meetingId: input.meetingId,
    agentId: input.agentId,
    position: input.position,
    confidence: input.confidence,
    round: input.round,
    votedAt: now,
  }
}

export async function getVotes(meetingId: string, round: number): Promise<MeetingVote[]> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_meeting_votes")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("round", round)

  if (error != null) throw new Error(`Failed to get votes: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row["id"] as string,
    meetingId: row["meeting_id"] as string,
    agentId: row["agent_id"] as string,
    position: row["position"] as string,
    confidence: row["confidence"] as number,
    round: row["round"] as number,
    votedAt: row["voted_at"] as string,
  }))
}

export async function closeMeeting(meetingId: string, consensus: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("hat3x_meetings")
    .update({ status: "resolved", consensus, resolved_at: new Date().toISOString() })
    .eq("id", meetingId)

  if (error != null) throw new Error(`Failed to close meeting: ${error.message}`)
}

export async function escalateMeeting(meetingId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("hat3x_meetings")
    .update({ status: "escalated", resolved_at: new Date().toISOString() })
    .eq("id", meetingId)

  if (error != null) throw new Error(`Failed to escalate meeting: ${error.message}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd command && npx vitest run tests/coordination/meeting-factory.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add command/src/coordination/meeting-factory.ts command/tests/coordination/meeting-factory.test.ts
git commit -m "feat(coordination): add MeetingFactory — createMeeting, castVote, getVotes, closeMeeting, escalateMeeting"
```

---

### Task 4: Meeting Facilitator

**Files:**
- Create: `command/src/coordination/meeting-facilitator.ts`
- Test: `command/tests/coordination/meeting-facilitator.test.ts`

Consensus rule: `avgConfidence >= 0.70` AND the most-voted position has strictly more than 50% of votes.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/coordination/meeting-facilitator.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../../src/database/client")
vi.mock("../../src/coordination/meeting-factory")
vi.mock("../../src/checkpoint/factory")
vi.mock("../../src/state-bus/publisher")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

// Helper to build a MeetingVote
function makeVote(position: string, confidence: number, agentId = "agent-1") {
  return { id: "V1", meetingId: "MTG-001", agentId, position, confidence, round: 1, votedAt: "" }
}

describe("detectConsensus", () => {
  it("returns reached:true when avg confidence >= 0.70 and majority position > 50%", async () => {
    const { detectConsensus } = await import("../../src/coordination/meeting-facilitator")
    const votes = [
      makeVote("launch", 0.85, "a1"),
      makeVote("launch", 0.80, "a2"),
      makeVote("delay", 0.60, "a3"),
    ]
    const result = detectConsensus(votes)
    expect(result.reached).toBe(true)
    expect(result.position).toBe("launch")
    expect(result.avgConfidence).toBeCloseTo(0.75)
  })

  it("returns reached:false when avg confidence < 0.70", async () => {
    const { detectConsensus } = await import("../../src/coordination/meeting-facilitator")
    const votes = [
      makeVote("launch", 0.60, "a1"),
      makeVote("launch", 0.65, "a2"),
    ]
    const result = detectConsensus(votes)
    expect(result.reached).toBe(false)
  })

  it("returns reached:false when majority <= 50%", async () => {
    const { detectConsensus } = await import("../../src/coordination/meeting-facilitator")
    const votes = [
      makeVote("launch", 0.90, "a1"),
      makeVote("delay", 0.90, "a2"),
    ]
    const result = detectConsensus(votes)
    expect(result.reached).toBe(false)
  })

  it("returns reached:false for empty votes", async () => {
    const { detectConsensus } = await import("../../src/coordination/meeting-facilitator")
    const result = detectConsensus([])
    expect(result.reached).toBe(false)
    expect(result.avgConfidence).toBe(0)
  })
})

describe("maybeEscalate", () => {
  it("does NOT escalate when round < 2", async () => {
    const { closeMeeting } = await import("../../src/coordination/meeting-factory")
    vi.mocked(closeMeeting).mockResolvedValue(undefined)

    const { maybeEscalate } = await import("../../src/coordination/meeting-facilitator")
    const meeting = { id: "MTG-001", taskId: "T1", topic: "test", calledBy: "a1",
      status: "open" as const, round: 1, consensus: null, createdAt: "", resolvedAt: null }
    const votes = [makeVote("launch", 0.90, "a1"), makeVote("launch", 0.90, "a2")]

    const checkpoint = await maybeEscalate(meeting, votes)
    expect(checkpoint).toBeNull()
    expect(closeMeeting).toHaveBeenCalledWith("MTG-001", "launch")
  })

  it("escalates to checkpoint when round >= 2 and no consensus", async () => {
    const { escalateMeeting } = await import("../../src/coordination/meeting-factory")
    const { createCheckpoint } = await import("../../src/checkpoint/factory")
    const { publishEvent } = await import("../../src/state-bus/publisher")

    vi.mocked(escalateMeeting).mockResolvedValue(undefined)
    vi.mocked(createCheckpoint).mockResolvedValue({
      id: "CHK-001", taskId: "T1", afterPhase: 1, reason: "No consensus after 2 rounds: test",
      requiredApproval: "jose", status: "pending", feedback: null,
      triggeredAt: "", resolvedAt: null,
    })
    vi.mocked(publishEvent).mockResolvedValue(undefined)

    const { maybeEscalate } = await import("../../src/coordination/meeting-facilitator")
    const meeting = { id: "MTG-001", taskId: "T1", topic: "test", calledBy: "a1",
      status: "open" as const, round: 2, consensus: null, createdAt: "", resolvedAt: null }
    const votes = [makeVote("launch", 0.50, "a1"), makeVote("delay", 0.50, "a2")]

    const checkpoint = await maybeEscalate(meeting, votes)
    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.id).toBe("CHK-001")
    expect(escalateMeeting).toHaveBeenCalledWith("MTG-001")
    expect(publishEvent).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command && npx vitest run tests/coordination/meeting-facilitator.test.ts
```

Expected: FAIL — "Cannot find module '../../src/coordination/meeting-facilitator'"

- [ ] **Step 3: Implement meeting facilitator**

```typescript
// src/coordination/meeting-facilitator.ts
import { closeMeeting, escalateMeeting } from "./meeting-factory.js"
import { createCheckpoint } from "../checkpoint/factory.js"
import { publishEvent } from "../state-bus/publisher.js"
import { EVENT_TYPES } from "../state-bus/event-types.js"
import type { HatMeeting, MeetingVote, ConsensusResult } from "./types.js"
import type { HatCheckpoint } from "../checkpoint/types.js"

export function detectConsensus(votes: MeetingVote[]): ConsensusResult {
  if (votes.length === 0) {
    return { reached: false, position: null, avgConfidence: 0, majorityPosition: null }
  }

  const avgConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length

  // Count votes per position
  const counts = new Map<string, number>()
  for (const vote of votes) {
    counts.set(vote.position, (counts.get(vote.position) ?? 0) + 1)
  }

  // Find position with most votes
  let topPosition: string | null = null
  let topCount = 0
  for (const [pos, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count
      topPosition = pos
    }
  }

  const majorityReached = topCount > votes.length / 2
  const confidenceReached = avgConfidence >= 0.70

  return {
    reached: majorityReached && confidenceReached,
    position: majorityReached && confidenceReached ? topPosition : null,
    avgConfidence,
    majorityPosition: topPosition,
  }
}

export async function maybeEscalate(
  meeting: HatMeeting,
  votes: MeetingVote[]
): Promise<HatCheckpoint | null> {
  const consensus = detectConsensus(votes)

  if (consensus.reached && consensus.position != null) {
    await closeMeeting(meeting.id, consensus.position)
    return null
  }

  // Only escalate when no consensus after round 2+
  if (meeting.round < 2) {
    return null
  }

  // Escalate: create checkpoint + update meeting + publish event
  const checkpoint = await createCheckpoint({
    taskId: meeting.taskId,
    afterPhase: meeting.round,
    reason: `No consensus after ${meeting.round} rounds: ${meeting.topic}`,
    requiredApproval: "jose",
  })

  await escalateMeeting(meeting.id)

  await publishEvent({
    taskId: meeting.taskId,
    eventType: EVENT_TYPES.CHECKPOINT_TRIGGERED,
    agentId: null,
    payload: { checkpoint, meetingId: meeting.id },
  })

  return checkpoint
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd command && npx vitest run tests/coordination/meeting-facilitator.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add command/src/coordination/meeting-facilitator.ts command/tests/coordination/meeting-facilitator.test.ts
git commit -m "feat(coordination): add MeetingFacilitator — detectConsensus (pure) and maybeEscalate"
```

---

### Task 5: Checkpoint Monitor

**Files:**
- Create: `command/src/coordination/checkpoint-monitor.ts`
- Test: `command/tests/coordination/checkpoint-monitor.test.ts`

Queries `hat3x_checkpoints` for rows with `status='pending'` AND `triggered_at < now - 24h`, then calls `sender.sendCheckpointReminder` for each.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/coordination/checkpoint-monitor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_SENDER = {
  sendCheckpointReminder: vi.fn().mockResolvedValue(undefined),
}

const STALE_ROW = {
  id: "CHK-001",
  task_id: "HAT3X-001",
  after_phase: 1,
  reason: "Old checkpoint",
  required_approval: "jose",
  status: "pending",
  feedback: null,
  triggered_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  resolved_at: null,
}

describe("checkTimeouts", () => {
  it("calls sendCheckpointReminder for each stale pending checkpoint", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: [STALE_ROW], error: null }),
          }),
        }),
      }),
    } as any)

    const { checkTimeouts } = await import("../../src/coordination/checkpoint-monitor")
    await checkTimeouts(MOCK_SENDER as any)

    expect(MOCK_SENDER.sendCheckpointReminder).toHaveBeenCalledOnce()
    const arg = MOCK_SENDER.sendCheckpointReminder.mock.calls[0][0]
    expect(arg.id).toBe("CHK-001")
  })

  it("does nothing when no stale checkpoints", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any)

    const { checkTimeouts } = await import("../../src/coordination/checkpoint-monitor")
    await checkTimeouts(MOCK_SENDER as any)

    expect(MOCK_SENDER.sendCheckpointReminder).not.toHaveBeenCalled()
  })

  it("throws when query fails", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
          }),
        }),
      }),
    } as any)

    const { checkTimeouts } = await import("../../src/coordination/checkpoint-monitor")
    await expect(checkTimeouts(MOCK_SENDER as any)).rejects.toThrow("Failed to query checkpoints")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command && npx vitest run tests/coordination/checkpoint-monitor.test.ts
```

Expected: FAIL — "Cannot find module '../../src/coordination/checkpoint-monitor'"

- [ ] **Step 3: Implement checkpoint monitor**

```typescript
// src/coordination/checkpoint-monitor.ts
import { getSupabaseClient } from "../database/client.js"
import type { HatCheckpoint } from "../checkpoint/types.js"
import type { NotificationSender } from "../telegram/notifications/sender.js"

const TIMEOUT_MS = 24 * 60 * 60 * 1000  // 24 hours

function rowToCheckpoint(row: Record<string, unknown>): HatCheckpoint {
  return {
    id: row["id"] as string,
    taskId: row["task_id"] as string,
    afterPhase: row["after_phase"] as number,
    reason: row["reason"] as string,
    requiredApproval: row["required_approval"] as HatCheckpoint["requiredApproval"],
    status: row["status"] as HatCheckpoint["status"],
    feedback: (row["feedback"] as string | null) ?? null,
    triggeredAt: row["triggered_at"] as string,
    resolvedAt: (row["resolved_at"] as string | null) ?? null,
  }
}

export async function checkTimeouts(sender: NotificationSender): Promise<void> {
  const cutoff = new Date(Date.now() - TIMEOUT_MS).toISOString()

  const { data, error } = await getSupabaseClient()
    .from("hat3x_checkpoints")
    .select("*")
    .eq("status", "pending")
    .lt("triggered_at", cutoff)

  if (error != null) throw new Error(`Failed to query checkpoints: ${error.message}`)

  for (const row of data ?? []) {
    const checkpoint = rowToCheckpoint(row as Record<string, unknown>)
    await sender.sendCheckpointReminder(checkpoint)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd command && npx vitest run tests/coordination/checkpoint-monitor.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add command/src/coordination/checkpoint-monitor.ts command/tests/coordination/checkpoint-monitor.test.ts
git commit -m "feat(coordination): add CheckpointMonitor — checkTimeouts with 24h stale detection"
```

---

### Task 6: Extend NotificationSender + GlobalSubscriber

**Files:**
- Modify: `command/src/telegram/notifications/sender.ts`
- Modify: `command/src/state-bus/global-subscriber.ts`
- Test: `command/tests/telegram/sender-coordination.test.ts`
- Test: `command/tests/state-bus/global-subscriber-coordination.test.ts`

Adds three new methods to `NotificationSender` and two new event routes to `GlobalSubscriber`.

- [ ] **Step 1: Write failing tests for NotificationSender**

```typescript
// tests/telegram/sender-coordination.test.ts
import { describe, it, expect, vi } from "vitest"
import { NotificationSender } from "../../src/telegram/notifications/sender"

const MOCK_BOT = { api: { sendMessage: vi.fn().mockResolvedValue(undefined) } }

beforeEach(() => {
  vi.clearAllMocks()
  process.env["TELEGRAM_JOSE_CHAT_ID"] = "12345"
})

describe("sendMeetingCalled", () => {
  it("sends a message with meeting topic and calledBy", async () => {
    const sender = new NotificationSender(MOCK_BOT as any)
    await sender.sendMeetingCalled("MTG-001", "HAT3X-001", "Launch scope?", "pm-chatbots")
    expect(MOCK_BOT.api.sendMessage).toHaveBeenCalledOnce()
    const [, text] = MOCK_BOT.api.sendMessage.mock.calls[0]
    expect(text).toContain("MTG-001")
    expect(text).toContain("Launch scope?")
  })
})

describe("sendMeetingResolved", () => {
  it("sends a message with consensus", async () => {
    const sender = new NotificationSender(MOCK_BOT as any)
    await sender.sendMeetingResolved("MTG-001", "HAT3X-001", "launch")
    expect(MOCK_BOT.api.sendMessage).toHaveBeenCalledOnce()
    const [, text] = MOCK_BOT.api.sendMessage.mock.calls[0]
    expect(text).toContain("MTG-001")
    expect(text).toContain("launch")
  })
})

describe("sendCheckpointReminder", () => {
  it("sends a reminder message for stale checkpoint", async () => {
    const sender = new NotificationSender(MOCK_BOT as any)
    const checkpoint = {
      id: "CHK-001", taskId: "HAT3X-001", afterPhase: 1,
      reason: "Old checkpoint", requiredApproval: "jose" as const,
      status: "pending" as const, feedback: null,
      triggeredAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
    }
    await sender.sendCheckpointReminder(checkpoint)
    expect(MOCK_BOT.api.sendMessage).toHaveBeenCalledOnce()
    const [, text] = MOCK_BOT.api.sendMessage.mock.calls[0]
    expect(text).toContain("CHK-001")
    expect(text).toContain("recordatorio")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command && npx vitest run tests/telegram/sender-coordination.test.ts
```

Expected: FAIL — "sendMeetingCalled is not a function"

- [ ] **Step 3: Add methods to NotificationSender**

Open `src/telegram/notifications/sender.ts` and add these three methods to the `NotificationSender` class (before the closing brace):

```typescript
  async sendMeetingCalled(
    meetingId: string,
    taskId: string,
    topic: string,
    calledBy: string
  ): Promise<void> {
    const chatId = this.getChatId()
    const text = [
      `🗣️ *Reunión convocada — ${meetingId}*`,
      `Tarea: \`${taskId}\``,
      `Tema: ${topic}`,
      `Convocada por: \`${calledBy}\``,
    ].join("\n")
    await this.bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" })
  }

  async sendMeetingResolved(
    meetingId: string,
    taskId: string,
    consensus: string
  ): Promise<void> {
    const chatId = this.getChatId()
    const text = [
      `✅ *Reunión resuelta — ${meetingId}*`,
      `Tarea: \`${taskId}\``,
      `Consenso: *${consensus}*`,
    ].join("\n")
    await this.bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" })
  }

  async sendCheckpointReminder(checkpoint: HatCheckpoint): Promise<void> {
    const chatId = this.getChatId()
    const hours = Math.floor(
      (Date.now() - new Date(checkpoint.triggeredAt).getTime()) / (1000 * 60 * 60)
    )
    const text = [
      `⏰ *recordatorio — Checkpoint pendiente: ${checkpoint.id}*`,
      `Tarea: \`${checkpoint.taskId}\``,
      `Motivo: ${checkpoint.reason}`,
      `Pendiente hace: ${hours}h`,
      "",
      `Aprueba: /aprobar ${checkpoint.id}`,
      `Rechaza: /rechazar ${checkpoint.id} <motivo>`,
    ].join("\n")
    await this.bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" })
  }
```

- [ ] **Step 4: Run NotificationSender tests**

```bash
cd command && npx vitest run tests/telegram/sender-coordination.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Write failing tests for global-subscriber routing**

```typescript
// tests/state-bus/global-subscriber-coordination.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

const MOCK_SENDER = {
  sendCheckpointAlert: vi.fn().mockResolvedValue(undefined),
  sendTaskCompleted: vi.fn().mockResolvedValue(undefined),
  sendAgentBlocked: vi.fn().mockResolvedValue(undefined),
  sendMeetingCalled: vi.fn().mockResolvedValue(undefined),
  sendMeetingResolved: vi.fn().mockResolvedValue(undefined),
  sendCheckpointReminder: vi.fn().mockResolvedValue(undefined),
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

function makeMockChannel(eventRow: Record<string, unknown>) {
  return {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation((_type, _opts, handler) => {
        void Promise.resolve().then(() => handler({ new: eventRow }))
        return { subscribe: vi.fn().mockImplementation((cb) => { cb("SUBSCRIBED", null) }) }
      }),
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  }
}

describe("meeting.called routing", () => {
  it("calls sendMeetingCalled when meeting.called event received", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(makeMockChannel({
      task_id: "HAT3X-001",
      event_type: "meeting.called",
      agent_id: "pm-chatbots",
      payload: { meeting: { id: "MTG-001", topic: "Launch?", called_by: "pm-chatbots" } },
    }) as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()
    await new Promise((r) => setTimeout(r, 20))

    expect(MOCK_SENDER.sendMeetingCalled).toHaveBeenCalledOnce()
    expect(MOCK_SENDER.sendMeetingCalled).toHaveBeenCalledWith("MTG-001", "HAT3X-001", "Launch?", "pm-chatbots")
  })
})

describe("meeting.resolved routing", () => {
  it("calls sendMeetingResolved when meeting.resolved event received", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(makeMockChannel({
      task_id: "HAT3X-001",
      event_type: "meeting.resolved",
      agent_id: null,
      payload: { meeting: { id: "MTG-001", consensus: "launch" } },
    }) as any)

    const { createGlobalSubscriber } = await import("../../src/state-bus/global-subscriber")
    const sub = createGlobalSubscriber(MOCK_SENDER as any)
    await sub.subscribe()
    await new Promise((r) => setTimeout(r, 20))

    expect(MOCK_SENDER.sendMeetingResolved).toHaveBeenCalledWith("MTG-001", "HAT3X-001", "launch")
  })
})
```

- [ ] **Step 6: Run global-subscriber tests to verify they fail**

```bash
cd command && npx vitest run tests/state-bus/global-subscriber-coordination.test.ts
```

Expected: FAIL — sendMeetingCalled not called

- [ ] **Step 7: Add event routing to global-subscriber**

Open `src/state-bus/global-subscriber.ts`. In the `handleEvent` function, add these two blocks after the existing `task.blocked` block (before the closing brace of `handleEvent`):

```typescript
    if (eventType === "meeting.called") {
      const mtgRow = payload["meeting"] as Record<string, unknown> | undefined
      if (mtgRow == null) return
      await sender.sendMeetingCalled(
        mtgRow["id"] as string,
        taskId,
        mtgRow["topic"] as string,
        mtgRow["called_by"] as string
      )
      return
    }

    if (eventType === "meeting.resolved") {
      const mtgRow = payload["meeting"] as Record<string, unknown> | undefined
      if (mtgRow == null) return
      await sender.sendMeetingResolved(
        mtgRow["id"] as string,
        taskId,
        (mtgRow["consensus"] as string | undefined) ?? ""
      )
      return
    }
```

Also update the `NotificationSender` import type to include the new methods — since TypeScript uses structural typing, this will compile as long as the mock satisfies the interface. No import changes needed.

- [ ] **Step 8: Run all subscriber tests**

```bash
cd command && npx vitest run tests/state-bus/
```

Expected: PASS (all existing + 2 new tests)

- [ ] **Step 9: Run full test suite**

```bash
cd command && npx vitest run
```

Expected: all tests pass (0 failed)

- [ ] **Step 10: Commit**

```bash
git add command/src/telegram/notifications/sender.ts \
        command/src/state-bus/global-subscriber.ts \
        command/tests/telegram/sender-coordination.test.ts \
        command/tests/state-bus/global-subscriber-coordination.test.ts
git commit -m "feat(coordination): extend NotificationSender + GlobalSubscriber for meeting events"
```

---

### Task 7: `oficina progress <id>` CLI Command

**Files:**
- Modify: `command/src/index.ts`
- Test: `command/tests/cli/progress.test.ts`

Displays: task status, open meetings for that task, pending checkpoints for that task. Queries three tables: `hat3x_tasks`, `hat3x_meetings` (status='open'), `hat3x_checkpoints` (status='pending').

- [ ] **Step 1: Read current src/index.ts to know where to add the command**

```bash
cd command && cat -n src/index.ts | head -60
```

Note the location of the last `program.command(...)` block. The new `progress` command goes after it.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/cli/progress.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getSupabaseClient } from "../../src/database/client"

vi.mock("../../src/database/client")

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

const MOCK_TASK = { id: "HAT3X-001", title: "Chatbot web", status: "active", priority: "high", current_phase: 2 }
const MOCK_MEETING = { id: "MTG-001", task_id: "HAT3X-001", topic: "Launch?", status: "open", round: 1, called_by: "pm-chatbots", created_at: new Date().toISOString() }
const MOCK_CHECKPOINT = { id: "CHK-001", task_id: "HAT3X-001", reason: "No consensus", status: "pending", triggered_at: new Date().toISOString() }

describe("fetchProgressData", () => {
  it("returns task, open meetings, and pending checkpoints", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "hat3x_tasks") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: MOCK_TASK, error: null }) }) }) }
        }
        if (table === "hat3x_meetings") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [MOCK_MEETING], error: null }) }) }) }
        }
        if (table === "hat3x_checkpoints") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [MOCK_CHECKPOINT], error: null }) }) }) }
        }
        return {}
      }),
    } as any)

    const { fetchProgressData } = await import("../../src/cli/progress")
    const result = await fetchProgressData("HAT3X-001")

    expect(result.task.id).toBe("HAT3X-001")
    expect(result.meetings).toHaveLength(1)
    expect(result.checkpoints).toHaveLength(1)
  })

  it("throws when task not found", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }) })
        })
      }),
    } as any)

    const { fetchProgressData } = await import("../../src/cli/progress")
    await expect(fetchProgressData("MISSING")).rejects.toThrow("Task not found")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd command && npx vitest run tests/cli/progress.test.ts
```

Expected: FAIL — "Cannot find module '../../src/cli/progress'"

- [ ] **Step 4: Create the progress data fetcher**

```typescript
// src/cli/progress.ts
import { getSupabaseClient } from "../database/client.js"

export interface ProgressData {
  task: Record<string, unknown>
  meetings: Record<string, unknown>[]
  checkpoints: Record<string, unknown>[]
}

export async function fetchProgressData(taskId: string): Promise<ProgressData> {
  const client = getSupabaseClient()

  const { data: task, error: taskError } = await client
    .from("hat3x_tasks")
    .select("*")
    .eq("id", taskId)
    .single()

  if (taskError != null || task == null) {
    throw new Error(`Task not found: ${taskId}`)
  }

  const { data: meetings, error: mtgError } = await client
    .from("hat3x_meetings")
    .select("*")
    .eq("task_id", taskId)
    .eq("status", "open")

  if (mtgError != null) throw new Error(`Failed to fetch meetings: ${mtgError.message}`)

  const { data: checkpoints, error: cpError } = await client
    .from("hat3x_checkpoints")
    .select("*")
    .eq("task_id", taskId)
    .eq("status", "pending")

  if (cpError != null) throw new Error(`Failed to fetch checkpoints: ${cpError.message}`)

  return {
    task: task as Record<string, unknown>,
    meetings: (meetings ?? []) as Record<string, unknown>[],
    checkpoints: (checkpoints ?? []) as Record<string, unknown>[],
  }
}

export function formatProgress(data: ProgressData): string {
  const task = data.task
  const lines: string[] = [
    `═══ PROGRESO: ${task["id"]} ═══`,
    `Título:  ${task["title"]}`,
    `Estado:  ${task["status"]}`,
    `Fase:    ${task["current_phase"] ?? "—"}`,
    `Prioridad: ${task["priority"] ?? "—"}`,
    "",
  ]

  if (data.meetings.length > 0) {
    lines.push(`── Reuniones abiertas (${data.meetings.length}) ──`)
    for (const m of data.meetings) {
      lines.push(`  [${m["id"]}] ${m["topic"]} · ronda ${m["round"]} · por ${m["called_by"]}`)
    }
    lines.push("")
  }

  if (data.checkpoints.length > 0) {
    lines.push(`── Checkpoints pendientes (${data.checkpoints.length}) ──`)
    for (const c of data.checkpoints) {
      lines.push(`  [${c["id"]}] ${c["reason"]}`)
      lines.push(`    → /aprobar ${c["id"]}  |  /rechazar ${c["id"]} <motivo>`)
    }
    lines.push("")
  }

  if (data.meetings.length === 0 && data.checkpoints.length === 0) {
    lines.push("Sin reuniones ni checkpoints pendientes.")
  }

  return lines.join("\n")
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd command && npx vitest run tests/cli/progress.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Wire up the CLI command in src/index.ts**

Read `src/index.ts` first, then add the `progress` command after the last `program.command(...)` block:

```typescript
import { fetchProgressData, formatProgress } from "./cli/progress.js"

// ... (existing code) ...

program
  .command("progress <id>")
  .description("Muestra el progreso de una tarea: reuniones abiertas y checkpoints pendientes")
  .action(async (id: string) => {
    try {
      const data = await fetchProgressData(id)
      console.log(formatProgress(data))
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })
```

- [ ] **Step 7: Run full test suite**

```bash
cd command && npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Smoke test the command**

```bash
cd command && npx tsx src/index.ts progress --help
```

Expected: displays help text for the `progress` command.

- [ ] **Step 9: Commit**

```bash
git add command/src/cli/progress.ts \
        command/src/index.ts \
        command/tests/cli/progress.test.ts
git commit -m "feat(cli): add 'oficina progress <id>' command — task status, open meetings, pending checkpoints"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All coordination spec items addressed — meetings (Task 1–4), checkpoint monitor (Task 5), Telegram notifications for meetings (Task 6), progress CLI (Task 7)
- [x] **No placeholders:** All steps include actual code blocks, exact commands, expected output
- [x] **Type consistency:** `HatMeeting.calledBy` matches `called_by` DB column mapping; `MeetingVote.confidence` is `number` (0–1); `ConsensusResult.reached` is boolean
- [x] **Import paths:** All use `.js` extension for ESM compatibility
- [x] **TDD order:** Every task has "write failing test" → "run to see it fail" → "implement" → "run to see it pass" → "commit"
