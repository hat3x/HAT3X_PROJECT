// Genera capability-map/roster.yaml escaneando agents/ (los ~183 agentes reales).
// Uso: npx tsx scripts/generate-roster.ts
import { readdirSync, statSync, existsSync, writeFileSync, readFileSync } from "node:fs"
import { join, resolve, relative } from "node:path"
import * as yaml from "js-yaml"
import type { Vertical } from "../src/types.js"
import type { Roster, RosterAgent } from "../src/intelligence/capability-map/roster.js"

const AGENTS_ROOT = resolve(process.cwd(), "..", "..", "agents")
const OUT_PATH = resolve(process.cwd(), "capability-map", "roster.yaml")
const REPO_ROOT = resolve(process.cwd(), "..", "..")

// Carpetas raíz de agents/ que son verticales directas del sistema
const DIRECT_VERTICALS = new Set(["automatizaciones", "chatbots", "voz", "webs-apps"])

// Inferencia de verticales adicionales por keywords del nombre del agente
const KEYWORD_VERTICALS: Array<[RegExp, Vertical]> = [
  [/test|qa\b|quality/, "testing"],
  [/secur|pentest|complian|privacy/, "security"],
  [/database|sql|supabase|data-engineer|etl/, "database"],
  [/deploy|devops|infra|release|ci-cd|cicd/, "deployment"],
  [/doc(s|ument)|writer|content|copy/, "documentation"],
  [/crm|sales|hubspot|pipedrive|lead/, "crm"],
  [/calendar|booking|schedul/, "calendar"],
  [/github|git-|repo/, "github"],
  [/chatbot|whatsapp|telegram|rag/, "chatbots"],
  [/voice|voz|retell|elevenlabs|phone|call/, "voz"],
  [/n8n|automat|zapier|workflow|integration/, "automatizaciones"],
  [/web|frontend|backend|fullstack|ui|ux|design|app|mobile|api|architect|engineer/, "webs-apps"],
]

const STOPWORDS = new Set([
  "the", "and", "for", "with", "specialist", "expert", "pro", "sub", "agent", "agente",
  "you", "your", "are", "que", "los", "las", "del", "para", "una", "este", "esta",
  "when", "use", "this", "from", "have", "will", "should", "must", "can", "not",
  "name", "description", "tools", "read", "write", "edit", "bash", "grep", "glob",
])

function keywordsFromId(id: string): string[] {
  const parts = id.toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length > 1 && !STOPWORDS.has(p))
  return [...new Set(parts)]
}

// Keywords extra desde la cabecera del CLAUDE.md del agente (título + descripción):
// las 12 palabras significativas más frecuentes de las primeras 15 líneas.
function keywordsFromConfig(path: string): string[] {
  try {
    const head = readFileSync(path, "utf8").split("\n").slice(0, 15).join(" ")
    const counts = new Map<string, number>()
    for (const w of head.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)) {
      if (w.length < 4 || STOPWORDS.has(w)) continue
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w)
  } catch {
    return []
  }
}

function verticalsFor(id: string, folder: string): Vertical[] {
  const verticals = new Set<Vertical>()
  if (DIRECT_VERTICALS.has(folder)) verticals.add(folder as Vertical)
  for (const [re, v] of KEYWORD_VERTICALS) {
    if (re.test(id)) verticals.add(v)
  }
  // Agentes de operaciones sin match: comunicación/documentación por defecto
  if (verticals.size === 0) verticals.add("documentation")
  return [...verticals]
}

function scan(): RosterAgent[] {
  const agents: RosterAgent[] = []
  for (const folder of readdirSync(AGENTS_ROOT)) {
    const subagentesDir = join(AGENTS_ROOT, folder, "subagentes")
    if (!existsSync(subagentesDir)) continue
    for (const entry of readdirSync(subagentesDir)) {
      const full = join(subagentesDir, entry)
      let id: string
      let configPath: string
      if (statSync(full).isDirectory()) {
        const claude = join(full, "CLAUDE.md")
        if (!existsSync(claude)) continue
        id = entry
        configPath = relative(REPO_ROOT, claude).replace(/\\/g, "/")
      } else if (entry.endsWith(".md")) {
        id = entry.slice(0, -3)
        configPath = relative(REPO_ROOT, full).replace(/\\/g, "/")
      } else {
        continue
      }
      const keywords = [...new Set([...keywordsFromId(id), ...keywordsFromConfig(join(REPO_ROOT, configPath))])]
      agents.push({ id, configPath, verticals: verticalsFor(id, folder), keywords })
    }
  }
  return agents
}

const agents = scan()
const roster: Roster = { agents }
writeFileSync(OUT_PATH, yaml.dump(roster, { lineWidth: 200 }))

const byVertical = new Map<string, number>()
for (const a of agents) for (const v of a.verticals) byVertical.set(v, (byVertical.get(v) ?? 0) + 1)
console.log(`Roster generado: ${agents.length} agentes → ${relative(process.cwd(), OUT_PATH)}`)
for (const [v, n] of [...byVertical.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v}: ${n}`)
