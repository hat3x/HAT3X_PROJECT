import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as yaml from "js-yaml"
import type { Subtask, Vertical } from "../../types.js"

export interface RosterAgent {
  id: string
  configPath: string
  verticals: Vertical[]
  keywords: string[]
}

export interface Roster {
  agents: RosterAgent[]
}

export interface RosterSelection {
  agentId: string
  score: number
  rationale: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROSTER_PATH = join(__dirname, "../../../capability-map/roster.yaml")

let _cache: Roster | null | undefined

export async function loadRoster(): Promise<Roster | null> {
  if (_cache !== undefined) return _cache
  try {
    const content = await readFile(ROSTER_PATH, "utf-8")
    _cache = yaml.load(content) as Roster
  } catch {
    _cache = null
  }
  return _cache
}

export function resetRosterCache(): void {
  _cache = undefined
}

// Las órdenes llegan en español; los agentes están definidos en inglés.
const ES_EN: Record<string, string[]> = {
  diseno: ["design"], disenar: ["design"], maqueta: ["wireframe", "layout"],
  prueba: ["test"], pruebas: ["test", "testing"], calidad: ["quality", "qa"],
  seguridad: ["security"], auditoria: ["audit"],
  contenido: ["content"], copy: ["copy", "content"], texto: ["content", "copy"], escribir: ["write", "writer"],
  reserva: ["booking"], reservas: ["booking"], cita: ["booking", "calendar"], citas: ["booking", "calendar"],
  pago: ["payment"], pagos: ["payment"], tienda: ["shop", "ecommerce"],
  correo: ["email"], flujo: ["workflow", "flow"], flujos: ["workflow"],
  desplegar: ["deploy"], despliegue: ["deploy"], base: ["database"], datos: ["data", "database"],
  ventas: ["sales"], marketing: ["marketing"], marca: ["brand"],
  voz: ["voice"], llamada: ["call", "phone"], llamadas: ["call", "phone"],
  web: ["web"], pagina: ["page", "web"], landing: ["landing"],
  rendimiento: ["performance"], accesibilidad: ["accessibility"],
}

function tokenize(text: string): string[] {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
  const expanded = base.flatMap((t) => ES_EN[t] ?? [])
  return [...new Set([...base, ...expanded])]
}

// "tests" casa con "test", "writer" con "write" — prefijos con mínimo 3 chars
// (o igualdad exacta para keywords cortas como "qa", "ui").
function matches(token: string, keyword: string): boolean {
  if (token === keyword) return true
  const min = Math.min(token.length, keyword.length)
  if (min < 3) return false
  return token.startsWith(keyword) || keyword.startsWith(token)
}

// Frecuencia de documento por keyword: en cuántos agentes aparece.
// Las keywords raras (df bajo) son distintivas y pesan más (IDF).
const _dfCache = new WeakMap<Roster, Map<string, number>>()

function documentFrequency(roster: Roster): Map<string, number> {
  let df = _dfCache.get(roster)
  if (df !== undefined) return df
  df = new Map()
  for (const agent of roster.agents) {
    for (const k of new Set(agent.keywords)) df.set(k, (df.get(k) ?? 0) + 1)
  }
  _dfCache.set(roster, df)
  return df
}

/**
 * Elige el mejor agente del roster para una subtarea: candidatos de su vertical,
 * puntuados por solape de keywords con la descripción, ponderado por IDF
 * (keywords distintivas > keywords genéricas). Sin señal suficiente → null
 * (el matcher cae al PM de la vertical).
 */
export interface ScoredCandidate {
  agent: RosterAgent
  weighted: number
  matched: string[]
}

/** Top-K candidatos de la vertical, ordenados por score IDF descendente (solo con señal > 0). */
export function topCandidatesForSubtask(subtask: Subtask, roster: Roster, k = 8): ScoredCandidate[] {
  const tokens = tokenize(subtask.description)
  const df = documentFrequency(roster)
  const n = roster.agents.length
  return roster.agents
    .filter((a) => a.verticals.includes(subtask.vertical))
    .map((agent) => {
      const matched = agent.keywords.filter((kw) => tokens.some((t) => matches(t, kw)))
      const weighted = matched.reduce((s, kw) => s + Math.log(1 + n / (df.get(kw) ?? 1)), 0)
      return { agent, weighted, matched }
    })
    .filter((c) => c.weighted > 0)
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, k)
}

export function selectAgentForSubtask(subtask: Subtask, roster: Roster): RosterSelection | null {
  const df = documentFrequency(roster)
  const [best] = topCandidatesForSubtask(subtask, roster, 1)

  // Umbral: o varias coincidencias, o una muy distintiva (df ≤ 3).
  // El Learning Officer afinará esto con datos de proyectos reales.
  if (best === undefined) return null
  const hasDistinctive = best.matched.some((k) => (df.get(k) ?? 99) <= 3)
  if (best.matched.length < 2 && !hasDistinctive) return null

  const score = Math.min(1, 0.5 + best.weighted * 0.05)
  return {
    agentId: best.agent.id,
    score,
    rationale: `${best.agent.id} seleccionado del pool (keywords: ${best.matched.join(", ")})`,
  }
}

export function findRosterAgent(roster: Roster | null, agentId: string): RosterAgent | null {
  return roster?.agents.find((a) => a.id === agentId) ?? null
}
