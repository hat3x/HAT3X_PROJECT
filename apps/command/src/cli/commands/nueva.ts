import { CommandCenter } from "../../command-center/index.js"
import { formatTask } from "../formatter.js"
import type { ControlMode } from "../../types.js"

interface NuevaOptions { order: string; mode: string | undefined; clientId: string | undefined }

export async function runNueva(options: NuevaOptions): Promise<string> {
  const task = await new CommandCenter().processOrder({
    orderRaw: options.order,
    ...(options.mode !== undefined ? { controlMode: options.mode as ControlMode } : {}),
    ...(options.clientId !== undefined ? { clientId: options.clientId } : {}),
  })
  return formatTask(task)
}
