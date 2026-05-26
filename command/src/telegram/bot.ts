import { Bot } from "grammy"
import {
  handleStatus,
  handleNuevo,
  handleCheckpoints,
  handlePlan,
  handleAyuda,
  createHandleAprender,
} from "./handlers/commands.js"
import {
  handleApproveCallback,
  handleRejectCallback,
  handleAprobarCommand,
  handleRechazarCommand,
} from "./handlers/callbacks.js"
import { NotificationSender } from "./notifications/sender.js"
import { createGlobalSubscriber } from "../state-bus/global-subscriber.js"

export function createBot(): Bot {
  const token = process.env["TELEGRAM_BOT_TOKEN"]
  if (token == null) throw new Error("TELEGRAM_BOT_TOKEN is not set")

  const JOSE_CHAT_ID = Number(process.env["TELEGRAM_JOSE_CHAT_ID"])
  if (isNaN(JOSE_CHAT_ID)) throw new Error("TELEGRAM_JOSE_CHAT_ID is not set or not a number")

  const bot = new Bot(token)

  // Private guard — only Jose can use this bot
  bot.use(async (ctx, next) => {
    if (ctx.chat?.id !== JOSE_CHAT_ID) {
      await ctx.reply("⛔ Bot privado de HAT3X.")
      return
    }
    await next()
  })

  bot.command("start", handleAyuda)
  bot.command("ayuda", handleAyuda)
  bot.command("status", handleStatus)
  bot.command("nuevo", handleNuevo)
  bot.command("checkpoints", handleCheckpoints)
  bot.command("plan", handlePlan)
  bot.command("aprobar", handleAprobarCommand)
  bot.command("rechazar", handleRechazarCommand)

  bot.callbackQuery(/^aprobar:/, async (ctx) => {
    const checkpointId = ctx.callbackQuery.data.replace("aprobar:", "")
    await handleApproveCallback(ctx, checkpointId)
  })

  bot.callbackQuery(/^rechazar:/, async (ctx) => {
    const checkpointId = ctx.callbackQuery.data.replace("rechazar:", "")
    await handleRejectCallback(ctx, checkpointId)
  })

  return bot
}

export function createNotificationSender(bot: Bot): NotificationSender {
  return new NotificationSender(bot)
}

export function startGlobalSubscriber(bot: Bot): ReturnType<typeof createGlobalSubscriber> {
  const sender = createNotificationSender(bot)
  return createGlobalSubscriber(sender)
}

export function wireLearnCommand(bot: Bot, sender: NotificationSender): void {
  bot.command("aprender", createHandleAprender(sender))
}
