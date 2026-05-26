import cron from "node-cron"
import type { NotificationSender } from "../telegram/notifications/sender.js"
import { runLearningCycle } from "../learning-officer/index.js"

export function startLearningScheduler(sender: NotificationSender): void {
  const schedule = process.env["LEARNING_SCHEDULE"] ?? "0 9 * * 1"
  cron.schedule(schedule, async () => {
    try {
      await runLearningCycle(sender)
    } catch (err) {
      console.error("[LearningScheduler] Error:", err instanceof Error ? err.message : String(err))
    }
  })
  console.log(`📅 LearningScheduler activo — schedule: ${schedule}`)
}
