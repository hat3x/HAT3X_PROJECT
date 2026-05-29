import { readFile, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as yaml from "js-yaml"
import simpleGit from "simple-git"
import { getSupabaseClient } from "../database/client.js"
import type { LearningReport } from "./types.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAP_DIR = join(__dirname, "../../../capability-map")
const REPO_DIR = join(__dirname, "../../../../")

function clamp(value: number): number {
  return Math.min(1.0, Math.max(0.0, value))
}

async function applyDelta(
  vertical: string,
  skill: string,
  delta: number
): Promise<{ before: number; after: number }> {
  const filePath = join(MAP_DIR, `${vertical}.yaml`)
  const content = await readFile(filePath, "utf-8")
  const data = yaml.load(content) as Record<string, unknown>

  const scores = (data["scores"] ?? {}) as Record<string, number>
  const before = scores[skill] ?? 0.5
  const after = clamp(before + delta)
  scores[skill] = after
  data["scores"] = scores

  await writeFile(filePath, yaml.dump(data), "utf-8")
  return { before, after }
}

export async function applyReport(report: LearningReport): Promise<void> {
  const client = getSupabaseClient()
  const git = simpleGit(REPO_DIR)
  const changedFiles: string[] = []

  for (const delta of report.deltas) {
    try {
      const { before, after } = await applyDelta(delta.vertical, delta.skill, delta.delta)
      changedFiles.push(`command/capability-map/${delta.vertical}.yaml`)

      const { error } = await client.from("evolution_log").insert({
        agent_id: null,
        vertical: delta.vertical,
        change_type: "score_adjustment",
        description: delta.reason,
        before_value: { skill: delta.skill, score: before },
        after_value: { skill: delta.skill, score: after },
        applied_by: "learning-officer",
      })

      if (error != null) {
        console.error(`Failed to log evolution for ${delta.skill}:`, error.message)
      }
    } catch (err) {
      console.error(`Failed to apply delta for ${delta.vertical}/${delta.skill}:`, err)
    }
  }

  for (const proposal of report.proposals) {
    const { error } = await client.from("evolution_proposals").insert({
      id: proposal.id,
      description: proposal.description,
      impact: proposal.impact,
      evidence: proposal.evidence,
      status: "pending",
    })

    if (error != null) {
      console.error(`Failed to save proposal ${proposal.id}:`, error.message)
    }
  }

  if (changedFiles.length > 0) {
    await git.add(changedFiles)
    const date = new Date().toISOString().slice(0, 10)
    await git.commit(
      `chore(evolution): learning officer update — ${report.signalCount} señal(es), ${report.deltas.length} ajuste(s) [${date}]`
    )
  }
}
