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
}

const RESTART_DELAY_MS = 5000

const defaultSpawn: SupervisorSpawnFn = (cmd, args) =>
  nodeSpawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" })

export function startSupervisor(services: ServiceSpec[], spawnFn: SupervisorSpawnFn = defaultSpawn): SupervisorHandle {
  let stopped = false
  const restarts = new Map<string, number>()
  const procs = new Map<string, ProcLike>()

  function launch(svc: ServiceSpec): void {
    const proc = spawnFn(svc.cmd, svc.args)
    procs.set(svc.name, proc)
    proc.on("exit", (code) => {
      console.log(`[supervisor] ${svc.name} salió (code ${code})`)
      if (stopped) return
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
  }
}

export const OFFICE_SERVICES: ServiceSpec[] = [
  { name: "server", cmd: "npx", args: ["tsx", "src/server.ts"] },
  { name: "telegram", cmd: "npx", args: ["tsx", "src/telegram/index.ts"] },
  { name: "scheduler", cmd: "npx", args: ["tsx", "src/scheduler/index.ts"] },
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
