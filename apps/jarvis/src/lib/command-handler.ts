import Anthropic from '@anthropic-ai/sdk';
import { readTasks, readClients, readPendingCheckpoints } from '@/lib/supabase';
import { recordTransaction, queryFinances } from '@/lib/finance';
import type {
  CommandResult,
  RecordTransactionInput,
  TransactionCategory,
} from '@/types/jarvis';

const BASE_SYSTEM_PROMPT = `Eres Jarvis, el asistente de voz ejecutivo de HAT3X, una consultoría de IA española.

Tu respuesta se leerá en voz alta. Reglas estrictas:
- Responde SIEMPRE en español, máximo 2 frases cortas y naturales
- NUNCA uses markdown, listas, asteriscos, guiones ni símbolos especiales
- NUNCA menciones ni resumas el contexto interno que recibes (tareas, clientes, checkpoints)
- NUNCA digas el nombre de las herramientas ni que usaste alguna
- Responde directamente a lo que el usuario pidió, como si fuera una conversación natural
- Si no hay información relevante, di algo breve y útil

Herramientas disponibles (úsalas silenciosamente):
- record_transaction: cuando el usuario mencione cobros, pagos, ingresos o gastos
- query_finances: cuando pida resúmenes económicos, ingresos o gastos del mes`;

const tools: Anthropic.Tool[] = [
  {
    name: 'record_transaction',
    description:
      'Registra un ingreso o gasto en la base de datos de HAT3X. Llámala cuando el usuario mencione cobros, pagos, facturas, gastos o ingresos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['income', 'expense'],
          description: 'income para ingresos, expense para gastos',
        },
        amount: { type: 'number', description: 'Cantidad en euros (número positivo)' },
        description: { type: 'string', description: 'Descripción breve de la transacción' },
        category: {
          type: 'string',
          enum: ['cliente', 'otro', 'herramientas_saas', 'personal', 'marketing', 'infraestructura'],
          description: 'Categoría de la transacción',
        },
        client_id: {
          type: 'string',
          description: 'ID del cliente en Supabase si aplica (opcional)',
        },
        date: {
          type: 'string',
          description: 'Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)',
        },
      },
      required: ['type', 'amount', 'description', 'category'],
    },
  },
  {
    name: 'query_finances',
    description:
      'Consulta el resumen financiero del mes actual o de un mes concreto. Llámala cuando el usuario pregunte por ingresos, gastos, margen o resúmenes económicos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        month: { type: 'number', description: 'Mes (1-12, opcional, por defecto el actual)' },
        year: { type: 'number', description: 'Año (opcional, por defecto el actual)' },
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

  // Context goes in system prompt — never in user message — so Claude won't repeat it aloud
  const systemPrompt = `${BASE_SYSTEM_PROMPT}

CONTEXTO INTERNO (NO mencionar al usuario bajo ningún concepto):
Tareas activas: ${JSON.stringify(tasks.slice(0, 5))}
Clientes: ${JSON.stringify(clients.slice(0, 5))}
Checkpoints pendientes: ${JSON.stringify(checkpoints.slice(0, 3))}`;

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: text },
  ];

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

      if (toolBlock.name === 'record_transaction') {
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
      finalResponse = textBlock?.text ?? 'Acción completada.';
    }
  } else {
    const textBlock = firstResponse.content.find((b) => b.type === 'text') as
      | Anthropic.TextBlock
      | undefined;
    finalResponse = textBlock?.text ?? 'Sin respuesta.';
  }

  return { response: finalResponse, action };
}
