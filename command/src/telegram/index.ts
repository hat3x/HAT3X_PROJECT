import { config } from "dotenv"
config({ path: ".env" })

import { createBot, startGlobalSubscriber, wireLearnCommand } from "./bot.js"
import { NotificationSender } from "./notifications/sender.js"
import { startLearningScheduler } from "../scheduler/index.js"

async function startBot(): Promise<void> {
  const bot = createBot()
  const sender = new NotificationSender(bot)
  const globalSub = startGlobalSubscriber(bot)

  wireLearnCommand(bot, sender)
  startLearningScheduler(sender)

  await globalSub.subscribe()
  console.log("HAT3X Command — Global subscriber activo")

  process.once("SIGINT", async () => {
    console.log("Parando bot...")
    await globalSub.unsubscribe()
    await bot.stop()
  })
  process.once("SIGTERM", async () => {
    await globalSub.unsubscribe()
    await bot.stop()
  })

  console.log("HAT3X Command Bot — Iniciando...")
  await bot.start({
    onStart: () => console.log("✅ Bot activo. Envía /ayuda en Telegram."),
  })
}

void startBot().catch((err) => {
  console.error("Bot error:", err)
  process.exit(1)
})
