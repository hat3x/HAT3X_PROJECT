import { spawn as nodeSpawn } from "node:child_process"

export interface ServiceSpec {
  name: string
  cmd: string
  args: string[]
}

export interface ProcLike {
  on(ev: "exit", cb: (code: number | null) => void): void
  kill(): void
}

export type SupervisorSpawnFn = (cmd: string, args: string[]) => ProcLike

export interface SupervisorHandle {
  stop(): void
  restartCount(name: string): number
  gaveUp(name: string): boolean
}

const RESTART_DELAY_MS = 5000
// Si un servicio muere 5 veces seguidas casi al arrancar (< umbral vivo),
// es un fallo permanente (p. ej. puerto ocupado): dejar de reintentar en bucle.
const MAX_FAST_CRASHES = 5
const HEALTHY_UPTIME_MS = 20_000

const defaultSpawn: SupervisorSpawnFn = (cmd, args) =>
  nodeSpawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" })

export function startSupervisor(services: ServiceSpec[], spawnFn: SupervisorSpawnFn = defaultSpawn): SupervisorHandle {
  let stopped = false
  const restarts = new Map<string, number>()
  const fastCrashes = new Map<string, number>()
  const gaveUp = new Set<string>()
  const procs = new Map<string, ProcLike>()

  function launch(svc: ServiceSpec): void {
    const startedAt = Date.now()
    const proc = spawnFn(svc.cmd, svc.args)
    procs.set(svc.name, proc)
    proc.on("exit", (code) => {
      console.log(`[supervisor] ${svc.name} salió (code ${code})`)
      if (stopped) return

      const uptime = Date.now() - startedAt
      if (uptime < HEALTHY_UPTIME_MS) {
        const n = (fastCrashes.get(svc.name) ?? 0) + 1
        fastCrashes.set(svc.name, n)
        if (n >= MAX_FAST_CRASHES) {
          gaveUp.add(svc.name)
          console.error(
            `[supervisor] ${svc.name} ha fallado ${n} veces al arrancar — ABANDONO. ` +
            `Causa probable: puerto ocupado u otra oficina ya en marcha. ` +
            `Cierra la otra instancia y reinicia la oficina.`
          )
          return
        }
      } else {
        fastCrashes.set(svc.name, 0) // estuvo sano un rato → reset del contador
      }

      setTimeout(() => {
        if (stopped) return
        restarts.set(svc.name, (restarts.get(svc.name) ?? 0) + 1)
        console.log(`[supervisor] reiniciando ${svc.name}...`)
        launch(svc)
      }, RESTART_DELAY_MS)
    })
  }

  for (const svc of services) launch(svc)

  return {
    stop() {
      stopped = true
      for (const p of procs.values()) p.kill()
    },
    restartCount: (name) => restarts.get(name) ?? 0,
    gaveUp: (name) => gaveUp.has(name),
  }
}

// El LearningScheduler arranca dentro del servicio de telegram (telegram/index.ts),
// por eso no es un servicio independiente: como proceso suelto no tiene main y sale al instante.
export const OFFICE_SERVICES: ServiceSpec[] = [
  { name: "server", cmd: "npx", args: ["tsx", "src/server.ts"] },
  { name: "telegram", cmd: "npx", args: ["tsx", "src/telegram/index.ts"] },
]

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("supervisor/index.ts") ?? false
if (isMain) {
  console.log("[supervisor] 🏢 Oficina HAT3X encendida")
  const handle = startSupervisor(OFFICE_SERVICES)
  process.on("SIGINT", () => {
    handle.stop()
    process.exit(0)
  })
}
