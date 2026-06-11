export type AidenCommandMode =
  | 'voice_mode'
  | 'work_mode'
  | 'project_mode'
  | 'audit_mode'
  | 'controlled_autonomous_mode';

export type AidenIntent =
  | 'finance_query'
  | 'crm_query'
  | 'task_status_query'
  | 'project_request'
  | 'audit_request'
  | 'automation_request'
  | 'outreach_request'
  | 'general_query';

export interface ResponseModeInput {
  requestedMode?: AidenCommandMode;
  intent?: AidenIntent;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AidenRequestClassification {
  intent: AidenIntent;
  mode: AidenCommandMode;
  shouldDelegateToCommand: boolean;
  reason: string;
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function resolveResponseMode(input: ResponseModeInput = {}): AidenCommandMode {
  if (input.requestedMode) return input.requestedMode;

  if (input.intent === 'project_request') return 'project_mode';
  if (input.intent === 'audit_request') return 'audit_mode';
  if (input.riskLevel === 'high' || input.riskLevel === 'critical') {
    return 'controlled_autonomous_mode';
  }

  if (input.intent === 'finance_query' || input.intent === 'crm_query' || input.intent === 'task_status_query') {
    return 'voice_mode';
  }

  return 'work_mode';
}

export function classifyAidenRequest(orderRaw: string): AidenRequestClassification {
  const text = normalize(orderRaw);

  if (hasAny(text, ['audita', 'auditoria', 'security audit', 'seguridad', 'vulnerabilidad'])) {
    return {
      intent: 'audit_request',
      mode: resolveResponseMode({ intent: 'audit_request' }),
      shouldDelegateToCommand: true,
      reason: 'Las auditorias requieren planificacion, trazabilidad y ejecucion controlada en Command.',
    };
  }

  if (hasAny(text, ['crea una app', 'crear una app', 'app completa', 'desarrolla', 'construye', 'proyecto completo', 'landing', 'saas'])) {
    return {
      intent: 'project_request',
      mode: resolveResponseMode({ intent: 'project_request' }),
      shouldDelegateToCommand: true,
      reason: 'Los proyectos complejos deben entrar en Command para plan, agentes, checkpoints y ejecucion.',
    };
  }

  if (hasAny(text, ['automatiza', 'n8n', 'make', 'zapier', 'workflow'])) {
    return {
      intent: 'automation_request',
      mode: 'project_mode',
      shouldDelegateToCommand: true,
      reason: 'Las automatizaciones pueden tocar sistemas externos y deben ser coordinadas por Command.',
    };
  }

  if (hasAny(text, ['campana', 'leads', 'outreach', 'prospecta', 'scraping', 'email masivo'])) {
    return {
      intent: 'outreach_request',
      mode: 'controlled_autonomous_mode',
      shouldDelegateToCommand: true,
      reason: 'La prospeccion y contacto externo requieren aprobaciones y control de riesgo.',
    };
  }

  if (hasAny(text, ['finanzas', 'ingresos', 'gastos', 'rentabilidad', 'facturacion', 'cashflow'])) {
    return {
      intent: 'finance_query',
      mode: resolveResponseMode({ intent: 'finance_query' }),
      shouldDelegateToCommand: false,
      reason: 'Es una consulta local de negocio de bajo riesgo.',
    };
  }

  if (hasAny(text, ['cliente', 'clientes', 'crm'])) {
    return {
      intent: 'crm_query',
      mode: resolveResponseMode({ intent: 'crm_query' }),
      shouldDelegateToCommand: false,
      reason: 'Es una consulta CRM simple que Aiden puede resolver directamente.',
    };
  }

  if (hasAny(text, ['tarea', 'checkpoint', 'estado', 'como va'])) {
    return {
      intent: 'task_status_query',
      mode: resolveResponseMode({ intent: 'task_status_query' }),
      shouldDelegateToCommand: false,
      reason: 'Es una consulta de estado de bajo riesgo.',
    };
  }

  return {
    intent: 'general_query',
    mode: 'work_mode',
    shouldDelegateToCommand: false,
    reason: 'No se ha detectado una tarea compleja ni una accion de alto riesgo.',
  };
}
