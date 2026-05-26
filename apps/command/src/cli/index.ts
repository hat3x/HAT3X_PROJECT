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
    .action(async (id?: string) => { console.log(await runStatus({ id })) })

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
    .command("aprender")
    .description("Ejecuta el ciclo de aprendizaje del Learning Officer")
    .option("--task <id>", "Analizar solo esta tarea")
    .option("--dry-run", "Simular sin escribir cambios")
    .action(async (opts: { task?: string; dryRun?: boolean }) => {
      try {
        const consoleSender = {
          sendEvolutionReport: async (text: string) => { console.log("\n" + text) },
        }
        await runLearningCycle(consoleSender, { taskId: opts.task, dryRun: opts.dryRun })
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
