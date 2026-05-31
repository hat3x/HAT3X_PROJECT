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

// ─── Cached project memory (reads once per process, not per request) ──────────

let _cachedMemory: string | null = null;

function getProjectMemory(): string {
  if (_cachedMemory !== null) return _cachedMemory;

  const parts: string[] = [];

  // CLAUDE.md
  const claudeMd = safeRead(join(PROJECT_ROOT, 'CLAUDE.md'), 3000);
  if (claudeMd) parts.push(`=== CLAUDE.md ===\n${claudeMd}`);

  // Memory files
  if (existsSync(MEMORY_DIR)) {
    const files = readdirSync(MEMORY_DIR).filter(
      (f) => f.endsWith('.md') && f !== 'MEMORY.md'
    );
    for (const f of files) {
      const content = safeRead(join(MEMORY_DIR, f), 1500);
      if (content) parts.push(`=== Memoria: ${f} ===\n${content}`);
    }
  }

  // Client directory listing (names only — Claude uses read_file for detail)
  const clientsDir = join(PROJECT_ROOT, 'clients', 'projects');
  if (existsSync(clientsDir)) {
    try {
      const names = readdirSync(clientsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .join(', ');
      parts.push(`=== Clientes con carpeta en clients/projects/ ===\n${names}`);
    } catch { /* skip */ }
  }

  _cachedMemory = parts.join('\n\n---\n\n');
  return _cachedMemory;
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
  return `Eres Aiden, el asistente ejecutivo de HAT3X con acceso completo al sistema de ficheros.
Eres tan capaz como Claude Code pero con interfaz de voz.
El usuario es Jose Miguel, le llamas siempre Jota.

REGLAS DE RESPUESTA (la respuesta se lee en voz alta):
- Responde SIEMPRE en español, de forma natural y conversacional
- NUNCA uses markdown, asteriscos, guiones, listas ni símbolos
- NUNCA respondas solo "Hecho" o "Listo" sin dar información real
- Para CONSULTAS ("dime", "muéstrame", "qué", "cómo está", "estado"): usa las herramientas para obtener datos reales y luego responde con un resumen claro
- Para ÓRDENES ("crea", "delega", "registra", "anota"): ejecuta y confirma brevemente
- Si no tienes los datos en el contexto, USA read_file o list_directory antes de responder

PROJECT_ROOT = ${PROJECT_ROOT}

ACCESO TOTAL A SUPABASE (úsalo para cualquier dato de la empresa):
- supabase_query(table, select?, filters?, order_by?, limit?): leer cualquier tabla
- supabase_insert(table, data): insertar en cualquier tabla
- supabase_update(table, data, filters): actualizar en cualquier tabla
- supabase_delete(table, filters): eliminar de cualquier tabla
Tablas principales: hat3x_tasks, hat3x_clients, hat3x_checkpoints, hat3x_transactions, bus_events, hat3x_meetings

ACCESO TOTAL A APIS EXTERNAS (via http_request):
- http_request(url, method, headers?, body?): llama a CUALQUIER API
- Retell AI: https://api.retellai.com — usa header Authorization: Bearer RETELL_API_KEY
- ElevenLabs: https://api.elevenlabs.io/v1 — usa header xi-api-key: ELEVENLABS_API_KEY
- n8n: ${process.env['N8N_BASE_URL'] ?? 'https://hat3xia.app.n8n.cloud'} — usa header X-N8N-API-KEY: N8N_API_KEY
- Twilio WhatsApp: https://api.twilio.com — usa header Authorization: Basic TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN
Las claves se inyectan automáticamente al usar los placeholders de arriba en los headers.

ACCESO TOTAL AL SISTEMA DE FICHEROS:
- read_file(path): lee cualquier archivo del proyecto
- list_directory(path): lista una carpeta
- search_files(query, directory?, file_pattern?): busca texto en archivos
- write_file(path, content): crea o modifica archivos
- run_command(command, cwd?): ejecuta git, npm, scripts, etc.

HERRAMIENTAS DE CONVENIENCIA (atajos para operaciones comunes):
- find_clients / create_client: buscar o crear clientes
- delegate_to_pm: delegar trabajo a un PM
- create_task: crear tarea interna
- update_client_notes: anotar info sobre cliente
- record_transaction / query_finances: finanzas rápidas
- add_company_memory: guardar decisión importante

REGLAS:
- Para consultas de datos: usa supabase_query antes de responder
- Para crear documentos o propuestas: usa write_file
- Para disparar automatizaciones: usa http_request a n8n
- Para crear agentes de voz: usa http_request a Retell AI
- Puedes combinar herramientas: leer de Supabase, escribir un archivo, llamar a una API — todo en una sola conversación

${HAT3X_KNOWLEDGE}

━━━ MEMORIA Y ESTRUCTURA DEL PROYECTO ━━━
${projectMemory}`;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  // ── Supabase admin (acceso total a la BD) ────────────────────────────────
  {
    name: 'supabase_query',
    description: 'Lee datos de CUALQUIER tabla de Supabase. Úsalo para consultar clientes, tareas, transacciones, checkpoints, eventos, o cualquier otra tabla.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla, ej: "hat3x_clients", "hat3x_tasks", "hat3x_transactions"' },
        select: { type: 'string', description: 'Campos a devolver. Por defecto "*"' },
        filters: { type: 'object', description: 'Filtros de igualdad: {"campo": "valor"}' },
        order_by: { type: 'string', description: 'Campo por el que ordenar' },
        order_asc: { type: 'boolean', description: 'true = ascendente, false = descendente' },
        limit: { type: 'number', description: 'Máximo de filas a devolver' },
      },
      required: ['table'],
    },
  },
  {
    name: 'supabase_insert',
    description: 'Inserta uno o varios registros en CUALQUIER tabla de Supabase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        data: { description: 'Objeto o array de objetos a insertar' },
      },
      required: ['table', 'data'],
    },
  },
  {
    name: 'supabase_update',
    description: 'Actualiza registros en CUALQUIER tabla de Supabase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        data: { type: 'object', description: 'Campos a actualizar' },
        filters: { type: 'object', description: 'Filtros para identificar qué filas actualizar: {"campo": "valor"}' },
      },
      required: ['table', 'data', 'filters'],
    },
  },
  {
    name: 'supabase_delete',
    description: 'Elimina registros de CUALQUIER tabla de Supabase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
        filters: { type: 'object', description: 'Filtros para identificar qué filas eliminar: {"campo": "valor"}' },
      },
      required: ['table', 'filters'],
    },
  },
  // ── HTTP genérico (Retell, Twilio, n8n, ElevenLabs, cualquier API) ────────
  {
    name: 'http_request',
    description: 'Hace una petición HTTP a cualquier API externa: Retell AI, Twilio, n8n, ElevenLabs, o cualquier otra URL. Úsalo para crear agentes de voz, enviar WhatsApp, disparar flujos de n8n, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL completa del endpoint' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'Método HTTP' },
        headers: { type: 'object', description: 'Headers adicionales. Las claves de API de Retell, Twilio y n8n están disponibles como: RETELL_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, N8N_API_KEY, ELEVENLABS_API_KEY' },
        body: { description: 'Cuerpo de la petición (se serializa a JSON automáticamente)' },
      },
      required: ['url', 'method'],
    },
  },
  // ── File system ───────────────────────────────────────────────────────────
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
  // ── Prospección de clientes ──────────────────────────────────────────────
  {
    name: 'search_local_businesses',
    description: 'Busca negocios locales como clientes potenciales (clínicas, peluquerías, restaurantes, etc.) usando Google Places via Serper. Devuelve nombre, dirección, teléfono, web, categoría y valoración.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:    { type: 'string', description: 'Tipo de negocio. Ej: "clínicas dentales", "peluquerías", "restaurantes"' },
        location: { type: 'string', description: 'Ciudad o zona. Ej: "Madrid", "Barcelona", "Sevilla"' },
        limit:    { type: 'number', description: 'Máximo de resultados (default 10, max 20)' },
      },
      required: ['query', 'location'],
    },
  },
  {
    name: 'save_leads_file',
    description: 'Guarda una lista de leads en un archivo JSON en clients/leads/. Úsalo después de search_local_businesses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        leads:    { description: 'Array de leads con: nombre, email?, telefono?, web?, direccion?, sector?, notas?' },
        filename: { type: 'string', description: 'Nombre del archivo sin extensión. Default: YYYY-MM-DD-query-location' },
      },
      required: ['leads'],
    },
  },
  {
    name: 'send_outreach_email',
    description: 'Envía un email de prospección individual desde info@hat3x.com a un lead usando Resend. Personaliza el mensaje con el nombre y sector del cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to_email:  { type: 'string', description: 'Email del destinatario' },
        to_name:   { type: 'string', description: 'Nombre del contacto o empresa' },
        subject:   { type: 'string', description: 'Asunto del email' },
        body_html: { type: 'string', description: 'Cuerpo HTML. Usa <p>, <br>, <b>, <a>' },
        body_text: { type: 'string', description: 'Texto plano (opcional)' },
      },
      required: ['to_email', 'subject', 'body_html'],
    },
  },
  {
    name: 'send_bulk_outreach',
    description: 'Envía emails de prospección a todos los leads de un archivo JSON. Respeta delay entre envíos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        leads_file:      { type: 'string', description: 'Ruta al archivo JSON de leads' },
        subject:         { type: 'string', description: 'Asunto. Puede usar {nombre} y {empresa}' },
        body_html:       { type: 'string', description: 'HTML del email. Puede usar {nombre}, {empresa}, {sector}' },
        delay_seconds:   { type: 'number', description: 'Segundos entre emails (default 3)' },
        only_with_email: { type: 'boolean', description: 'Solo enviar a leads con email conocido (default true)' },
      },
      required: ['leads_file', 'subject', 'body_html'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  actionRef: { value: CommandResult['action'] }
): Promise<string> {
  // ── Supabase admin ────────────────────────────────────────────────────────
  if (name === 'supabase_query') {
    const { table, select = '*', filters, order_by, order_asc = false, limit } = input as {
      table: string; select?: string; filters?: Record<string, unknown>;
      order_by?: string; order_asc?: boolean; limit?: number;
    };
    const { getSupabaseClient } = await import('@/lib/supabase');
    let q = getSupabaseClient().from(table).select(select);
    if (filters) {
      for (const [col, val] of Object.entries(filters)) {
        q = q.eq(col, val as string);
      }
    }
    if (order_by) q = q.order(order_by, { ascending: order_asc });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) return `[Supabase error: ${error.message}]`;
    return JSON.stringify(data ?? []);
  }

  if (name === 'supabase_insert') {
    const { table, data } = input as { table: string; data: unknown };
    const { getSupabaseClient } = await import('@/lib/supabase');
    const { data: result, error } = await getSupabaseClient().from(table).insert(data as never).select();
    if (error) return `[Supabase error: ${error.message}]`;
    return JSON.stringify(result ?? []);
  }

  if (name === 'supabase_update') {
    const { table, data, filters } = input as {
      table: string; data: Record<string, unknown>; filters: Record<string, unknown>;
    };
    const { getSupabaseClient } = await import('@/lib/supabase');
    let q = getSupabaseClient().from(table).update(data as never);
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val as string);
    }
    const { data: result, error } = await q.select();
    if (error) return `[Supabase error: ${error.message}]`;
    return JSON.stringify(result ?? []);
  }

  if (name === 'supabase_delete') {
    const { table, filters } = input as { table: string; filters: Record<string, unknown> };
    const { getSupabaseClient } = await import('@/lib/supabase');
    let q = getSupabaseClient().from(table).delete();
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val as string);
    }
    const { data: result, error } = await q.select();
    if (error) return `[Supabase error: ${error.message}]`;
    return JSON.stringify(result ?? []);
  }

  // ── HTTP genérico ─────────────────────────────────────────────────────────
  if (name === 'http_request') {
    const { url, method, headers: extraHeaders = {}, body } = input as {
      url: string; method: string; headers?: Record<string, string>; body?: unknown;
    };

    // Inject API keys by placeholder name so Claude doesn't need to know the actual values
    const resolvedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(extraHeaders)) {
      const resolved = String(v)
        .replace('RETELL_API_KEY', process.env['RETELL_API_KEY'] ?? '')
        .replace('ELEVENLABS_API_KEY', process.env['ELEVENLABS_API_KEY'] ?? '')
        .replace('N8N_API_KEY', process.env['N8N_API_KEY'] ?? '')
        .replace('TWILIO_ACCOUNT_SID', process.env['TWILIO_ACCOUNT_SID'] ?? '')
        .replace('TWILIO_AUTH_TOKEN', process.env['TWILIO_AUTH_TOKEN'] ?? '');
      resolvedHeaders[k] = resolved;
    }

    const fetchInit: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...resolvedHeaders },
    };
    if (body !== undefined && method !== 'GET') {
      fetchInit.body = JSON.stringify(body);
    }

    const res = await fetch(url, fetchInit);
    const text = await res.text();
    const preview = text.length > 3000 ? text.slice(0, 3000) + '...[truncado]' : text;
    return `HTTP ${res.status}\n${preview}`;
  }

  // ── File system ───────────────────────────────────────────────────────────
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

  // ── Prospección de clientes ──────────────────────────────────────────────

  if (name === 'search_local_businesses') {
    const { query, location, limit = 10 } = input as { query: string; location: string; limit?: number };
    const serperKey = process.env['SERPER_API_KEY'];
    if (!serperKey) return '[Error: SERPER_API_KEY no configurada. Ve a serper.dev, crea una cuenta gratuita y añade SERPER_API_KEY al .env.local]';

    const res = await fetch('https://google.serper.dev/places', {
      method: 'POST',
      headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `${query} en ${location}`, location: `${location}, Spain`, gl: 'es', hl: 'es', num: Math.min(limit, 20) }),
    });
    const data = await res.json() as { places?: unknown[] };
    const places = data.places ?? [];
    return JSON.stringify({ total: (places as unknown[]).length, results: places });
  }

  if (name === 'save_leads_file') {
    const { leads, filename } = input as { leads: unknown[]; filename?: string };
    const date = new Date().toISOString().slice(0, 10);
    const safeName = (filename ?? `${date}-leads`).replace(/[^a-z0-9_-]/gi, '-');
    const leadsDir = join(PROJECT_ROOT, 'clients', 'leads');
    mkdirSync(leadsDir, { recursive: true });
    const filepath = join(leadsDir, `${safeName}.json`);
    writeFileSync(filepath, JSON.stringify(leads, null, 2), 'utf-8');
    return `Leads guardados: ${filepath}\nTotal: ${(leads as unknown[]).length} contactos`;
  }

  if (name === 'send_outreach_email') {
    const { to_email, to_name, subject, body_html, body_text } = input as {
      to_email: string; to_name?: string; subject: string; body_html: string; body_text?: string;
    };
    const resendKey = process.env['RESEND_API_KEY'];
    if (!resendKey) return '[Error: RESEND_API_KEY no configurada. Ve a resend.com, crea cuenta gratuita y añade RESEND_API_KEY al .env.local]';

    const toField = to_name ? `${to_name} <${to_email}>` : to_email;
    const plainText = body_text ?? body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'HAT3X <info@hat3x.com>',
        to: [toField],
        subject,
        html: body_html,
        text: plainText,
      }),
    });
    const result = await res.json() as { id?: string; statusCode?: number; message?: string };
    if (!res.ok) return `[Error Resend ${res.status}: ${result.message ?? JSON.stringify(result)}]`;
    return `Email enviado a ${toField} ✓ (ID: ${result.id ?? 'ok'})`;
  }

  if (name === 'send_bulk_outreach') {
    const { leads_file, subject, body_html, delay_seconds = 3, only_with_email = true } = input as {
      leads_file: string; subject: string; body_html: string; delay_seconds?: number; only_with_email?: boolean;
    };
    const resendKey = process.env['RESEND_API_KEY'];
    if (!resendKey) return '[Error: RESEND_API_KEY no configurada]';

    const fullPath = resolvePath(leads_file);
    const raw = safeRead(fullPath, 200000);
    if (!raw) return `[Error: No se encontró el archivo ${fullPath}]`;

    let leads: Array<Record<string, string>>;
    try { leads = JSON.parse(raw) as Array<Record<string, string>>; } catch { return '[Error: Archivo de leads no es JSON válido]'; }

    const targets = only_with_email ? leads.filter(l => l['email'] || l['Email']) : leads;
    if (targets.length === 0) return '[Sin leads con email. Añade emails al archivo primero.]';

    const delayMs = Math.max(delay_seconds, 2) * 1000;
    const sent: string[] = [];
    const failed: string[] = [];

    for (const lead of targets) {
      const email  = (lead['email'] ?? lead['Email'] ?? '').trim();
      const nombre = lead['nombre'] ?? lead['name'] ?? lead['empresa'] ?? lead['company'] ?? 'equipo';
      const empresa = lead['empresa'] ?? lead['company'] ?? lead['nombre'] ?? lead['name'] ?? '';
      const sector = lead['sector'] ?? lead['category'] ?? '';

      if (!email) { failed.push(`${nombre} (sin email)`); continue; }

      const personalSubject = subject.replace(/\{nombre\}/g, nombre).replace(/\{empresa\}/g, empresa);
      const personalBody    = body_html
        .replace(/\{nombre\}/g, nombre)
        .replace(/\{empresa\}/g, empresa)
        .replace(/\{sector\}/g, sector);

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'HAT3X <info@hat3x.com>',
            to: [`${empresa || nombre} <${email}>`],
            subject: personalSubject,
            html: personalBody,
            text: personalBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          }),
        });
        if (res.ok) { sent.push(email); } else { failed.push(`${email} (error ${res.status})`); }
      } catch (e) { failed.push(`${email} (${String(e)})`); }

      if (targets.indexOf(lead) < targets.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return `Campaña finalizada.\n✓ Enviados: ${sent.length}\n✗ Fallidos: ${failed.length}${failed.length > 0 ? '\nFallidos: ' + failed.join(', ') : ''}`;
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

  const projectMemory = getProjectMemory();

  const systemPrompt = `${buildSystemPrompt(projectMemory)}

━━━ CONTEXTO EN TIEMPO REAL ━━━
Tareas activas: ${JSON.stringify(tasks.slice(0, 5))}
Clientes: ${JSON.stringify(clients.slice(0, 15))}
Checkpoints pendientes: ${JSON.stringify(checkpoints.slice(0, 3))}
Cerebro empresa: ${JSON.stringify(companyBrain)}`;

  const anthropic = new Anthropic({ apiKey });
  const actionRef: { value: CommandResult['action'] } = { value: undefined };
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: text }];
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
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

    if (textBlock?.text) lastText = textBlock.text;

    // No more tools to run — return final text
    if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
      return { response: lastText || 'Sin respuesta.', action: actionRef.value };
    }

    // Execute tools in parallel
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

  return { response: lastText || 'Sin respuesta.', action: actionRef.value };
}
