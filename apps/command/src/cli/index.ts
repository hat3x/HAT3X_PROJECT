import { Command } from "commander"
import { runNueva } from "./commands/nueva.js"
import { runStatus } from "./commands/status.js"
import { runPlan } from "./commands/plan.js"
import { fetchProgressData, formatProgress } from "./commands/progress.js"
import { runLearningCycle } from "../learning-officer/index.js"

export function buildCli(): Command {
  const program = new Command()
  program.name("oficina").description("HAT3X Command — Oficina Virtual Autónoma").version("0.1.0")

  program
    .command("nueva <orden>")
    .description("Lanzar nueva tarea")
    .option("--modo <modo>", "Modo: autopilot|phased|supervised")
    .option("--cliente <id>", "ID del cliente")
    .action(async (orden: string, opts: { modo?: string; cliente?: string }) => {
      console.log(await runNueva({ order: orden, mode: opts.modo, clientId: opts.cliente }))
    })

  program
    .command("status [id]")
    .description("Ver estado de proyectos")
    .action(async (id?: string) => { console.log(await runStatus(id !== undefined ? { id } : {})) })

  program
    .command("plan <id>")
    .description("Ver plan de ejecucion de una tarea")
    .action(async (id: string) => {
      try {
        await runPlan(id)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })

  program
    .command("progress <id>")
    .description("Muestra el progreso de una tarea: reuniones abiertas y checkpoints pendientes")
    .action(async (id: string) => {
      try {
        const data = await fetchProgressData(id)
        console.log(formatProgress(data))
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })

  program
    .command("start")
    .description("Enciende la oficina (server + telegram + scheduler)")
    .action(async () => {
      const { startSupervisor, OFFICE_SERVICES } = await import("../supervisor/index.js")
      console.log("🏢 Oficina HAT3X encendida — Ctrl+C para apagar")
      const handle = startSupervisor(OFFICE_SERVICES)
      process.on("SIGINT", () => {
        handle.stop()
        process.exit(0)
      })
    })

  program
    .command("orden [texto]")
    .description("Ciclo completo: crea la tarea, genera el plan y la ejecuta con agentes")
    .option("--cliente <id>", "Cliente asociado")
    .option("--modo <modo>", "autopilot | phased | supervised")
    .option("--orden-file <path>", "Lee la orden desde un fichero (recomendado para órdenes largas: evita romper el parseo de argumentos)")
    .action(async (texto: string | undefined, opts: { cliente?: string; modo?: string; ordenFile?: string }) => {
      try {
        const { readFileSync } = await import("node:fs")
        const orderRaw = opts.ordenFile !== undefined ? readFileSync(opts.ordenFile, "utf8") : texto
        if (orderRaw === undefined || orderRaw.trim().length === 0) {
          throw new Error("Falta la orden: pásala como argumento o con --orden-file <path>")
        }
        const { CommandCenter } = await import("../command-center/index.js")
        const { runIntelligencePipeline } = await import("../intelligence/pipeline.js")
        const { executeTask } = await import("../executor/index.js")
        const task = await new CommandCenter().processOrder({
          orderRaw,
          ...(opts.modo !== undefined ? { controlMode: opts.modo as import("../types.js").ControlMode } : {}),
          ...(opts.cliente !== undefined ? { clientId: opts.cliente } : {}),
        })
        console.log(`📋 Tarea ${task.id} creada. Planificando (cerebro: ${process.env["COMMAND_BRAIN"] === "openai" ? "OpenAI" : "Claude"})...`)
        const plan = await runIntelligencePipeline(task.id)
        console.log(`🧠 Plan: ${plan.subtaskCount} subtareas · ${plan.phaseCount} fases · ~${plan.totalEstimatedHours}h · riesgo ${plan.riskLevel}`)
        console.log(`🏢 Ejecutando con agentes (máx ${process.env["MAX_CONCURRENT_AGENTS"] ?? 4} en paralelo)...`)
        const r = await executeTask(task.id)
        console.log(`✅ Completadas: ${r.completed.length} · ❌ Fallidas: ${r.failed.length} · 🔔 Checkpoints: ${r.checkpoints}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })

  program
    .command("ejecutar <id>")
    .description("Ejecuta el plan de una tarea con agentes headless")
    .action(async (id: string) => {
      try {
        const { executeTask } = await import("../executor/index.js")
        const r = await executeTask(id)
        console.log(`Completadas: ${r.completed.length} · Fallidas: ${r.failed.length} · Checkpoints: ${r.checkpoints}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })

  program
    .command("aprender")
    .description("Ejecuta el ciclo de aprendizaje del Learning Officer")
    .option("--task <id>", "Analizar solo esta tarea")
    .option("--dry-run", "Simular sin escribir cambios")
    .action(async (opts: { task?: string; dryRun?: boolean }) => {
      try {
        const consoleSender = {
          sendEvolutionReport: async (text: string) => { console.log("\n" + text) },
        }
        await runLearningCycle(consoleSender, {
          ...(opts.task !== undefined ? { taskId: opts.task } : {}),
          ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
        })
        if (opts.dryRun === true) {
          console.log("\n[DRY RUN — no changes applied]")
        }
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })

  return program
}
