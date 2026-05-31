import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import {
  createClientRecord,
  findClients,
  readTasks,
  readClients,
  readPendingCheckpoints,
  updateClientNotes,
} from '@/lib/supabase';
import { recordTransaction, queryFinances } from '@/lib/finance';
import {
  addCompanyMemory,
  readCompanyBrainContext,
  recordProjectCost,
  recordProjectRevenue,
  recordRecurringExpense,
} from '@/lib/company-brain';
import { HAT3X_KNOWLEDGE } from '@/lib/hat3x-knowledge';
import type {
  CommandResult,
  ExecutivePlan,
  RecordTransactionInput,
  TransactionCategory,
} from '@/types/jarvis';

const PROJECT_ROOT =
  process.env['HAT3X_PROJECT_ROOT'] ?? 'C:\\Users\\josem\\Desktop\\HAT3X\\CLAUDE\\HAT3X';
const MEMORY_DIR =
  process.env['HAT3X_MEMORY_DIR'] ??
  'C:\\Users\\josem\\.claude\\projects\\C--Users-josem-Desktop-HAT3X-CLAUDE-HAT3X\\memory';
const COMMAND_SERVER_URL = process.env['COMMAND_SERVER_URL'] ?? 'http://localhost:3002';
const JARVIS_MODEL = process.env['JARVIS_MODEL'] ?? 'claude-sonnet-4-6';
const MAX_TOOL_ROUNDS = 6;

// ─── File helpers ─────────────────────────────────────────────────────────────

function safeRead(path: string, maxChars = 8000): string {
  try {
    const content = readFileSync(path, 'utf-8');
    return content.length > maxChars ? content.slice(0, maxChars) + '\n...[truncado]' : content;
  } catch {
    return '';
  }
}

function resolvePath(p: string): string {
  if (p.startsWith('C:') || p.startsWith('/') || p.startsWith('\\')) return p;
  return join(PROJECT_ROOT, p);
}

// ─── Project memory loader ───────────────────────────────────────────────────

