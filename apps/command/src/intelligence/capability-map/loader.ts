import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as yaml from "js-yaml"
import type { CapabilityMap, CapabilityEntry } from "./types.js"
import type { Vertical } from "../../types.js"

const VERTICALS: Vertical[] = [
  "chatbots", "voz", "webs-apps", "automatizaciones",
  "crm", "calendar", "database", "github",
  "testing", "security", "documentation", "deployment",
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAP_DIR = join(__dirname, "../../../../capability-map")

let _cache: CapabilityMap | null = null

export async function loadCapabilityMap(): Promise<CapabilityMap> {
  if (_cache != null) return _cache

  const entries = await Promise.all(
    VERTICALS.map(async (vertical) => {
      const content = await readFile(join(MAP_DIR, `${vertical}.yaml`), "utf-8")
      const entry = yaml.load(content) as CapabilityEntry
      return [vertical, entry] as const
    })
  )

  _cache = Object.fromEntries(entries) as CapabilityMap
  return _cache
}

export function resetCapabilityMapCache(): void {
  _cache = null
}
