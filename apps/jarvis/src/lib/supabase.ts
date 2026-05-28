import { createClient } from '@supabase/supabase-js';
import type { DbTask, DbClient, DbCheckpoint } from '@/types/jarvis';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
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