function loadProjectMemory(): string {
  const parts: string[] = [];

  const claudeMd = safeRead(join(PROJECT_ROOT, 'CLAUDE.md'), 4000);
  if (claudeMd) parts.push(`=== CLAUDE.md ===\n${claudeMd}`);

  if (existsSync(MEMORY_DIR)) {
    const files = readdirSync(MEMORY_DIR).filter(
      (f) => f.endsWith('.md') && f !== 'MEMORY.md'
    );
    for (const f of files) {
      const content = safeRead(join(MEMORY_DIR, f), 2000);
      if (content) parts.push(`=== Memoria: ${f} ===\n${content}`);
    }
  }

  const clientsDir = join(PROJECT_ROOT, 'clients', 'projects');
  if (existsSync(clientsDir)) {
    try {
      const clients = readdirSync(clientsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      for (const client of clients) {
        const clientPath = join(clientsDir, client);
        try {
          const files = readdirSync(clientPath, { withFileTypes: true });
          const mdFile = files.find((f) => f.isFile() && f.name.toLowerCase().endsWith('.md'));
          if (mdFile) {
            const summary = safeRead(join(clientPath, mdFile.name), 1500);
            if (summary) parts.push(`=== Cliente: ${client} ===\n${summary}`);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return parts.join('\n\n---\n\n');
}

// ─── Intelligence pipeline ───────────────────────────────────────────────────

async function triggerIntelligencePipeline(taskId: string): Promise<void> {
  try {
    await fetch(`${COMMAND_SERVER_URL}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    });
  } catch { /* server may not be running */ }
}

async function previewPlan(orderRaw: string, clientId?: string | null): Promise<ExecutivePlan> {
  const response = await fetch(`${COMMAND_SERVER_URL}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderRaw, clientId: clientId ?? null }),
  });
  if (!response.ok) throw new Error(`Command preview failed: ${response.status}`);
  const data = await response.json() as Omit<ExecutivePlan, 'orderRaw' | 'clientId'>;
  return { orderRaw, clientId: clientId ?? null, ...data };
}

// ─── System prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(projectMemory: string): string {
  return `Eres Jarvis, el asistente ejecutivo con acceso completo al proyecto HAT3X.
Actúas como Claude Code con interfaz de voz: lees, escribes y buscas en cualquier archivo del proyecto.
El usuario se llama Jose Miguel, le llamas siempre Jota.

Tu respuesta se leerá en voz alta:
- Responde en español, de forma natural y conversacional
- Para acciones: una frase confirmando lo que hiciste
- Para consultas: resume los datos clave sin listas ni símbolos especiales
- NUNCA uses markdown, asteriscos, guiones ni símbolos en la respuesta hablada
- Usa las herramientas silenciosamente y confirma el resultado en voz natural

Herramientas de sistema de ficheros:
- read_file: lee cualquier archivo del proyecto (usa rutas relativas a PROJECT_ROOT o absolutas)
- list_directory: ve qué hay en una carpeta
- search_files: busca texto en archivos del proyecto
- write_file: crea o modifica archivos (propuestas, contratos, notas, etc.)
- run_command: ejecuta comandos (git, npm, etc.)

PROJECT_ROOT = ${PROJECT_ROOT}

Herramientas de negocio: find_clients, create_client, delegate_to_pm, create_task,
update_client_notes, record_transaction, query_finances, record_recurring_expense,
record_project_revenue, record_project_cost, add_company_memory.

Reglas: usa read_file antes de responder sobre clientes o proyectos para dar datos reales.
No inventes client_id — usa find_clients si no tienes el ID.

${HAT3X_KNOWLEDGE}

━━━ MEMORIA DEL PROYECTO ━━━
${projectMemory}`;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Lee el contenido de cualquier archivo del proyecto HAT3X.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Ruta relativa al PROJECT_ROOT o absoluta. Ej: "clients/projects/biodental", "CLAUDE.md"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'Lista los archivos y carpetas de un directorio.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Ruta relativa al PROJECT_ROOT o absoluta.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Busca texto en los archivos del proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Texto a buscar' },
        directory: { type: 'string', description: 'Subdirectorio donde buscar (opcional)' },
        file_pattern: { type: 'string', description: 'Extensión a filtrar, ej: ".md"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_file',
    description: 'Crea o sobreescribe un archivo en el proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Ruta relativa al PROJECT_ROOT o absoluta.' },
        content: { type: 'string', description: 'Contenido del archivo.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_command',
    description: 'Ejecuta un comando del sistema en el directorio del proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Comando a ejecutar. Ej: "git log --oneline -5"' },
        cwd: { type: 'string', description: 'Directorio de trabajo. Por defecto PROJECT_ROOT.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'find_clients',
    description: 'Busca clientes existentes por nombre.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'create_client',
    description: 'Da de alta un cliente nuevo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        sector: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delegate_to_pm',
    description: 'Delega un proyecto o trabajo al PM especializado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pm: { type: 'string', enum: ['voz', 'chatbots', 'webs-apps', 'automatizaciones', 'operaciones'] },
        task: { type: 'string' },
        client_id: { type: 'string' },
        brief: { type: 'string' },
        coordinacion: { type: 'string' },
      },
      required: ['pm', 'task'],
    },
  },
  {
    name: 'create_task',
    description: 'Crea una tarea interna rápida.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string' },
        client_id: { type: 'string' },
      },
      required: ['description'],
    },
  },
  {
    name: 'update_client_notes',
    description: 'Añade una nota al historial de un cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['client_id', 'note'],
    },
  },
  {
    name: 'record_transaction',
    description: 'Registra un ingreso o gasto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['income', 'expense'] },
        amount: { type: 'number' },
        description: { type: 'string' },
        category: { type: 'string', enum: ['cliente', 'otro', 'herramientas_saas', 'personal', 'marketing', 'infraestructura'] },
        client_id: { type: 'string' },
        date: { type: 'string' },
      },
      required: ['type', 'amount', 'description', 'category'],
    },
  },
  {
    name: 'query_finances',
    description: 'Consulta el resumen financiero del mes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        month: { type: 'number' },
        year: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'record_recurring_expense',
    description: 'Guarda un gasto fijo o recurrente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        amount: { type: 'number' },
        category: { type: 'string', enum: ['herramientas_saas', 'infraestructura', 'marketing', 'personal', 'operaciones', 'otro'] },
        billing_cycle: { type: 'string', enum: ['monthly', 'quarterly', 'yearly'] },
        vendor: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name', 'amount', 'category'],
    },
  },
  {
    name: 'record_project_revenue',
    description: 'Registra ingreso de un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string' },
        client_id: { type: 'string' },
        amount: { type: 'number' },
        concept: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'invoiced', 'paid', 'cancelled'] },
        date: { type: 'string' },
        invoice_ref: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['project_id', 'amount', 'concept'],
    },
  },
  {
    name: 'record_project_cost',
    description: 'Registra coste de un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string' },
        client_id: { type: 'string' },
        amount: { type: 'number' },
        category: { type: 'string', enum: ['herramientas_saas', 'infraestructura', 'freelance', 'ads', 'operaciones', 'otro'] },
        description: { type: 'string' },
        date: { type: 'string' },
        vendor: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['project_id', 'amount', 'category', 'description'],
    },
  },
  {
    name: 'add_company_memory',
    description: 'Guarda una nota importante en la memoria de HAT3X.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scope: { type: 'string', enum: ['company', 'client', 'project', 'finance', 'operations'] },
        entity_id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        source: { type: 'string' },
        importance: { type: 'number' },
      },
      required: ['title', 'content'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  actionRef: { value: CommandResult['action'] }
): Promise<string> {
  if (name === 'read_file') {
    const fullPath = resolvePath(String(input['path'] ?? ''));
    const content = safeRead(fullPath, 12000);
    return content || `[Archivo no encontrado: ${fullPath}]`;
  }

  if (name === 'list_directory') {
    const fullPath = resolvePath(String(input['path'] ?? ''));
    try {
      const entries = readdirSync(fullPath, { withFileTypes: true });
      return entries.map((e) => `${e.isDirectory() ? '[DIR] ' : ''}${e.name}`).join('\n');
    } catch (e) {
      return `[Error: ${String(e)}]`;
    }
  }

  if (name === 'search_files') {
    const query = String(input['query'] ?? '').toLowerCase();
    const dir = String(input['directory'] ?? '');
    const ext = String(input['file_pattern'] ?? '');
    const searchRoot = dir ? resolvePath(dir) : PROJECT_ROOT;
    const results: string[] = [];

    function walk(d: string, depth = 0) {
      if (depth > 4 || results.length >= 15) return;
      if (
        d.includes('node_modules') ||
        d.includes('.next') ||
        d.includes('.git') ||
        d.includes('dist')
      )
        return;
      try {
        const entries = readdirSync(d, { withFileTypes: true });
        for (const e of entries) {
          if (results.length >= 15) break;
          const full = join(d, e.name);
          if (e.isDirectory()) { walk(full, depth + 1); continue; }
          if (ext && !e.name.endsWith(ext)) continue;
          try {
            const content = readFileSync(full, 'utf-8');
            if (content.toLowerCase().includes(query)) {
              const lines = content.split('\n');
              const matches = lines
                .map((l, i) => ({ l, i }))
                .filter(({ l }) => l.toLowerCase().includes(query))
                .slice(0, 3)
                .map(({ l, i }) => `  L${i + 1}: ${l.trim()}`);
              results.push(`${full.replace(PROJECT_ROOT, '.')}:\n${matches.join('\n')}`);
            }
          } catch { /* skip binary */ }
        }
      } catch { /* skip */ }
    }

    walk(searchRoot);
    return results.length > 0 ? results.join('\n\n') : `[Sin resultados para "${query}"]`;
  }

  if (name === 'write_file') {
    const fullPath = resolvePath(String(input['path'] ?? ''));
    const content = String(input['content'] ?? '');
    try {
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
      return `Archivo guardado: ${fullPath}`;
    } catch (e) {
      return `[Error: ${String(e)}]`;
    }
  }

  if (name === 'run_command') {
    const command = String(input['command'] ?? '');
    const cwd = input['cwd'] ? resolvePath(String(input['cwd'])) : PROJECT_ROOT;
    try {
      const { execSync } = await import('child_process');
      const output = execSync(command, { cwd, encoding: 'utf-8', timeout: 15000 });
      return (output ?? '').slice(0, 4000) || '[Sin salida]';
    } catch (e) {
      return `[Error: ${String(e)}]`;
    }
  }

  if (name === 'find_clients') {
    return JSON.stringify(await findClients(String(input['query'] ?? '')));
  }

  if (name === 'create_client') {
    const result = await createClientRecord(
      input as { name: string; sector?: string | null; notes?: string | null }
    );
    actionRef.value = { type: 'client_updated', client: result };
    return JSON.stringify(result);
  }

  if (name === 'delegate_to_pm') {
    const pm = String(input['pm'] ?? '');
    const task = String(input['task'] ?? '');
    const brief = input['brief'] ? ` | BRIEF: ${input['brief']}` : '';
    const coord = input['coordinacion'] ? ` | COORD: ${input['coordinacion']}` : '';
    const plan = await previewPlan(
      `[@${pm.toUpperCase()}] ${task}${brief}${coord}`,
      (input['client_id'] as string | undefined) ?? null
    );
    actionRef.value = { type: 'plan_proposed', plan };
    return JSON.stringify(plan);
  }

  if (name === 'create_task') {
    const plan = await previewPlan(
      String(input['description'] ?? ''),
      (input['client_id'] as string | undefined) ?? null
    );
    actionRef.value = { type: 'plan_proposed', plan };
    return JSON.stringify(plan);
  }

  if (name === 'update_client_notes') {
    const result = await updateClientNotes(
      String(input['client_id'] ?? ''),
      String(input['note'] ?? '')
    );
    actionRef.value = { type: 'client_updated', client: result };
    return JSON.stringify(result);
  }

  if (name === 'record_transaction') {
    const result = await recordTransaction(
      input as unknown as RecordTransactionInput & { category: TransactionCategory }
    );
    actionRef.value = { type: 'transaction_recorded', transaction: result };
    return JSON.stringify(result);
  }

  if (name === 'query_finances') {
    const result = await queryFinances(
      input['month'] as number | undefined,
      input['year'] as number | undefined
    );
    actionRef.value = { type: 'financial_summary', summary: result };
    return JSON.stringify(result);
  }

  if (name === 'record_recurring_expense') {
    const result = await recordRecurringExpense(
      input as unknown as Parameters<typeof recordRecurringExpense>[0]
    );
    actionRef.value = { type: 'brain_updated', result };
    return JSON.stringify(result);
  }

  if (name === 'record_project_revenue') {
    const result = await recordProjectRevenue(
      input as unknown as Parameters<typeof recordProjectRevenue>[0]
    );
    actionRef.value = { type: 'brain_updated', result };
    return JSON.stringify(result);
  }

  if (name === 'record_project_cost') {
    const result = await recordProjectCost(
      input as unknown as Parameters<typeof recordProjectCost>[0]
    );
    actionRef.value = { type: 'brain_updated', result };
    return JSON.stringify(result);
  }

  if (name === 'add_company_memory') {
    const result = await addCompanyMemory(
      input as unknown as Parameters<typeof addCompanyMemory>[0]
    );
    actionRef.value = { type: 'brain_updated', result };
    return JSON.stringify(result);
  }

  return '{}';
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleCommand(text: string): Promise<CommandResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const [tasks, clients, checkpoints, companyBrain] = await Promise.all([
    readTasks().catch(() => []),
    readClients().catch(() => []),
    readPendingCheckpoints().catch(() => []),
    readCompanyBrainContext().catch(() => null),
  ]);

  const projectMemory = loadProjectMemory();

  const systemPrompt = `${buildSystemPrompt(projectMemory)}

━━━ CONTEXTO EN TIEMPO REAL ━━━
Tareas activas: ${JSON.stringify(tasks.slice(0, 5))}
Clientes: ${JSON.stringify(clients.slice(0, 15))}
Checkpoints pendientes: ${JSON.stringify(checkpoints.slice(0, 3))}
Cerebro empresa: ${JSON.stringify(companyBrain)}`;

  const client = new Anthropic({ apiKey });
  const actionRef: { value: CommandResult['action'] } = { value: undefined };
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: text }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === 'text') as
      | Anthropic.TextBlock
      | undefined;
    const toolUses = response.content.filter(
      (b) => b.type === 'tool_use'
    ) as Anthropic.ToolUseBlock[];

    if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
      return { response: textBlock?.text ?? 'Hecho.', action: actionRef.value };
    }

    const toolResults = await Promise.all(
      toolUses.map(async (tu) => ({
        type: 'tool_result' as const,
        tool_use_id: tu.id,
        content: await executeTool(tu.name, tu.input as Record<string, unknown>, actionRef),
      }))
    );

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return { response: 'Hecho.', action: actionRef.value };
}
