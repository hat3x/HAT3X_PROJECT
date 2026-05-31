export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export type TransactionCategory =
  | 'cliente'
  | 'otro'
  | 'herramientas_saas'
  | 'personal'
  | 'marketing'
  | 'infraestructura';

export interface CommandEntry {
  id: string;
  userText: string;
  jarvisResponse: string;
  timestamp: Date;
}

export interface DbTask {
  id: string;
  client_id: string | null;
  order_raw: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  created_at: string;
}

export interface DbClient {
  id: string;
  name: string;
  sector: string | null;
  notes: string | null;
  previous_projects: string[];
}

export interface DbCheckpoint {
  id: string;
  task_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  triggered_at: string;
}

export interface DbTransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: TransactionCategory;
  client_id: string | null;
  date: string;
  created_at: string;
}

export interface RecordTransactionInput {
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: TransactionCategory;
  client_id?: string | null;
  date?: string;
}

export interface FinancialSummary {
  month: number;
  year: number;
  totalIncome: number;
  totalExpense: number;
  margin: number;
  byCategory: {
    category: string;
    type: 'income' | 'expense';
    total: number;
    count: number;
  }[];
  recentTransactions: DbTransaction[];
}

export interface BrainWriteResult {
  table: string;
  id: string;
  summary: string;
}

export interface PlanSubtask {
  id: string;
  description: string;
  vertical: string;
  skills: string[];
  estimatedHours: number;
  dependencies: string[];
}

export interface PlanAgentSelection {
  subtaskId: string;
  agentId: string;
  score: number;
  rationale: string;
}

export interface PlanCheckpoint {
  afterPhase: number;
  reason: string;
  requiredApproval: 'jose' | 'client' | 'both';
}

export interface PlanPhase {
  phaseNumber: number;
  subtasks: {
    subtaskId: string;
    agentId: string;
  }[];
}

export interface ExecutivePlan {
  orderRaw: string;
  clientId: string | null;
  subtasks: PlanSubtask[];
  selections: PlanAgentSelection[];
  executionPlan: {
    phases: PlanPhase[];
    checkpoints: PlanCheckpoint[];
    totalEstimatedHours: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

export interface TransactionAction {
  type: 'transaction_recorded';
  transaction: DbTransaction;
}

export interface SummaryAction {
  type: 'financial_summary';
  summary: FinancialSummary;
}

export interface CreateTaskAction {
  type: 'task_created';
  task: DbTask;
}

export interface UpdateClientAction {
  type: 'client_updated';
  client: DbClient;
}

export interface PlanProposedAction {
  type: 'plan_proposed';
  plan: ExecutivePlan;
}

export interface BrainUpdatedAction {
  type: 'brain_updated';
  result: BrainWriteResult;
}

export type CommandAction =
  | TransactionAction
  | SummaryAction
  | CreateTaskAction
  | UpdateClientAction
  | PlanProposedAction
  | BrainUpdatedAction;

export interface CommandResult {
  response: string;
  action?: CommandAction;
}
