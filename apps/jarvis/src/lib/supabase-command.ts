import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  const { data } = await supabase
    .from('hat3x_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as HatTask[]
}

export async function fetchTask(id: string): Promise<HatTask | null> {
  const { data } = await supabase
    .from('hat3x_tasks')
    .select('*')
    .eq('id', id)
    .single()
  return data as HatTask | null
}

export async function fetchCheckpoints(statusFilter?: string): Promise<HatCheckpoint[]> {
  let q = supabase.from('hat3x_checkpoints').select('*').order('triggered_at', { ascending: false })
  if (statusFilter) q = q.eq('status', statusFilter)
  const { data } = await q.limit(50)
  return (data ?? []) as HatCheckpoint[]
}

export async function fetchRecentEvents(limit = 30): Promise<BusEvent[]> {
  const { data } = await supabase
    .from('bus_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as BusEvent[]
}

export async function fetchTaskEvents(taskId: string): Promise<BusEvent[]> {
  const { data } = await supabase
    .from('bus_events')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as BusEvent[]
}

export async function fetchProposals(): Promise<EvolutionProposal[]> {
  const { data } = await supabase
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
  await supabase
    .from('hat3x_checkpoints')
    .update({ status, feedback: feedback ?? null, resolved_at: new Date().toISOString() })
    .eq('id', id)
}
