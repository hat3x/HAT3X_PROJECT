// ─── Typed Supabase query functions ────────────────────────────────────────
// Centralized data access layer. All direct supabase calls go through here.
// Handles URL normalization, duplicate detection, and typed returns.
import { supabase } from "@/integrations/supabase/client";
import { normalizeUrl } from "@/lib/utils";
import type { LeadStatus } from "@/types/domain";

// ── Businesses ─────────────────────────────────────────────────────────────

export async function getBusinessById(id: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getBusinesses(filters?: {
  status?: LeadStatus;
  sector?: string;
  search?: string;
}) {
  let query = supabase
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.sector) query = query.eq("sector", filters.sector);
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,url.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Finds an existing business by normalized URL.
 * Returns null if not found.
 */
export async function findBusinessByUrl(rawUrl: string) {
  const normalized = normalizeUrl(rawUrl);
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("url_normalized", normalized)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Creates a new business. Throws a DuplicateUrlError if the URL already exists.
 */
export async function createBusiness(payload: {
  url: string;
  name: string;
  sector?: string | null;
}) {
  // Check for duplicates before insertion (user-friendly error before DB constraint fires)
  const existing = await findBusinessByUrl(payload.url);
  if (existing) {
    throw new DuplicateUrlError(existing.id, existing.name);
  }

  const { data, error } = await supabase
    .from("businesses")
    .insert({
      url: payload.url.trim(),
      name: payload.name.trim(),
      sector: payload.sector ?? null,
      status: "nuevo" as LeadStatus,
    })
    .select()
    .single();

  if (error) {
    // DB unique constraint on url_normalized (fallback)
    if (error.code === "23505") {
      throw new DuplicateUrlError(null, payload.name);
    }
    throw error;
  }
  return data;
}

export async function deleteBusiness(id: string) {
  const { error } = await supabase
    .from("businesses")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function updateBusinessStatus(id: string, status: LeadStatus) {
  const { error } = await supabase
    .from("businesses")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateBusiness(
  id: string,
  payload: Partial<{
    name: string;
    sector: string | null;
    sub_sector: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    whatsapp: string | null;
    status: LeadStatus;
  }>
) {
  const { error } = await supabase
    .from("businesses")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Business Analysis ──────────────────────────────────────────────────────

export async function getAnalysisByBusinessId(businessId: string) {
  const { data, error } = await supabase
    .from("business_analysis")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ── Demo Generations ───────────────────────────────────────────────────────

export async function getDemosByBusinessId(businessId: string) {
  const { data, error } = await supabase
    .from("demo_generations")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLatestDemoByBusinessId(businessId: string) {
  const { data, error } = await supabase
    .from("demo_generations")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function setDemoFavorite(demoId: string, favorite: boolean) {
  const { error } = await supabase
    .from("demo_generations")
    .update({ favorite })
    .eq("id", demoId);
  if (error) throw error;
}

// ── Outreach Emails ────────────────────────────────────────────────────────

export async function getEmailsByBusinessId(businessId: string) {
  const { data, error } = await supabase
    .from("outreach_emails")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveEmailDraft(
  id: string,
  payload: {
    subject: string;
    body: string;
    recipient_email: string;
    edited_before_send: boolean;
  }
) {
  const { error } = await supabase
    .from("outreach_emails")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function markEmailSent(
  id: string,
  payload: {
    subject: string;
    body: string;
    recipient_email: string;
    edited_before_send: boolean;
  }
) {
  const { error } = await supabase
    .from("outreach_emails")
    .update({
      ...payload,
      send_status: "enviado",
      sent_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

// ── Lead Activity ──────────────────────────────────────────────────────────

export async function getActivityByBusinessId(businessId: string) {
  const { data, error } = await supabase
    .from("lead_activity")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function logActivity(payload: {
  business_id: string;
  activity_type: string;
  activity_note?: string | null;
  metadata_json?: Record<string, unknown> | null;
}) {
  const { error } = await supabase.from("lead_activity").insert(payload);
  if (error) throw error;
}

// ── Dashboard stats ────────────────────────────────────────────────────────

export async function getLeadStats() {
  const { data, error } = await supabase
    .from("lead_stats")
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ── Custom errors ──────────────────────────────────────────────────────────

export class DuplicateUrlError extends Error {
  /** The existing business id, if available */
  readonly existingId: string | null;
  readonly existingName: string;

  constructor(existingId: string | null, existingName: string) {
    super(`Ya existe un negocio con esta URL: ${existingName}`);
    this.name = "DuplicateUrlError";
    this.existingId = existingId;
    this.existingName = existingName;
  }
}
