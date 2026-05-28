export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface CommandEntry {
  id: string;
  userText: string;
  jarvisResponse: string;
  timestamp: Date;
}

export interface TranscribeResponse {
  text: string;
}

export interface CommandResponse {
  response: string;
}

// Refleja el esquema de Supabase hat3x_tasks (solo lectura)
export interface DbTask {
  id: string;
  client_id: string | null;
  order_raw: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  created_at: string;
}

// Refleja hat3x_clients
export interface DbClient {
  id: string;
  name: string;
  sector: string | null;
  notes: string | null;
  previous_projects: string[];
}

// Refleja hat3x_checkpoints
export interface DbCheckpoint {
  id: string;
  task_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  triggered_at: string;
}
