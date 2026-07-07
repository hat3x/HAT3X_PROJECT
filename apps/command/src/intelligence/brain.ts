import { spawn } from "node:child_process"

/**
 * Cerebro de Command sobre Claude Code headless (suscripción, sin coste API).
 * Llamadas cortas de razonamiento: analizar órdenes, elegir agentes.
 * El prompt viaja por stdin (sin problemas de escaping en Windows).
 */
export function askClaude(instructions: string, input: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "text"], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c: Buffer) => { stdout += c.toString() })
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString() })

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`claude headless timeout tras ${timeoutMs}ms`))
    }, timeoutMs)

    child.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`claude headless exit ${code}: ${stderr.trim().slice(-200)}`))
      } else {
        resolve(stdout.trim())
      }
    })

    child.stdin.write(`${instructions}\n\n${input}`)
    child.stdin.end()
  })
}

/** El modelo a veces envuelve el JSON en fences markdown (```json ... ```) */
export function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")
}

/** Proveedor del cerebro: "claude" (default, suscripción) u "openai" (API). */
export function brainProvider(): "claude" | "openai" {
  return process.env["COMMAND_BRAIN"] === "openai" ? "openai" : "claude"
}
