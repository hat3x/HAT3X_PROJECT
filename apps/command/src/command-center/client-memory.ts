import { getSupabaseClient } from "../database/client.js"
import type { ClientMemory } from "../types.js"

export async function loadClientMemory(clientId: string): Promise<ClientMemory | null> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_clients")
    .select("*")
    .eq("id", clientId)
    .single()

  if (error != null) {
    if (error.code === "PGRST116") return null
    throw new Error(`Failed to load client memory: ${error.message}`)
  }

  if (data == null) return null

  const row = data as Record<string, unknown>

  if (typeof row["id"] !== "string" || typeof row["name"] !== "string") {
    throw new Error(`Invalid client record from DB: missing id or name`)
  }

  return {
    id: row["id"],
    name: row["name"],
    sector: typeof row["sector"] === "string" ? row["sector"] : null,
    previousProjects: Array.isArray(row["previous_projects"])
      ? (row["previous_projects"] as string[])
      : [],
    notes: typeof row["notes"] === "string" ? row["notes"] : null,
  }
}

interface UpsertClientInput {
  id: string
  name: string
  sector: string | null
  previousProjects: string[]
  notes: string | null
}

export async function upsertClient(input: UpsertClientInput): Promise<void> {
  const { error } = await getSupabaseClient().from("hat3x_clients").upsert({
    id: input.id,
    name: input.name,
    sector: input.sector,
    previous_projects: input.previousProjects,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  })
  if (error != null) throw new Error(`Failed to upsert client: ${error.message}`)
}
