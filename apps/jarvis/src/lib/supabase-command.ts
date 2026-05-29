import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    _client = createClient(url, key)
  }
  return _client
}

export interface HatTask {
  id: string
  client_id: string | null
  order_raw: string
  subtasks: unknown[]
  execution_plan: { phases?: Phase[]; checkpoints?: unknown[]; totalEstimatedHours?: number; riskLevel?: string } | null
  control_mode: string
  status: string
  created_at: string
}

export interface Phase {
  phaseNumber: number
  subtasks: { subtaskId: string; agentId: string }[]
}

export interface HatCheckpoint {
  id: string
  task_id: string
  after_phase: number
  reason: string
  required_approval: string
  status: string
  feedback: string | null
  triggered_at: string
  resolved_at: string | null
}

export interface BusEvent {
  id: string
  task_id: string
  event_type: string
  agent_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface EvolutionProposal {
  id: string
  description: string
  impact: string
  evidence: Record<string, unknown>
  status: string
  created_at: string
}

export async function fetchTasks(): Promise<HatTask[]> {
  const { data } = await getSupabase()
    .from('hat3x_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as HatTask[]
}

export async function fetchTask(id: string): Promise<HatTask | null> {
  const { data } = await getSupabase()
    .from('hat3x_tasks')
    .select('*')
    .eq('id', id)
    .single()
  return data as HatTask | null
}

export async function fetchCheckpoints(statusFilter?: string): Promise<HatCheckpoint[]> {
  let q = getSupabase().from('hat3x_checkpoints').select('*').order('triggered_at', { ascending: false })
  if (statusFilter) q = q.eq('status', statusFilter)
  const { data } = await q.limit(50)
  return (data ?? []) as HatCheckpoint[]
}

export async function fetchRecentEvents(limit = 30): Promise<BusEvent[]> {
  const { data } = await getSupabase()
    .from('bus_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as BusEvent[]
}

export async function fetchTaskEvents(taskId: string): Promise<BusEvent[]> {
  const { data } = await getSupabase()
    .from('bus_events')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as BusEvent[]
}

export async function fetchProposals(): Promise<EvolutionProposal[]> {
  const { data } = await getSupabase()
    .from('evolution_proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  return (data ?? []) as EvolutionProposal[]
}

export async function resolveCheckpoint(
  id: string,
  status: 'approved' | 'rejected',
  feedback?: string
): Promise<void> {
  await getSupabase()
    .from('hat3x_checkpoints')
    .update({ status, feedback: feedback ?? null, resolved_at: new Date().toISOString() })
    .eq('id', id)
}
