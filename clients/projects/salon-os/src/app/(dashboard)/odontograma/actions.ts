"use server";

import { createClient } from "@/lib/supabase/server";
import type { OdontogramFinding, OdontogramFindingInsert } from "@/types/database";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Append-only: inserts one odontogram finding event.
 *
 * Authorization is enforced by RLS (managers_insert_odontogram_findings policy
 * on public.odontogram_findings). If the user lacks manager/owner role the
 * Supabase client returns an RLS violation error which surfaces here as
 * { ok: false, error: "..." }.
 */
export async function addOdontogramFinding(
  input: OdontogramFindingInsert,
): Promise<Result<OdontogramFinding>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("odontogram_findings")
    .insert(input)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}
