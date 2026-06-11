import { getServerClient } from "@/lib/supabase"
import { impactColor, formatDate } from "@/lib/dashboard/formatters"
import type { EvolutionEntry, EvolutionProposal } from "@/lib/dashboard/types"

export default async function EvolutionPage(): Promise<JSX.Element> {
  const supabase = getServerClient()

  const [logRes, proposalsRes] = await Promise.all([
    supabase
      .from("evolution_log")
      .select("id, project_id, agent_id, vertical, change_type, description, applied_at, applied_by")
      .order("applied_at", { ascending: false })
      .limit(30),
    supabase
      .from("evolution_proposals")
      .select("id, description, impact, status, feedback, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const entries = (logRes.data ?? []) as EvolutionEntry[]
  const proposals = (proposalsRes.data ?? []) as EvolutionProposal[]
  const pendingProposals = proposals.filter((p) => p.status === "pending")

  return (
    <div className="space-y-8">
      <h1 className="text-text-primary text-2xl font-semibold">Evolución</h1>

      {pendingProposals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-text-primary font-medium">Propuestas pendientes ({pendingProposals.length})</h2>
          <div className="space-y-3">
            {pendingProposals.map((p) => (
              <div key={p.id} className="bg-surface-2 border border-border-subtle rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-xs text-text-muted">{p.id}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${impactColor(p.impact)}`}>
                    {p.impact}
                  </span>
                </div>
                <p className="text-text-primary text-sm">{p.description}</p>
                <p className="text-text-muted text-xs mt-2">Usa /aprobar_prop {p.id} en Telegram para aprobar</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-text-primary font-medium">Historial de cambios ({entries.length})</h2>
        {entries.length === 0 ? (
          <p className="text-text-muted text-sm py-4">Sin cambios registrados todavía</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-surface-2 border border-border-subtle rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-purple-light text-xs">{entry.change_type}</span>
                  <span className="text-text-muted text-xs">{formatDate(entry.applied_at)}</span>
                </div>
                <p className="text-text-secondary">{entry.description}</p>
                {entry.vertical != null && (
                  <p className="text-text-muted text-xs mt-1">Vertical: {entry.vertical}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
