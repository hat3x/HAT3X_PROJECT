import "dotenv/config"
import { createServer } from "node:http"
import { runIntelligencePipeline } from "./intelligence/pipeline.js"
import { previewExecutionPlan } from "./intelligence/preview.js"
import { executeTask } from "./executor/index.js"

const PORT = parseInt(process.env["COMMAND_SERVER_PORT"] ?? "3002", 10)

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/preview") {
    let body = ""
    req.on("data", (chunk: Buffer) => { body += chunk.toString() })
    req.on("end", () => {
      let parsed: { orderRaw?: string; clientId?: string | null }
      try {
        parsed = JSON.parse(body) as { orderRaw?: string; clientId?: string | null }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid JSON" }))
        return
      }

      if (!parsed.orderRaw) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "orderRaw is required" }))
        return
      }

      previewExecutionPlan({ orderRaw: parsed.orderRaw, clientId: parsed.clientId ?? null })
        .then((result) => {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: true, ...result }))
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[preview] ${message}`)
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: message }))
        })
    })
    return
  }

  if (req.method === "POST" && req.url === "/api/process") {
    let body = ""
    req.on("data", (chunk: Buffer) => { body += chunk.toString() })
    req.on("end", () => {
      let taskId: string | undefined
      try {
        const parsed = JSON.parse(body) as { taskId?: string }
        taskId = parsed.taskId
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid JSON" }))
        return
      }

      if (!taskId) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "taskId is required" }))
        return
      }

      runIntelligencePipeline(taskId)
        .then((result) => {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: true, ...result }))
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[pipeline] ${taskId}: ${message}`)
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: message }))
        })
    })
    return
  }

  if (req.method === "POST" && req.url === "/api/execute") {
    let body = ""
    req.on("data", (chunk: Buffer) => { body += chunk.toString() })
    req.on("end", () => {
      let taskId: string | undefined
      try {
        taskId = (JSON.parse(body) as { taskId?: string }).taskId
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid JSON" }))
        return
      }
      if (!taskId) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "taskId is required" }))
        return
      }
      executeTask(taskId)
        .then((result) => {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: true, ...result }))
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[execute] ${taskId}: ${message}`)
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: message }))
        })
    })
    return
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  res.writeHead(404)
  res.end()
})

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[command-server] El puerto ${PORT} ya está en uso — ya hay otra oficina en marcha. No arranco un duplicado.`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, () => {
  console.log(`[command-server] listening on port ${PORT}`)
})
