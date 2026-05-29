import { Command } from "commander"
import { runNueva } from "./commands/nueva.js"
import { runStatus } from "./commands/status.js"

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

  return program
}
