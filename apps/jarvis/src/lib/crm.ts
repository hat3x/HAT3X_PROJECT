import { getSupabaseClient } from '@/lib/supabase';

export type ProjectStatus   = 'proposal' | 'active' | 'delivered' | 'invoiced' | 'paid' | 'cancelled';
export type ProjectPhase    = 'discovery' | 'design' | 'development' | 'review' | 'launch';
export type PMVertical      = 'voz' | 'chatbots' | 'webs-apps' | 'automatizaciones' | 'operaciones';
export type FinancialType   = 'income' | 'expense';
export type FinancialStatus = 'pending' | 'invoiced' | 'paid' | 'cancelled';

export interface CRMClient {
  id: string;
  name: string;
  sector: string | null;
  notes: string | null;
  previous_projects: string[];
}

export interface CRMProject {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  phase: ProjectPhase | null;
  pm_vertical: PMVertical | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  client?: Pick<CRMClient, 'id' | 'name' | 'sector'> | null;
}

export interface ProjectFinancial {
  id: string;
  project_id: string;
  client_id: string | null;
  type: FinancialType;
  concept: string;
  amount: number;
  date: string;
  status: FinancialStatus;
  invoice_ref: string | null;
  notes: string | null;
  created_at: string;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  client_id: string | null;
  content: string;
  source: 'jarvis' | 'manual' | 'telegram';
  created_at: string;
}

export interface ProjectFinancialSummary {
  totalIncome: number;
  totalExpense: number;
  margin: number;
  pending: number;
  paid: number;
}

export interface CRMKPIs {
  totalProjects: number;
  activeProjects: number;
  totalClients: number;
  pendingRevenue: number;
  paidRevenue: number;
  totalExpenses: number;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(status?: ProjectStatus): Promise<CRMProject[]> {
  let q = getSupabaseClient()
    .from('hat3x_projects')
    .select('*, client:hat3x_clients(id, name, sector)')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CRMProject[];
}

export async function getProject(id: string): Promise<CRMProject | null> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_projects')
    .select('*, client:hat3x_clients(id, name, sector)')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as CRMProject;
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<CRMProject, 'id' | 'created_at' | 'client'>>
): Promise<CRMProject> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_projects')
    .update(patch)
    .eq('id', id)
    .select('*, client:hat3x_clients(id, name, sector)')
    .single();
  if (error) throw new Error(error.message);
  return data as CRMProject;
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function listCRMClients(): Promise<CRMClient[]> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_clients')
    .select('id, name, sector, notes, previous_projects')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as CRMClient[];
}

export async function getCRMClient(id: string): Promise<CRMClient | null> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_clients')
    .select('id, name, sector, notes, previous_projects')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as CRMClient;
}

// ─── Financials ───────────────────────────────────────────────────────────────

export async function listProjectFinancials(projectId: string): Promise<ProjectFinancial[]> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_project_financials')
    .select('*')
    .eq('project_id', projectId)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectFinancial[];
}

export async function getProjectFinancialSummary(projectId: string): Promise<ProjectFinancialSummary> {
  const financials = await listProjectFinancials(projectId);
  const totalIncome  = financials.filter(f => f.type === 'income').reduce((s, f) => s + f.amount, 0);
  const totalExpense = financials.filter(f => f.type === 'expense').reduce((s, f) => s + f.amount, 0);
  const paid    = financials.filter(f => f.type === 'income' && f.status === 'paid').reduce((s, f) => s + f.amount, 0);
  const pending = financials.filter(f => f.type === 'income' && f.status !== 'paid' && f.status !== 'cancelled').reduce((s, f) => s + f.amount, 0);
  return { totalIncome, totalExpense, margin: totalIncome - totalExpense, pending, paid };
}

export async function getAllFinancials(): Promise<ProjectFinancial[]> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_project_financials')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectFinancial[];
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function listProjectNotes(projectId: string): Promise<ProjectNote[]> {
  const { data, error } = await getSupabaseClient()
    .from('hat3x_project_notes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectNote[];
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getCRMKPIs(): Promise<CRMKPIs> {
  const [projects, clients, financials] = await Promise.all([
    listProjects(),
    listCRMClients(),
    getAllFinancials(),
  ]);
  return {
    totalProjects:   projects.length,
    activeProjects:  projects.filter(p => p.status === 'active').length,
    totalClients:    clients.length,
    pendingRevenue:  financials.filter(f => f.type === 'income' && f.status !== 'paid' && f.status !== 'cancelled').reduce((s, f) => s + f.amount, 0),
    paidRevenue:     financials.filter(f => f.type === 'income' && f.status === 'paid').reduce((s, f) => s + f.amount, 0),
    totalExpenses:   financials.filter(f => f.type === 'expense').reduce((s, f) => s + f.amount, 0),
  };
}
