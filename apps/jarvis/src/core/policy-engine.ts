export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ToolPolicyDecision =
  | 'execute'
  | 'prepare'
  | 'require_approval'
  | 'delegate_to_command';

export type ToolPolicyInput = Record<string, unknown>;

export interface ToolPolicyResult {
  toolName: string;
  risk: ToolRiskLevel;
  decision: ToolPolicyDecision;
  reason: string;
}

const LOW_RISK_TOOLS = new Set([
  'supabase_query',
  'read_file',
  'list_directory',
  'search_files',
  'query_finances',
  'find_clients',
  'get_task_status',
  'get_checkpoints',
  'get_health',
]);

const MEDIUM_RISK_TOOLS = new Set([
  'create_client',
  'update_client_notes',
  'add_company_memory',
  'record_transaction',
  'record_recurring_expense',
  'record_project_revenue',
  'record_project_cost',
  'save_leads_file',
]);

const HIGH_RISK_TOOLS = new Set([
  'send_outreach_email',
  'supabase_insert',
  'supabase_update',
  'trigger_n8n',
  'create_external_agent',
  'modify_configuration',
]);

const CRITICAL_RISK_TOOLS = new Set([
  'supabase_delete',
  'send_bulk_outreach',
  'deploy_production',
  'git_push',
  'delete_file',
  'bulk_delete',
  'money_transfer',
]);

const SAFE_WRITE_PREFIXES = [
  'clients/',
  'docs/',
  'memoria/',
  'reports/',
  'tmp/',
  'apps/jarvis/public/generated/',
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function includesEnvPath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === '.env' || normalized.includes('/.env') || normalized.includes('.env.');
}

function isSafeWritePath(path: string): boolean {
  const normalized = normalizePath(path);
  return SAFE_WRITE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function classifyHttpRisk(input: ToolPolicyInput): ToolRiskLevel {
  const method = asString(input.method || input.Method).toUpperCase() || 'GET';

  if (method === 'DELETE') return 'critical';
  if (['POST', 'PATCH', 'PUT'].includes(method)) return 'high';

  return 'low';
}

function classifyRunCommandRisk(input: ToolPolicyInput): ToolRiskLevel {
  const command = asString(input.command).toLowerCase();
  const criticalPatterns = [
    'git push',
    'rm -rf',
    'del ',
    'rmdir ',
    'remove-item',
    'npm publish',
    'pnpm publish',
    'yarn publish',
    'vercel --prod',
    'vercel deploy --prod',
    'deploy production',
    'supabase db reset',
    'drop database',
  ];

  if (criticalPatterns.some((pattern) => command.includes(pattern))) {
    return 'critical';
  }

  return 'high';
}

function classifyWriteRisk(input: ToolPolicyInput): ToolRiskLevel {
  const path = asString(input.path || input.filePath || input.filename);

  if (!path) return 'high';
  if (includesEnvPath(path)) return 'critical';
  if (isSafeWritePath(path)) return 'medium';

  return 'high';
}

export function classifyToolRisk(toolName: string, input: ToolPolicyInput = {}): ToolRiskLevel {
  if (toolName === 'http_request') return classifyHttpRisk(input);
  if (toolName === 'run_command') return classifyRunCommandRisk(input);
  if (toolName === 'write_file') return classifyWriteRisk(input);

  if (CRITICAL_RISK_TOOLS.has(toolName)) return 'critical';
  if (HIGH_RISK_TOOLS.has(toolName)) return 'high';
  if (MEDIUM_RISK_TOOLS.has(toolName)) return 'medium';
  if (LOW_RISK_TOOLS.has(toolName)) return 'low';

  return 'high';
}

export function evaluateToolPolicy(
  toolName: string,
  input: ToolPolicyInput = {},
): ToolPolicyResult {
  const risk = classifyToolRisk(toolName, input);

  const decisionByRisk: Record<ToolRiskLevel, ToolPolicyDecision> = {
    low: 'execute',
    medium: 'prepare',
    high: 'require_approval',
    critical: 'delegate_to_command',
  };

  const reasonByRisk: Record<ToolRiskLevel, string> = {
    low: 'Aiden puede ejecutar consultas y lectura de bajo riesgo.',
    medium: 'Aiden puede preparar la accion, validar datos y pedir confirmacion si procede.',
    high: 'Aiden necesita aprobacion explicita antes de ejecutar acciones con impacto externo.',
    critical: 'Aiden no ejecuta acciones criticas directamente; debe delegar a Command o crear checkpoint.',
  };

  return {
    toolName,
    risk,
    decision: decisionByRisk[risk],
    reason: reasonByRisk[risk],
  };
}

export function isLowRiskTool(toolName: string, input?: ToolPolicyInput): boolean {
  return classifyToolRisk(toolName, input) === 'low';
}

export function isMediumRiskTool(toolName: string, input?: ToolPolicyInput): boolean {
  return classifyToolRisk(toolName, input) === 'medium';
}

export function isHighRiskTool(toolName: string, input?: ToolPolicyInput): boolean {
  return classifyToolRisk(toolName, input) === 'high';
}

export function isCriticalTool(toolName: string, input?: ToolPolicyInput): boolean {
  return classifyToolRisk(toolName, input) === 'critical';
}
