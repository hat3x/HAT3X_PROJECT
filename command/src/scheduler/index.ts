import cron from "node-cron"
import type { NotificationSender } from "../telegram/notifications/sender.js"
import { runLearningCycle } from "../learning-officer/index.js"

const DEFAULT_SCHEDULE = "0 9 * * 1"

export function startLearningScheduler(sender: NotificationSender): void {
  const envSchedule = process.env["LEARNING_SCHEDULE"]
  const schedule = envSchedule ?? DEFAULT_SCHEDULE

  try {
    cron.schedule(schedule, async () => {
      try {
        await runLearningCycle(sender)
      } catch (err) {
        console.error("[LearningScheduler] Error:", err instanceof Error ? err.message : String(err))
      }
    })
    console.log(`📅 LearningScheduler activo — schedule: ${schedule}`)
  } catch {
    console.error(`[LearningScheduler] Expresión inválida: "${schedule}". Usando default: ${DEFAULT_SCHEDULE}`)
    cron.schedule(DEFAULT_SCHEDULE, async () => {
      try {
        await runLearningCycle(sender)
      } catch (err) {
        console.error("[LearningScheduler] Error:", err instanceof Error ? err.message : String(err))
      }
    })
    console.log(`📅 LearningScheduler activo — schedule: ${DEFAULT_SCHEDULE} (fallback)`)
  }
}
