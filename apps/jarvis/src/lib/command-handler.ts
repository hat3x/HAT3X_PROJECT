import Anthropic from '@anthropic-ai/sdk';
import { readTasks, readClients, readPendingCheckpoints } from '@/lib/supabase';

const SYSTEM_PROMPT = `Eres Jarvis, el asistente ejecutivo de HAT3X — consultora especializada en IA.

Tu interlocutor es José, el fundador. Respondes en español, de forma concisa y directa — como un asistente ejecutivo real, no un chatbot.

Reglas:
- Máximo 2-3 frases. Si necesitas listar, 5 ítems como máximo.
- Nunca inventes datos. Si no tienes información, dilo exactamente.
- Tono profesional pero cercano. Sin "Por supuesto" ni "Claro que sí".
- Si hay checkpoints pendientes, mencionarlos al final.`;

export async function handleCommand(text: string): Promise<{ response: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const [tasks, clients, checkpoints] = await Promise.all([
    readTasks(),
    readClients(),
    readPendingCheckpoints(),
  ]);

  const activeTasks = tasks.filter((t) => t.status === 'running' || t.status === 'pending');
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const context = [
    `TAREAS ACTIVAS (${activeTasks.length}):`,
    ...activeTasks.map((t) => `  - [${t.status}] ${t.id}: "${t.order_raw}" (cliente: ${t.client_id ?? 'interno'})`),
    ``,
    `TAREAS COMPLETADAS HISTÓRICAS: ${completedCount}`,
    ``,
    `CLIENTES (${clients.length}):`,
    ...clients.map((c) => `  - ${c.name} (${c.sector ?? 'sin sector'}): ${c.notes ?? 'sin notas'}`),
    ``,
    `CHECKPOINTS PENDIENTES DE APROBACIÓN: ${checkpoints.length}`,
    ...checkpoints.map((cp) => `  - ${cp.task_id}: "${cp.reason}"`),
  ].join('\n');

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: `${SYSTEM_PROMPT}\n\nCONTEXTO ACTUAL:\n${context}`,
    messages: [{ role: 'user', content: text }],
  });

  const first = message.content[0];
  if (first.type !== 'text') throw new Error('Unexpected response type from Claude');
  return { response: first.text };
}
