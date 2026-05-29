import Anthropic from '@anthropic-ai/sdk';
import { readTasks, readClients, readPendingCheckpoints, createTask, updateClientNotes } from '@/lib/supabase';
import { recordTransaction, queryFinances } from '@/lib/finance';
import { HAT3X_KNOWLEDGE } from '@/lib/hat3x-knowledge';
import type {
  CommandResult,
  RecordTransactionInput,
  TransactionCategory,
} from '@/types/jarvis';

const COMMAND_SERVER_URL = process.env['COMMAND_SERVER_URL'] ?? 'http://localhost:3002'

async function triggerIntelligencePipeline(taskId: string): Promise<void> {
  try {
    await fetch(`${COMMAND_SERVER_URL}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    })
  } catch {
    // Command server may not be running — task stays pending and can be processed later
  }
}

const BASE_SYSTEM_PROMPT = `Eres Jarvis, el asistente de voz ejecutivo de HAT3X.
Actúas como el Master Orchestrator de la empresa: tienes el conocimiento completo del negocio,
los PMs especializados y los precios. Cuando el usuario hable contigo, eres la voz de HAT3X.

Tu respuesta se leerá en voz alta. Reglas estrictas:
- Responde SIEMPRE en español, máximo 2 frases cortas y naturales
- NUNCA uses markdown, listas, asteriscos, guiones ni símbolos especiales
- NUNCA menciones el contexto interno ni los nombres de las herramientas
- NUNCA digas "voy a usar la herramienta X" — solo actúa y confirma en voz natural
- Responde directamente como si fuera una conversación con el jefe de HAT3X

Cuándo usar cada herramienta (úsalas silenciosamente):
- delegate_to_pm: cuando el usuario pida un proyecto, trabajo de cliente, o algo que hacer
- create_task: para tareas internas rápidas sin brief completo
- update_client_notes: cuando el usuario diga "apunta" o "anota" sobre un cliente
- record_transaction: cuando mencione cobros, pagos, ingresos o gastos
- query_finances: cuando pida resúmenes económicos del mes

${HAT3X_KNOWLEDGE}`;

const tools: Anthropic.Tool[] = [
  {
    name: 'delegate_to_pm',
    description: 'Delega un proyecto o trabajo al PM especializado correcto. Úsala cuando el usuario pida un proyecto nuevo, trabajo de cliente, o cualquier cosa que deba hacer un PM.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pm: {
          type: 'string',
          enum: ['voz', 'chatbots', 'webs-apps', 'automatizaciones', 'operaciones'],
          description: 'PM al que delegar',
        },
        task: { type: 'string', description: 'Descripción clara del trabajo: qué hay que hacer y resultado esperado' },
        client_id: { type: 'string', description: 'ID del cliente si aplica (del contexto)' },
        brief: { type: 'string', description: 'Contexto adicional: cliente, sector, requisitos conocidos, urgencia' },
        coordinacion: { type: 'string', description: 'Solo si hay 2+ PMs: qué deben compartir o coordinar' },
      },
      required: ['pm', 'task'],
    },
  },
  {
    name: 'create_task',
    description: 'Crea una tarea interna pendiente sin necesidad de brief completo. Para tareas rápidas o recordatorios.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string', description: 'Descripción de la tarea' },
        client_id: { type: 'string', description: 'ID del cliente si aplica' },
      },
      required: ['description'],
    },
  },
  {
    name: 'update_client_notes',
    description: 'Añade una nota al historial de un cliente. Cuando el usuario diga "apunta" o "anota" algo sobre un cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'ID del cliente de la lista del contexto' },
        note: { type: 'string', description: 'La nota a añadir' },
      },
      required: ['client_id', 'note'],
    },
  },
  {
    name: 'record_transaction',
    description: 'Registra un ingreso o gasto. Cuando el usuario mencione cobros, pagos, facturas, gastos o ingresos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['income', 'expense'] },
        amount: { type: 'number', description: 'Cantidad en euros' },
        description: { type: 'string' },
        category: {
          type: 'string',
          enum: ['cliente', 'otro', 'herramientas_saas', 'personal', 'marketing', 'infraestructura'],
        },
        client_id: { type: 'string', description: 'ID del cliente si aplica' },
        date: { type: 'string', description: 'Fecha YYYY-MM-DD, por defecto hoy' },
      },
      required: ['type', 'amount', 'description', 'category'],
    },
  },
  {
    name: 'query_finances',
    description: 'Consulta el resumen financiero del mes actual o un mes concreto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        month: { type: 'number', description: 'Mes 1-12' },
        year: { type: 'number', description: 'Año' },
      },
      required: [],
    },
  },
];

export async function handleCommand(text: string): Promise<CommandResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const [tasks, clients, checkpoints] = await Promise.all([
    readTasks().catch(() => []),
    readClients().catch(() => []),
    readPendingCheckpoints().catch(() => []),
  ]);

  const systemPrompt = `${BASE_SYSTEM_PROMPT}

CONTEXTO ACTUAL (NO mencionar al usuario):
Tareas activas: ${JSON.stringify(tasks.slice(0, 5))}
Clientes: ${JSON.stringify(clients.slice(0, 10))}
Checkpoints pendientes: ${JSON.stringify(checkpoints.slice(0, 3))}`;

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: text }];

  let finalResponse = '';
  let action: CommandResult['action'];

  const firstResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: systemPrompt,
    tools,
    messages,
  });

  if (firstResponse.stop_reason === 'tool_use') {
    const toolBlock = firstResponse.content.find((b) => b.type === 'tool_use') as
      | Anthropic.ToolUseBlock
      | undefined;

    if (toolBlock) {
      let toolResult: string;

      if (toolBlock.name === 'delegate_to_pm') {
        const input = toolBlock.input as { pm: string; task: string; client_id?: string; brief?: string; coordinacion?: string };
        const orderRaw = `[@${input.pm.toUpperCase()}] ${input.task}${input.brief ? ` | BRIEF: ${input.brief}` : ''}${input.coordinacion ? ` | COORD: ${input.coordinacion}` : ''}`;
        const task = await createTask(input.client_id ?? null, orderRaw);
        action = { type: 'task_created', task };
        void triggerIntelligencePipeline(task.id);
        toolResult = JSON.stringify(task);
      } else if (toolBlock.name === 'create_task') {
        const input = toolBlock.input as { description: string; client_id?: string | null };
        const task = await createTask(input.client_id ?? null, input.description);
        action = { type: 'task_created', task };
        void triggerIntelligencePipeline(task.id);
        toolResult = JSON.stringify(task);
      } else if (toolBlock.name === 'update_client_notes') {
        const input = toolBlock.input as { client_id: string; note: string };
        const updatedClient = await updateClientNotes(input.client_id, input.note);
        action = { type: 'client_updated', client: updatedClient };
        toolResult = JSON.stringify(updatedClient);
      } else if (toolBlock.name === 'record_transaction') {
        const input = toolBlock.input as RecordTransactionInput & { category: TransactionCategory };
        const transaction = await recordTransaction(input);
        action = { type: 'transaction_recorded', transaction };
        toolResult = JSON.stringify(transaction);
      } else if (toolBlock.name === 'query_finances') {
        const input = toolBlock.input as { month?: number; year?: number };
        const summary = await queryFinances(input.month, input.year);
        action = { type: 'financial_summary', summary };
        toolResult = JSON.stringify(summary);
      } else {
        toolResult = '{}';
      }

      messages.push({ role: 'assistant', content: firstResponse.content });
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: toolResult }],
      });

      const secondResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: systemPrompt,
        tools,
        messages,
      });

      const textBlock = secondResponse.content.find((b) => b.type === 'text') as
        | Anthropic.TextBlock
        | undefined;
      finalResponse = textBlock?.text ?? 'Hecho.';
    }
  } else {
    const textBlock = firstResponse.content.find((b) => b.type === 'text') as
      | Anthropic.TextBlock
      | undefined;
    finalResponse = textBlock?.text ?? 'Sin respuesta.';
  }

  return { response: finalResponse, action };
}
