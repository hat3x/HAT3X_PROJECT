import { createClient } from '@supabase/supabase-js';
import type { DbTask, DbClient, DbCheckpoint } from '@/types/jarvis';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export function getSupabaseClient() {
  return getClient();
}

export async function readTasks(): Promise<DbTask[]> {
  const { data, error } = await getClient()
    .from('hat3x_tasks')
    .select('id, client_id, order_raw, status, created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error('[supabase] readTasks:', error.message); return []; }
  return (data ?? []) as DbTask[];
}

export async function readClients(): Promise<DbClient[]> {
  const { data, error } = await getClient()
    .from('hat3x_clients')
    .select('id, name, sector, notes, previous_projects')
    .order('name');
  if (error) { console.error('[supabase] readClients:', error.message); return []; }
  return (data ?? []) as DbClient[];
}

export async function readPendingCheckpoints(): Promise<DbCheckpoint[]> {
  const { data, error } = await getClient()
    .from('hat3x_checkpoints')
    .select('id, task_id, reason, status, triggered_at')
    .eq('status', 'pending')
    .order('triggered_at', { ascending: false });
  if (error) { console.error('[supabase] readPendingCheckpoints:', error.message); return []; }
  return (data ?? []) as DbCheckpoint[];
}

export async function createTask(clientId: string | null, description: string): Promise<DbTask> {
  const { data, error } = await getClient()
    .from('hat3x_tasks')
    .insert({ client_id: clientId ?? null, order_raw: description, status: 'pending' })
    .select('id, client_id, order_raw, status, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as DbTask;
}

export async function updateClientNotes(clientId: string, additionalNote: string): Promise<DbClient> {
  const supabase = getClient();
  const { data: existing } = await supabase
    .from('hat3x_clients')
    .select('notes')
    .eq('id', clientId)
    .single();
  const today = new Date().toISOString().slice(0, 10);
  const prevNotes = (existing?.notes ?? '').trim();
  const notes = prevNotes ? `${prevNotes}\n${today}: ${additionalNote}` : `${today}: ${additionalNote}`;
  const { data, error } = await supabase
    .from('hat3x_clients')
    .update({ notes })
    .eq('id', clientId)
    .select('id, name, sector, notes, previous_projects')
    .single();
  if (error) throw new Error(error.message);
  return data as DbClient;
}
