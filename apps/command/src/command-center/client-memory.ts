import { getSupabaseClient } from "../database/client.js"
import type { ClientMemory } from "../types.js"

export async function loadClientMemory(clientId: string): Promise<ClientMemory | null> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_clients")
    .select("*")
    .eq("id", clientId)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(`Failed to load client memory: ${error.message}`)
  }

  return {
    id: data.id,
    name: data.name,
    sector: data.sector,
    previousProjects: data.previous_projects ?? [],
    notes: data.notes,
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
  if (error) throw new Error(`Failed to upsert client: ${error.message}`)
}
