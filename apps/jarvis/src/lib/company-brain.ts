import { getSupabaseClient } from '@/lib/supabase';
import type { BrainWriteResult } from '@/types/jarvis';

export interface BrainRecurringExpense {
  name: string;
  amount: number;
  category: string;
  billing_cycle: string;
}

export interface BrainProjectRevenue {
  project_id: string;
  client_id: string | null;
  amount: number;
  status: string;
  concept: string;
}

export interface BrainProjectCost {
  project_id: string;
  amount: number;
  category: string;
  description: string;
}

export interface BrainMemoryNote {
  title: string;
  content: string;
  importance: number;
}

export interface CompanyBrainContext {
  monthlyRecurringExpenses: number;
  projectRevenueOpen: number;
  projectCostsOpen: number;
  recurringExpenses: BrainRecurringExpense[];
  projectRevenue: BrainProjectRevenue[];
  projectCosts: BrainProjectCost[];
  memoryNotes: BrainMemoryNote[];
}

export interface RecordRecurringExpenseInput {
  name: string;
  amount: number;
  category: 'herramientas_saas' | 'infraestructura' | 'marketing' | 'personal' | 'operaciones' | 'otro';
  billing_cycle?: 'monthly' | 'quarterly' | 'yearly';
  vendor?: string | null;
  notes?: string | null;
}

export interface RecordProjectRevenueInput {
  project_id: string;
  client_id?: string | null;
  amount: number;
  concept: string;
  status?: 'pending' | 'invoiced' | 'paid' | 'cancelled';
  date?: string;
  invoice_ref?: string | null;
  notes?: string | null;
}

export interface RecordProjectCostInput {
  project_id: string;
  client_id?: string | null;
  amount: number;
  category: 'herramientas_saas' | 'infraestructura' | 'freelance' | 'ads' | 'operaciones' | 'otro';
  description: string;
  date?: string;
  vendor?: string | null;
  notes?: string | null;
}

export interface AddCompanyMemoryInput {
  scope?: 'company' | 'client' | 'project' | 'finance' | 'operations';
  entity_id?: string | null;
  title: string;
  content: string;
  source?: string;
  importance?: number;
}

async function safeQuery<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    console.error('[company-brain]', error.message);
    return [];
  }
  return data ?? [];
}

async function resolveExistingClientId(
  supabase: ReturnType<typeof getSupabaseClient>,
  clientId: string | null | undefined
): Promise<string | null> {
  const normalized = typeof clientId === 'string' && clientId.trim().length > 0 ? clientId.trim() : null;
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('hat3x_clients')
    .select('id')
    .eq('id', normalized)
    .maybeSingle();

  if (error) {
    console.error('[company-brain]', error.message);
    return null;
  }

  return data != null ? normalized : null;
}

export async function readCompanyBrainContext(): Promise<CompanyBrainContext> {
  const supabase = getSupabaseClient();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [recurringExpenses, projectRevenue, projectCosts, memoryNotes] = await Promise.all([
    safeQuery<BrainRecurringExpense>(
      supabase
        .from('hat3x_recurring_expenses')
        .select('name, amount, category, billing_cycle')
        .eq('active', true)
        .order('amount', { ascending: false })
        .limit(20)
    ),
    safeQuery<BrainProjectRevenue>(
      supabase
        .from('hat3x_project_revenue')
        .select('project_id, client_id, amount, status, concept')
        .gte('date', monthStart)
        .order('date', { ascending: false })
        .limit(30)
    ),
    safeQuery<BrainProjectCost>(
      supabase
        .from('hat3x_project_costs')
        .select('project_id, amount, category, description')
        .gte('date', monthStart)
        .order('date', { ascending: false })
        .limit(30)
    ),
    safeQuery<BrainMemoryNote>(
      supabase
        .from('hat3x_company_memory')
        .select('title, content, importance')
        .eq('active', true)
        .order('importance', { ascending: false })
        .limit(10)
    ),
  ]);

  return {
    monthlyRecurringExpenses: recurringExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
    projectRevenueOpen: projectRevenue.reduce((sum, revenue) => sum + Number(revenue.amount), 0),
    projectCostsOpen: projectCosts.reduce((sum, cost) => sum + Number(cost.amount), 0),
    recurringExpenses,
    projectRevenue,
    projectCosts,
    memoryNotes,
  };
}

export async function recordRecurringExpense(input: RecordRecurringExpenseInput): Promise<BrainWriteResult> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_recurring_expenses')
    .insert({
      name: input.name,
      amount: input.amount,
      category: input.category,
      billing_cycle: input.billing_cycle ?? 'monthly',
      vendor: input.vendor ?? null,
      notes: input.notes ?? null,
      active: true,
    })
    .select('id, name, amount')
    .single();

  if (error) throw new Error(error.message);
  const row = data as { id: string; name: string; amount: number };
  return { table: 'hat3x_recurring_expenses', id: row.id, summary: `${row.name}: ${row.amount} EUR` };
}

export async function recordProjectRevenue(input: RecordProjectRevenueInput): Promise<BrainWriteResult> {
  const supabase = getSupabaseClient();
  const clientId = await resolveExistingClientId(supabase, input.client_id);

  const { data, error } = await supabase
    .from('hat3x_project_revenue')
    .insert({
      project_id: input.project_id,
      client_id: clientId,
      amount: input.amount,
      concept: input.concept,
      status: input.status ?? 'pending',
      date: input.date ?? new Date().toISOString().slice(0, 10),
      invoice_ref: input.invoice_ref ?? null,
      notes: input.notes ?? null,
    })
    .select('id, project_id, amount')
    .single();

  if (error) throw new Error(error.message);
  const row = data as { id: string; project_id: string; amount: number };
  return { table: 'hat3x_project_revenue', id: row.id, summary: `${row.project_id}: +${row.amount} EUR` };
}

export async function recordProjectCost(input: RecordProjectCostInput): Promise<BrainWriteResult> {
  const supabase = getSupabaseClient();
  const clientId = await resolveExistingClientId(supabase, input.client_id);

  const { data, error } = await supabase
    .from('hat3x_project_costs')
    .insert({
      project_id: input.project_id,
      client_id: clientId,
      amount: input.amount,
      category: input.category,
      description: input.description,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      vendor: input.vendor ?? null,
      notes: input.notes ?? null,
    })
    .select('id, project_id, amount')
    .single();

  if (error) throw new Error(error.message);
  const row = data as { id: string; project_id: string; amount: number };
  return { table: 'hat3x_project_costs', id: row.id, summary: `${row.project_id}: -${row.amount} EUR` };
}

export async function addCompanyMemory(input: AddCompanyMemoryInput): Promise<BrainWriteResult> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_company_memory')
    .insert({
      scope: input.scope ?? 'company',
      entity_id: input.entity_id ?? null,
      title: input.title,
      content: input.content,
      source: input.source ?? 'jarvis',
      importance: input.importance ?? 3,
      active: true,
    })
    .select('id, title')
    .single();

  if (error) throw new Error(error.message);
  const row = data as { id: string; title: string };
  return { table: 'hat3x_company_memory', id: row.id, summary: row.title };
}
